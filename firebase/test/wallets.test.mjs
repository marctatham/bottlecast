import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import {
  W1, W2, admin, google, guest, seed, seedDeletion, seedWallet,
} from './support.mjs';

describe('linked wallets', () => {
  it('lets me read my wallets and my index entries', async () => {
    await seedWallet('finn', W1);
    await seedWallet('finn', W2, { receiving: false });
    const db = google('finn');
    await assertSucceeds(getDoc(doc(db, 'users', 'finn', 'wallets', W1)));
    await assertSucceeds(getDocs(collection(db, 'users', 'finn', 'wallets')));
    await assertSucceeds(getDoc(doc(db, 'walletIndex', W1)));
    await assertSucceeds(getDocs(query(collection(db, 'walletIndex'), where('uid', '==', 'finn'))));
  });

  it("refuses reading someone else's", async () => {
    await seedWallet('finn', W1);
    const db = google('fern');
    await assertFails(getDoc(doc(db, 'users', 'finn', 'wallets', W1)));
    await assertFails(getDocs(collection(db, 'users', 'finn', 'wallets')));
    await assertFails(getDoc(doc(db, 'walletIndex', W1)));
    await assertFails(getDocs(query(collection(db, 'walletIndex'), where('uid', '==', 'finn'))));
    await assertFails(getDocs(collection(db, 'walletIndex')));
  });

  it('never lets a client write one, since only the Worker checks the signature', async () => {
    await seedWallet('finn', W1);
    for (const db of [google('finn'), guest('finn'), admin('finn')]) {
      await assertFails(setDoc(doc(db, 'users', 'finn', 'wallets', W2), {
        address: W2, receiving: false, linkedAt: Timestamp.now(),
      }));
      await assertFails(updateDoc(doc(db, 'users', 'finn', 'wallets', W1), { receiving: false }));
      await assertFails(setDoc(doc(db, 'walletIndex', W2), { uid: 'finn', linkedAt: Timestamp.now() }));
      await assertFails(updateDoc(doc(db, 'walletIndex', W1), { uid: 'fern' }));
    }
  });

  it('lets me delete them only while my account is being deleted', async () => {
    await seedWallet('finn', W1);
    const db = google('finn');
    await assertFails(deleteDoc(doc(db, 'users', 'finn', 'wallets', W1)));
    await assertFails(deleteDoc(doc(db, 'walletIndex', W1)));
    await seedDeletion('finn');
    await assertSucceeds(deleteDoc(doc(db, 'walletIndex', W1)));
    await assertSucceeds(deleteDoc(doc(db, 'users', 'finn', 'wallets', W1)));
    // an entry that's already gone, so a deletion that stopped part-way carries on
    await assertSucceeds(deleteDoc(doc(db, 'walletIndex', W1)));
  });

  it("refuses deleting someone else's, tombstone or not", async () => {
    await seedWallet('finn', W1);
    await seedDeletion('fern');
    const db = google('fern');
    await assertFails(deleteDoc(doc(db, 'users', 'finn', 'wallets', W1)));
    await assertFails(deleteDoc(doc(db, 'walletIndex', W1)));
  });
});

describe("the minter's state", () => {
  it('is closed to every client', async () => {
    await seed((db) => setDoc(doc(db, 'minter', 'state'), { leaseUntil: Timestamp.now() }));
    for (const db of [google('finn'), admin()]) {
      await assertFails(getDoc(doc(db, 'minter', 'state')));
      await assertFails(updateDoc(doc(db, 'minter', 'state'), { leaseUntil: Timestamp.now() }));
      await assertFails(deleteDoc(doc(db, 'minter', 'state')));
    }
  });
});
