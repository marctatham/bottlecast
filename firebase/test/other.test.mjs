import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc,
} from 'firebase/firestore';
import {
  HOUR, M1, commit, guest, reportWrites, seedHold,
} from './support.mjs';

describe('blocked writers', () => {
  it('lets me block a writer, see who I blocked, and unblock them', async () => {
    const db = guest('finn');
    const ref = doc(db, 'users', 'finn', 'blockedWriters', 'writer');
    await assertSucceeds(setDoc(ref, { at: serverTimestamp(), messageId: M1 }));
    await assertSucceeds(setDoc(ref, { at: serverTimestamp(), messageId: M1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, 'users', 'finn', 'blockedWriters')));
    await assertSucceeds(deleteDoc(ref));
  });

  it("refuses reading or writing someone else's list", async () => {
    const db = guest('fern');
    await assertFails(getDocs(collection(db, 'users', 'finn', 'blockedWriters')));
    await assertFails(setDoc(doc(db, 'users', 'finn', 'blockedWriters', 'writer'), { at: serverTimestamp(), messageId: M1 }));
  });

  it('refuses blocking myself, a client timestamp or an extra key', async () => {
    const db = guest('finn');
    await assertFails(setDoc(doc(db, 'users', 'finn', 'blockedWriters', 'finn'), { at: serverTimestamp(), messageId: M1 }));
    await assertFails(setDoc(doc(db, 'users', 'finn', 'blockedWriters', 'writer'), { at: Timestamp.now(), messageId: M1 }));
    await assertFails(setDoc(doc(db, 'users', 'finn', 'blockedWriters', 'writer'), { at: serverTimestamp(), messageId: M1, why: 'x' }));
  });
});

describe('everything else', () => {
  it('denies documents outside the known collections', async () => {
    const db = guest('finn');
    await assertFails(getDoc(doc(db, 'keepsakes', 'x')));
    await assertFails(setDoc(doc(db, 'foo', 'bar'), { a: 1 }));
  });

  it('never lets a client delete finds, daily records or reports', async () => {
    await seedHold(M1, 'finn', HOUR);
    const db = guest('finn');
    await commit(db, reportWrites('finn', M1));
    await assertFails(deleteDoc(doc(db, 'finds', `${M1}_finn`)));
    await assertFails(deleteDoc(doc(db, 'reports', `${M1}_finn`)));
  });
});
