import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import {
  DAY, HOUR, M1, M2, W1, WRITER, admin, commit, google, guest, keepWrites, linkedGuest, reportWrites, seed,
  seedBottle, seedHold, seedKept, seedWallet, throwBackWrites, utcDate,
} from './support.mjs';

describe('keeping a bottle', () => {
  it('lets the holder keep it with a Google account', async () => {
    await seedHold(M1, 'finn', HOUR);
    await assertSucceeds(commit(google('finn'), keepWrites('finn', M1)));
  });

  it('lets a guest that linked Google keep it', async () => {
    await seedHold(M1, 'finn', HOUR);
    await assertSucceeds(commit(linkedGuest('finn'), keepWrites('finn', M1)));
  });

  it('lets the holder keep it on the last day of the hold', async () => {
    await seedHold(M1, 'finn', 7 * DAY - HOUR);
    await assertSucceeds(commit(google('finn'), keepWrites('finn', M1)));
  });

  it('refuses a guest, who signs in first', async () => {
    await seedHold(M1, 'finn', HOUR);
    await assertFails(commit(guest('finn'), keepWrites('finn', M1)));
  });

  for (const only of [[0], [1], [2], [0, 1], [0, 2], [1, 2]]) {
    it(`refuses part of the commit (${only.join(', ')})`, async () => {
      await seedHold(M1, 'finn', HOUR);
      await assertFails(commit(google('finn'), keepWrites('finn', M1), only));
    });
  }

  it("refuses someone who doesn't hold it", async () => {
    await seedHold(M1, 'finn', HOUR);
    await assertFails(commit(google('fern'), keepWrites('fern', M1)));
  });

  it('refuses keeping once the hold has run out', async () => {
    await seedHold(M1, 'finn', 8 * DAY);
    await assertFails(commit(google('finn'), keepWrites('finn', M1)));
  });

  it('refuses an old finder once the bottle has moved on to someone else', async () => {
    const old = Timestamp.fromMillis(Date.now() - 2 * HOUR);
    await seedHold(M1, 'second', HOUR, { findCount: 2 });
    await seed((db) => setDoc(doc(db, 'finds', `${M1}_first`), {
      messageId: M1, finderUid: 'first', foundAt: old, dailyId: `first_${utcDate()}`, status: 'held',
    }));
    await assertFails(commit(google('first'), keepWrites('first', M1)));
  });

  it('refuses keeping a bottle I reported or threw back', async () => {
    await seedHold(M1, 'finn', HOUR, { findStatus: 'reported', reportCount: 1 });
    await assertFails(commit(google('finn'), keepWrites('finn', M1)));
    await seedHold(M2, 'finn', HOUR, { findStatus: 'thrown_back' });
    await assertFails(commit(google('finn'), keepWrites('finn', M2)));
  });

  it('refuses keeping a bottle twice', async () => {
    await seedKept(M1, 'finn', HOUR);
    await assertFails(commit(google('finn'), keepWrites('finn', M1)));
  });

  for (const [label, writes] of [
    ['a client keptAt on the bottle', { message: { keptAt: Timestamp.now() } }],
    ['another bottle field', { message: { findCount: 5 } }],
    ['a claim for someone else', { claim: { keeperUid: 'fern' } }],
    ['a claim already sealing', {
      claim: { status: 'cooling', to: W1, sealAfter: Timestamp.fromMillis(Date.now() - 2 * DAY) },
    }],
    ['a client keptAt on the claim', { claim: { keptAt: Timestamp.now() } }],
    ['a wallet on the claim, which asking to seal adds later', { claim: { to: W1 } }],
    ['another find status', { find: { status: 'thrown_back' } }],
  ]) {
    it(`refuses ${label}`, async () => {
      await seedHold(M1, 'finn', HOUR);
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), keepWrites('finn', M1, writes)));
    });
  }

  it('refuses a claim on its own, or under another id', async () => {
    await seedHold(M1, 'finn', HOUR);
    const db = google('finn');
    const [, , [, , claim]] = keepWrites('finn', M1);
    await assertFails(setDoc(doc(db, 'claims', M1), claim));
    await assertFails(commit(db, [...keepWrites('finn', M1).slice(0, 2), ['set', ['claims', M2], claim]]));
  });

  it('keeps a kept bottle out of throw backs and reports', async () => {
    await seedKept(M1, 'finn', HOUR);
    const db = google('finn');
    await assertFails(commit(db, throwBackWrites('finn', M1)));
    await assertFails(commit(db, reportWrites('finn', M1)));
  });
});

describe('reading kept bottles', () => {
  it('lets the keeper read the bottle and their claims', async () => {
    await seedKept(M1, 'finn', 3 * DAY);
    const db = google('finn');
    await assertSucceeds(getDoc(doc(db, 'messages', M1)));
    await assertSucceeds(getDoc(doc(db, 'claims', M1)));
    await assertSucceeds(getDocs(query(collection(db, 'claims'), where('keeperUid', '==', 'finn'))));
  });

  it('lets the keeper read it long after the hold would have ended', async () => {
    await seedKept(M1, 'finn', 30 * DAY);
    await assertSucceeds(getDoc(doc(google('finn'), 'messages', M1)));
  });

  it('lets the writer read their kept bottle, but not the claim', async () => {
    await seedKept(M1, 'finn', HOUR);
    const db = google(WRITER);
    await assertSucceeds(getDoc(doc(db, 'messages', M1)));
    await assertFails(getDoc(doc(db, 'claims', M1)));
  });

  it("refuses anyone else the bottle or the claim", async () => {
    await seedKept(M1, 'finn', HOUR);
    const db = google('fern');
    await assertFails(getDoc(doc(db, 'messages', M1)));
    await assertFails(getDoc(doc(db, 'claims', M1)));
    await assertFails(getDocs(query(collection(db, 'claims'), where('keeperUid', '==', 'finn'))));
    await assertFails(getDocs(collection(db, 'claims')));
  });

  it('lets the keeper read it under review, but not once removed', async () => {
    await seedKept(M1, 'finn', HOUR, { status: 'under_review' });
    await assertSucceeds(getDoc(doc(google('finn'), 'messages', M1)));
    await seedKept(M2, 'finn', HOUR, { status: 'removed' });
    await assertFails(getDoc(doc(google('finn'), 'messages', M2)));
  });

  it('never finds a kept bottle again', async () => {
    await seedKept(M1, 'finn', 8 * DAY);
    const db = guest('fern');
    await assertFails(updateDoc(doc(db, 'messages', M1), { status: 'found' }));
  });
});

describe('moderating kept bottles', () => {
  it('lets an admin pull a kept bottle and give it back to its keeper', async () => {
    await seedKept(M1, 'finn', 8 * DAY);
    const ref = doc(admin(), 'messages', M1);
    await assertSucceeds(updateDoc(ref, { status: 'under_review' }));
    await assertSucceeds(updateDoc(ref, { status: 'kept', reportCount: 0 }));
    await assertSucceeds(updateDoc(ref, { status: 'removed' }));
  });

  it('never puts a kept bottle back in the sea or in a hold', async () => {
    await seedKept(M1, 'finn', 8 * DAY, { status: 'under_review' });
    const ref = doc(admin(), 'messages', M1);
    await assertFails(updateDoc(ref, { status: 'afloat', foundAt: null, reportCount: 0 }));
    await seedKept(M2, 'finn', HOUR, { status: 'under_review' });
    await assertFails(updateDoc(doc(admin(), 'messages', M2), { status: 'found' }));
  });

  it("refuses making a bottle kept that nobody kept", async () => {
    await seedBottle(M1, { status: 'under_review' });
    await assertFails(updateDoc(doc(admin(), 'messages', M1), { status: 'kept' }));
  });
});
