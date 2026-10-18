import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, doc, getDoc, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import {
  DAY, HOUR, M1, W1, W2, WRITER, admin, anonymiseWrite, askToSealWrite, commit, google, guest, linkedGuest,
  sealAfterFor, seed, seedDeletion, seedKept, seedWallet,
} from './support.mjs';

// A sealable bottle cast two days ago and kept by finn an hour ago. `claim` is merged into the claim
// the keep made; `status` is the bottle's status after the keep.
async function seedSealable(id, { message = {}, claim = {}, status = 'kept' } = {}) {
  const createdAt = message.createdAt ?? Timestamp.fromMillis(Date.now() - 2 * DAY);
  await seedKept(id, 'finn', HOUR, { status, message: { sealable: true, ...message, createdAt } });
  if (Object.keys(claim).length) await seed((db) => updateDoc(doc(db, 'claims', id), claim));
  return createdAt;
}

const TX_HASH = `0x${'11'.repeat(32)}`;

describe('asking to seal', () => {
  it('lets the keeper ask to seal to their wallet, a day after the cast', async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('finn', W1);
    await assertSucceeds(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it('lets the keeper ask before the bottle is a day old, which waits out the check', async () => {
    const createdAt = await seedSealable(M1, { message: { createdAt: Timestamp.fromMillis(Date.now() - 2 * HOUR) } });
    await seedWallet('finn', W1);
    await assertSucceeds(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it('lets a guest that linked Google ask, to any of its wallets', async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('finn', W1);
    await seedWallet('finn', W2, { receiving: false });
    await assertSucceeds(commit(linkedGuest('finn'), [askToSealWrite(M1, W2, sealAfterFor(createdAt))]));
  });

  it('lets the keeper try again after a failed seal, dropping its error', async () => {
    const createdAt = await seedSealable(M1, { claim: { status: 'failed', error: 'reverted' } });
    await seedWallet('finn', W1);
    const db = google('finn');
    const keepsError = ['update', ['claims', M1], { status: 'cooling', sealAfter: sealAfterFor(createdAt), to: W1 }];
    await assertFails(commit(db, [keepsError]));
    await assertSucceeds(commit(db, [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it('refuses a guest, who signs in first', async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('finn', W1);
    await assertFails(commit(guest('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it("refuses someone else's claim, even to their own wallet", async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('fern', W2);
    await assertFails(commit(google('fern'), [askToSealWrite(M1, W2, sealAfterFor(createdAt))]));
  });

  it("refuses a wallet that isn't linked to me", async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('fern', W2);
    const db = google('finn');
    await assertFails(commit(db, [askToSealWrite(M1, W2, sealAfterFor(createdAt))]));
    await assertFails(commit(db, [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  for (const [label, to] of [
    ['an address in capitals', W1.toUpperCase().replace('0X', '0x')],
    ['a short address', '0x12'],
    ['a number', 12],
  ]) {
    it(`refuses ${label}`, async () => {
      const createdAt = await seedSealable(M1);
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), [askToSealWrite(M1, to, sealAfterFor(createdAt))]));
    });
  }

  for (const [label, sealAfter] of [
    ['no safety check', (createdAt) => createdAt],
    ['a check a minute short', (createdAt) => Timestamp.fromMillis(createdAt.toMillis() + DAY - 60 * 1000)],
    ['a check counted from now', () => Timestamp.fromMillis(Date.now() + DAY)],
    ['a server time', () => serverTimestamp()],
  ]) {
    it(`refuses ${label}`, async () => {
      const createdAt = await seedSealable(M1);
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfter(createdAt))]));
    });
  }

  for (const status of ['pending_wallet', 'minting', 'minted', 'failed']) {
    it(`refuses moving the claim to ${status}`, async () => {
      const createdAt = await seedSealable(M1);
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt), { status })]));
    });
  }

  for (const [label, overrides] of [
    ['a transaction hash', { txHash: TX_HASH }],
    ['a nonce', { nonce: 1 }],
    ['a keepsake number', { tokenId: 1 }],
    ['a delay', { delayedSince: serverTimestamp() }],
    ['another keeper', { keeperUid: 'fern' }],
    ['a new keptAt', { keptAt: Timestamp.now() }],
  ]) {
    it(`refuses ${label}, which only the Worker or the keep writes`, async () => {
      const createdAt = await seedSealable(M1);
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt), overrides)]));
    });
  }

  for (const status of ['cooling', 'minting', 'minted']) {
    it(`refuses asking again once the claim is ${status}`, async () => {
      const createdAt = Timestamp.fromMillis(Date.now() - 2 * DAY);
      await seedSealable(M1, {
        message: { createdAt },
        claim: { status, to: W1, sealAfter: sealAfterFor(createdAt), ...(status === 'cooling' ? {} : { txHash: TX_HASH, nonce: 0 }) },
      });
      await seedWallet('finn', W1);
      await seedWallet('finn', W2, { receiving: false });
      await assertFails(commit(google('finn'), [askToSealWrite(M1, W2, sealAfterFor(createdAt))]));
    });
  }

  for (const status of ['under_review', 'removed']) {
    it(`refuses a bottle that's ${status.replace('_', ' ')}`, async () => {
      const createdAt = await seedSealable(M1, { status });
      await seedWallet('finn', W1);
      await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
    });
  }

  it('refuses a bottle its writer asked to keep off-chain', async () => {
    const createdAt = await seedSealable(M1, { message: { sealable: false } });
    await seedWallet('finn', W1);
    await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it('refuses a bottle whose writer deleted their account', async () => {
    const createdAt = await seedSealable(M1, { message: { userId: null, penName: null } });
    await seedWallet('finn', W1);
    await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });

  it('refuses while my account is being deleted', async () => {
    const createdAt = await seedSealable(M1);
    await seedWallet('finn', W1);
    await seedDeletion('finn');
    await assertFails(commit(google('finn'), [askToSealWrite(M1, W1, sealAfterFor(createdAt))]));
  });
});

describe('sealed bottles', () => {
  async function seedSealed(id) {
    const createdAt = await seedSealable(id, { message: { penName: 'Driftwood' } });
    await seed(async (db) => {
      await updateDoc(doc(db, 'messages', id), { sealedAt: Timestamp.now() });
      await updateDoc(doc(db, 'claims', id), {
        status: 'minted', to: W1, sealAfter: sealAfterFor(createdAt), txHash: TX_HASH, nonce: 0, tokenId: 1,
        mintedAt: Timestamp.now(),
      });
    });
  }

  it('never lets a client set sealedAt', async () => {
    await seedSealable(M1);
    for (const db of [google('finn'), google(WRITER), admin()]) {
      await assertFails(updateDoc(doc(db, 'messages', M1), { sealedAt: serverTimestamp() }));
    }
  });

  it('lets the keeper read the bottle and the minted claim, and the writer the bottle', async () => {
    await seedSealed(M1);
    await assertSucceeds(getDoc(doc(google('finn'), 'messages', M1)));
    await assertSucceeds(getDoc(doc(google('finn'), 'claims', M1)));
    await assertSucceeds(getDoc(doc(google(WRITER), 'messages', M1)));
    await assertFails(getDoc(doc(google(WRITER), 'claims', M1)));
  });

  it('can still be pulled and given back by an admin', async () => {
    await seedSealed(M1);
    const ref = doc(admin(), 'messages', M1);
    await assertSucceeds(updateDoc(ref, { status: 'under_review' }));
    await assertSucceeds(updateDoc(ref, { status: 'kept', reportCount: 0 }));
  });

  it("still lets its writer take their name off as their account is deleted", async () => {
    await seedSealed(M1);
    await assertSucceeds(commit(google(WRITER), [anonymiseWrite(M1, 'kept')]));
  });
});
