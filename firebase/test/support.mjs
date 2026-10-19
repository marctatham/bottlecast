// Shared helpers for the rules tests: the test environment, who's asking, seed data and the
// writes the app makes, each shaped exactly as the app sends it.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Bytes, Timestamp, deleteField, doc, increment, serverTimestamp, setDoc, setLogLevel, updateDoc, writeBatch,
} from 'firebase/firestore';

// Denied writes are the point of most tests; keep the SDK from logging each one.
setLogLevel('silent');

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

let testEnv;

export async function setUpEnvironment() {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bottlecast',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
}

export async function tearDownEnvironment() {
  await testEnv?.cleanup();
}

export async function clearData() {
  await testEnv.clearFirestore();
}

// ---------- Who is asking ----------

const googleToken = { firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['1'] } } };

export function guest(uid) {
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous', identities: {} } })
    .firestore();
}

export function google(uid) {
  return testEnv.authenticatedContext(uid, googleToken).firestore();
}

// A guest that linked Google: the identities carry Google, though the provider may still say anonymous.
export function linkedGuest(uid) {
  return testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'anonymous', identities: { 'google.com': ['1'] } },
  }).firestore();
}

export function admin(uid = 'moderator') {
  return testEnv.authenticatedContext(uid, { ...googleToken, admin: true }).firestore();
}

export function withToken(uid, token) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

export function signedOut() {
  return testEnv.unauthenticatedContext().firestore();
}

// ---------- Seed data (written with the rules off) ----------

export async function seed(write) {
  await testEnv.withSecurityRulesDisabled(async (context) => write(context.firestore()));
}

// Message ids are 20 alphanumerics, as Firestore's auto ids are.
export function messageId(n) {
  return `bottle${String(n).padStart(14, '0')}`;
}

export const M1 = messageId(1);
export const M2 = messageId(2);

export const WRITER = 'writer';

export function bottle(id, overrides = {}) {
  return {
    id,
    messageContent: 'Leave the porch light on for the people still finding their way home.',
    userId: WRITER,
    createdAt: Timestamp.fromMillis(Date.now() - 3 * DAY),
    lang: 'und',
    status: 'afloat',
    rand: 0.5,
    penName: null,
    sealable: false,
    reportCount: 0,
    findCount: 0,
    foundAt: null,
    ...overrides,
  };
}

export async function seedBottle(id, overrides = {}) {
  await seed((db) => setDoc(doc(db, 'messages', id), bottle(id, overrides)));
}

// A hold by `finderUid`, `ageMillis` old: the message, the finder's find and their daily record,
// all stamped with the same time, as one find commit would leave them. `message` overrides the bottle.
export async function seedHold(id, finderUid, ageMillis, {
  findStatus = 'held', reportCount = 0, findCount = 1, message = {},
} = {}) {
  const foundAt = Timestamp.fromMillis(Date.now() - ageMillis);
  const date = utcDate(Date.now() - ageMillis);
  await seed(async (db) => {
    await setDoc(doc(db, 'messages', id), bottle(id, { status: 'found', foundAt, findCount, reportCount, ...message }));
    await setDoc(doc(db, 'finds', `${id}_${finderUid}`), {
      messageId: id, finderUid, foundAt, dailyId: `${finderUid}_${date}`, status: findStatus,
    });
    await setDoc(doc(db, 'daily', `${finderUid}_${date}`), {
      uid: finderUid, date, zone: 'UTC', messageId: id, foundAt,
    });
  });
  return foundAt;
}

// A bottle `keeperUid` found `ageMillis` ago and then kept, as a find and a keep would leave it.
export async function seedKept(id, keeperUid, ageMillis, { status = 'kept', message = {} } = {}) {
  await seedHold(id, keeperUid, ageMillis, { message });
  const keptAt = Timestamp.fromMillis(Date.now() - ageMillis + 60 * 1000);
  await seed(async (db) => {
    await updateDoc(doc(db, 'messages', id), { status, keptAt });
    await updateDoc(doc(db, 'finds', `${id}_${keeperUid}`), { status: 'kept' });
    await setDoc(doc(db, 'claims', id), { messageId: id, keeperUid, status: 'pending_wallet', keptAt });
  });
  return keptAt;
}

// Wallet addresses are stored lowercase, as the Worker keys them.
export const W1 = `0x${'ab'.repeat(20)}`;
export const W2 = `0x${'cd'.repeat(20)}`;

// A wallet the Worker linked to `uid`: the account's wallet and the index entry naming it.
export async function seedWallet(uid, address, { receiving = true } = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, 'users', uid, 'wallets', address), {
      address, receiving, linkedAt: Timestamp.now(), walletName: 'Rainbow',
    });
    await setDoc(doc(db, 'walletIndex', address), { uid, linkedAt: Timestamp.now() });
  });
}

// The end of a bottle's 24-hour safety check, counted from its cast (spec §1.7).
export function sealAfterFor(createdAt) {
  return Timestamp.fromMillis(createdAt.toMillis() + DAY);
}

// Asking to seal, as the app writes it: the claim moves to cooling, naming the wallet, and drops any
// error a failed seal left.
export function askToSealWrite(id, to, sealAfter, overrides = {}) {
  return ['update', ['claims', id], { status: 'cooling', sealAfter, to, error: deleteField(), ...overrides }];
}

// An account part-way through being deleted (spec §3.17): its tombstone.
export async function seedDeletion(uid) {
  await seed((db) => setDoc(doc(db, 'deletions', uid), { createdAt: Timestamp.now() }));
}

// The writer's account is deleted while someone holds or kept the bottle: its writer taken off.
export function anonymiseWrite(id, status) {
  return ['update', ['messages', id], { userId: null, penName: null, status }];
}

export async function seedProfile(uid, profile) {
  await seed((db) => setDoc(doc(db, 'users', uid), profile));
}

export async function seedTally(uid, tally) {
  await seed((db) => setDoc(doc(db, 'castTally', uid), tally));
}

// ---------- Dates ----------

export function utcDate(millis = Date.now()) {
  return new Date(millis).toISOString().slice(0, 10);
}

export function utcHour() {
  return new Date().getUTCHours();
}

// ---------- The app's writes ----------

export function castFields(uid, id, overrides = {}) {
  return {
    id,
    messageContent: 'Hey, that is pretty cool. Drink some water today.',
    userId: uid,
    createdAt: serverTimestamp(),
    lang: 'und',
    status: 'afloat',
    rand: 0.25,
    penName: null,
    sealable: false,
    reportCount: 0,
    findCount: 0,
    foundAt: null,
    ...overrides,
  };
}

// A cast, as one commit: the bottle, my cast tally counting it, and my profile accepting the Terms.
// `tally` and `profile` replace or extend those writes; `tallyKind` 'update' is the same-day form,
// and a null `profile` leaves the profile out.
export function castWrites(uid, id, {
  message = {}, tally = {}, tallyKind = 'set', profile = {},
} = {}) {
  const writes = [
    ['set', ['messages', id], castFields(uid, id, message)],
    tallyKind === 'update'
      ? ['update', ['castTally', uid], { date: utcDate(), count: increment(1), messageId: id, ...tally }]
      : ['set', ['castTally', uid], { date: utcDate(), count: 1, messageId: id, ...tally }],
  ];
  if (profile !== null) {
    writes.push(['merge', ['users', uid], { termsVersion: 1, termsAcceptedAt: serverTimestamp(), ...profile }]);
  }
  return writes;
}

export function cast(db, uid, id, overrides = {}, options = {}) {
  return commit(db, castWrites(uid, id, { ...options, message: overrides }));
}

// ---------- Handovers ----------

// A random token, as the app makes one, and the SHA-256 commitment the guest leaves.
export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return Bytes.fromUint8Array(new Uint8Array(createHash('sha256').update(token).digest()));
}

export function handoffFields(uid, { date = utcDate(), hash, ...overrides } = {}) {
  return {
    from: uid, date, tokenHash: hash, createdAt: serverTimestamp(), token: null, claimedBy: null, claimedAt: null,
    ...overrides,
  };
}

export function armHandoff(db, uid, id, options = {}) {
  return setDoc(doc(db, 'handoffs', id), handoffFields(uid, options));
}

// The claim, as one commit: present the token, move the hold to me, and record my find for today.
export function claimWrites(uid, id, token, { date = utcDate(), handoff = {}, message = {} } = {}) {
  return [
    ['update', ['handoffs', id], { token, claimedBy: uid, claimedAt: serverTimestamp(), ...handoff }],
    ['update', ['messages', id], { foundAt: serverTimestamp(), ...message }],
    ['set', ['finds', `${id}_${uid}`], {
      messageId: id, finderUid: uid, foundAt: serverTimestamp(), dailyId: `${uid}_${date}`, status: 'held',
    }],
    ['set', ['daily', `${uid}_${date}`], { uid, date, zone: 'UTC', messageId: id, foundAt: serverTimestamp() }],
  ];
}

// The pop, as one commit: hold the bottle, create my find and today's daily record.
export function findWrites(uid, id, {
  date = utcDate(), zone = 'UTC', findCountBefore = 0, message = {}, find = {}, daily = {},
} = {}) {
  return [
    ['update', ['messages', id], { status: 'found', findCount: findCountBefore + 1, foundAt: serverTimestamp(), ...message }],
    ['set', ['finds', `${id}_${uid}`], {
      messageId: id, finderUid: uid, foundAt: serverTimestamp(), dailyId: `${uid}_${date}`, status: 'held', ...find,
    }],
    ['set', ['daily', `${uid}_${date}`], { uid, date, zone, messageId: id, foundAt: serverTimestamp(), ...daily }],
  ];
}

export function throwBackWrites(uid, id) {
  return [
    ['update', ['finds', `${id}_${uid}`], { status: 'thrown_back' }],
    ['update', ['messages', id], { status: 'afloat', foundAt: null }],
  ];
}

export function reportWrites(uid, id, { reason = null, blockedWriter = false, report = {} } = {}) {
  return [
    ['set', ['reports', `${id}_${uid}`], {
      messageId: id, reporterUid: uid, reason, blockedWriter, createdAt: serverTimestamp(), ...report,
    }],
    ['update', ['messages', id], { reportCount: increment(1) }],
    ['update', ['finds', `${id}_${uid}`], { status: 'reported' }],
  ];
}

// Keep, as one commit: mark the bottle kept, mark my find kept and create my claim.
export function keepWrites(uid, id, { message = {}, find = {}, claim = {} } = {}) {
  return [
    ['update', ['messages', id], { status: 'kept', keptAt: serverTimestamp(), ...message }],
    ['update', ['finds', `${id}_${uid}`], { status: 'kept', ...find }],
    ['set', ['claims', id], {
      messageId: id, keeperUid: uid, status: 'pending_wallet', keptAt: serverTimestamp(), ...claim,
    }],
  ];
}

// A mark on today's streak day, merged as the app writes it.
export function streakDayWrite(uid, marks, { date = utcDate() } = {}) {
  return ['merge', ['streakDays', `${uid}_${date}`], { uid, date, ...marks }];
}

// Commits some writes (or a subset, by index) as one batch.
export function commit(db, writes, only) {
  const batch = writeBatch(db);
  writes.forEach(([kind, path, data], index) => {
    if (only && !only.includes(index)) return;
    const ref = doc(db, ...path);
    if (kind === 'set') batch.set(ref, data);
    else if (kind === 'merge') batch.set(ref, data, { merge: true });
    else if (kind === 'delete') batch.delete(ref);
    else batch.update(ref, data);
  });
  return batch.commit();
}
