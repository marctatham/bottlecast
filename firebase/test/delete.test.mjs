import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  DAY, HOUR, M1, M2, WRITER, admin, anonymiseWrite, castWrites, commit, findWrites, google, guest,
  keepWrites, reportWrites, seed, seedBottle, seedDeletion, seedHold, seedKept, seedProfile, seedTally,
  throwBackWrites, utcDate,
} from './support.mjs';

describe('the deletion tombstone', () => {
  it('lets a Google account mark itself as being deleted, once, and read it', async () => {
    const db = google('gail');
    await assertSucceeds(setDoc(doc(db, 'deletions', 'gail'), { createdAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(db, 'deletions', 'gail')));
    await assertFails(setDoc(doc(db, 'deletions', 'gail'), { createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'deletions', 'gail')));
  });

  it("refuses a guest, someone else's, a client time or an extra key", async () => {
    await assertFails(setDoc(doc(guest('gus'), 'deletions', 'gus'), { createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(google('gail'), 'deletions', 'fern'), { createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(google('gail'), 'deletions', 'gail'), { createdAt: Timestamp.now() }));
    await assertFails(setDoc(doc(google('gail'), 'deletions', 'gail'), { createdAt: serverTimestamp(), why: 'x' }));
    await seedDeletion('gail');
    await assertFails(getDoc(doc(google('fern'), 'deletions', 'gail')));
  });

  it("stops an account being deleted from casting or finding", async () => {
    await seedDeletion('gail');
    await assertFails(commit(google('gail'), castWrites('gail', M1)));
    await seedBottle(M2);
    await assertFails(commit(google('gail'), findWrites('gail', M2)));
  });
});

describe("deleting an account's records", () => {
  async function seedRecords() {
    await seedHold(M1, 'gail', 8 * DAY);
    await seedProfile('gail', { penName: 'Driftwood', termsVersion: 1 });
    await seedTally('gail', { date: utcDate(), count: 1, messageId: M2 });
    await seed((db) => setDoc(doc(db, 'streakDays', `gail_${utcDate()}`), { uid: 'gail', date: utcDate(), calm: true }));
  }

  function records(db) {
    const date = utcDate(Date.now() - 8 * DAY);
    return [
      doc(db, 'finds', `${M1}_gail`),
      doc(db, 'daily', `gail_${date}`),
      doc(db, 'castTally', 'gail'),
      doc(db, 'streakDays', `gail_${utcDate()}`),
      doc(db, 'users', 'gail'),
    ];
  }

  it('refuses deleting them without the tombstone', async () => {
    await seedRecords();
    for (const ref of records(google('gail'))) await assertFails(deleteDoc(ref));
  });

  it('lets the account delete them once it has the tombstone', async () => {
    await seedRecords();
    await seedDeletion('gail');
    for (const ref of records(google('gail'))) await assertSucceeds(deleteDoc(ref));
  });

  it('lets the app delete them ten to a batch, each delete reading the tombstone', async () => {
    await seedDeletion('gail');
    const dates = Array.from({ length: 10 }, (_, day) => utcDate(Date.now() - (day + 1) * DAY));
    await seed((db) => Promise.all(dates.map((date) => setDoc(doc(db, 'streakDays', `gail_${date}`), { uid: 'gail', date, calm: true }))));
    await assertSucceeds(commit(google('gail'), dates.map((date) => ['delete', ['streakDays', `gail_${date}`]])));
  });

  it("refuses deleting someone else's, tombstone or not", async () => {
    await seedRecords();
    await seedDeletion('fern');
    for (const ref of records(google('fern'))) await assertFails(deleteDoc(ref));
  });

  for (const [status, deletable] of [
    ['pending_wallet', true], ['failed', true], ['minted', true], ['cooling', false], ['minting', false],
  ]) {
    it(`${deletable ? 'lets' : 'refuses'} a keeper delete a ${status} claim${deletable ? '' : ', which the Worker finishes'}`, async () => {
      await seedKept(M1, 'gail', HOUR);
      await seed((db) => updateDoc(doc(db, 'claims', M1), { status }));
      const ref = doc(google('gail'), 'claims', M1);
      await assertFails(deleteDoc(ref));
      await seedDeletion('gail');
      if (deletable) await assertSucceeds(deleteDoc(ref));
      else await assertFails(deleteDoc(ref));
    });
  }
});

describe("deleting a writer's bottles", () => {
  it('pulls drifting bottles, and with the tombstone ones reported out or under review', async () => {
    await seedBottle(M1);
    await seedBottle(M2, { reportCount: 3 });
    await seedBottle('bottle00000000000003', { status: 'under_review' });
    const db = google(WRITER);
    await assertSucceeds(deleteDoc(doc(db, 'messages', M1)));
    await assertFails(deleteDoc(doc(db, 'messages', M2)));
    await seedDeletion(WRITER);
    await assertSucceeds(deleteDoc(doc(db, 'messages', M2)));
    await assertSucceeds(deleteDoc(doc(db, 'messages', 'bottle00000000000003')));
  });

  it('never deletes a bottle someone holds or kept, tombstone or not', async () => {
    await seedHold(M1, 'finn', HOUR);
    await seedKept(M2, 'finn', 30 * DAY);
    await seedDeletion(WRITER);
    const db = google(WRITER);
    await assertFails(deleteDoc(doc(db, 'messages', M1)));
    await assertFails(deleteDoc(doc(db, 'messages', M2)));
  });

  it('takes the writer off a held bottle, which becomes orphaned, and off a kept one', async () => {
    await seedHold(M1, 'finn', HOUR);
    await seedKept(M2, 'finn', 30 * DAY);
    const db = google(WRITER);
    await assertSucceeds(commit(db, [anonymiseWrite(M1, 'orphaned')]));
    await assertSucceeds(commit(db, [anonymiseWrite(M2, 'kept')]));
  });

  for (const [label, write] of [
    ['a held bottle kept as found', anonymiseWrite(M1, 'found')],
    ['a pen name left on', ['update', ['messages', M1], { userId: null, status: 'orphaned' }]],
    ['another writer', ['update', ['messages', M1], { userId: 'fern', penName: null, status: 'orphaned' }]],
    ['another field', ['update', ['messages', M1], { userId: null, penName: null, status: 'orphaned', findCount: 9 }]],
  ]) {
    it(`refuses ${label}`, async () => {
      await seedHold(M1, 'finn', HOUR);
      await seed((db) => updateDoc(doc(db, 'messages', M1), { penName: 'Driftwood' }));
      await assertFails(commit(google(WRITER), [write]));
    });
  }

  it("refuses taking the writer off a drifting bottle, or someone else's", async () => {
    await seedBottle(M1);
    await assertFails(commit(google(WRITER), [anonymiseWrite(M1, 'afloat')]));
    await seedHold(M2, 'finn', HOUR);
    await assertFails(commit(google('fern'), [anonymiseWrite(M2, 'orphaned')]));
  });
});

describe('orphaned bottles', () => {
  async function seedOrphan(id, finderUid, ageMillis) {
    await seedHold(id, finderUid, ageMillis);
    await seed((db) => updateDoc(doc(db, 'messages', id), { userId: null, penName: null, status: 'orphaned' }));
  }

  it('stays with its finder, who can read, keep or report it', async () => {
    await seedOrphan(M1, 'finn', HOUR);
    const db = google('finn');
    await assertSucceeds(getDoc(doc(db, 'messages', M1)));
    await assertSucceeds(commit(db, keepWrites('finn', M1)));
    await seedOrphan(M2, 'finn', HOUR);
    await assertSucceeds(commit(db, reportWrites('finn', M2)));
  });

  it('can be thrown back, which only marks the find, and never drifts again', async () => {
    await seedOrphan(M1, 'finn', HOUR);
    const db = guest('finn');
    await assertFails(commit(db, throwBackWrites('finn', M1)));
    await assertSucceeds(commit(db, throwBackWrites('finn', M1), [0]));
    await seedOrphan(M2, 'finn', 8 * DAY);
    await assertFails(commit(guest('fern'), findWrites('fern', M2)));
  });

  it('never goes back to the sea through moderation', async () => {
    await seedOrphan(M1, 'finn', HOUR);
    const ref = doc(admin(), 'messages', M1);
    await assertSucceeds(updateDoc(ref, { status: 'under_review' }));
    await assertFails(updateDoc(ref, { status: 'found', reportCount: 0 }));
    await assertSucceeds(updateDoc(ref, { status: 'orphaned', reportCount: 0 }));
    await seedOrphan(M2, 'finn', 8 * DAY);
    await assertFails(updateDoc(doc(admin(), 'messages', M2), { status: 'afloat', foundAt: null, reportCount: 0 }));
    // nobody holds it any more, so restoring it removes it (the app's restore)
    await assertSucceeds(updateDoc(doc(admin(), 'messages', M2), { status: 'under_review' }));
    await assertSucceeds(updateDoc(doc(admin(), 'messages', M2), { status: 'removed', reportCount: 0 }));
  });

  it('is never made from a bottle that still has its writer', async () => {
    await seedHold(M1, 'finn', HOUR);
    await assertFails(updateDoc(doc(admin(), 'messages', M1), { status: 'orphaned' }));
  });
});
