import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { State, initialState, migrateState, type State as AppState } from '../core/model';
import { base64, fromBase64, unwrapKey, VaultHeader, wrapKey } from './crypto';
import { textHash } from '../core/assessment';

export type Encrypted = { id: string; revision: number; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };
type Metadata = { id: string; header: VaultHeader };
class Database extends Dexie {
  records!: Table<Encrypted, string>;
  metadata!: Table<Metadata, string>;
  constructor() { super('applypilot-session-v1'); this.version(1).stores({ records: 'id' }); this.version(2).stores({ records: 'id', metadata: 'id' }); }
}
const db = new Database();
export const aad = (id: string, revision: number) => new TextEncoder().encode(`applypilot:1:${id}:${revision}`);
export async function seal(key: CryptoKey, id: string, revision: number, value: unknown): Promise<Encrypted> {
  const plain = JSON.stringify(value);
  if (plain.length > 8500000) throw new Error('Local data limit reached. Export a backup and remove old history or sources.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(id, revision) }, key, new TextEncoder().encode(plain));
  return { id, revision, iv, data };
}
export async function unseal(key: CryptoKey, record: Encrypted): Promise<unknown> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: aad(record.id, record.revision) }, key, record.data);
  return JSON.parse(new TextDecoder().decode(plain));
}
async function restrictAccess() {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
async function sessionKey(): Promise<CryptoKey> {
  await restrictAccess();
  const stored = await chrome.storage.session.get('encryptionKey');
  if (stored.encryptionKey) return crypto.subtle.importKey('jwk', stored.encryptionKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  await db.records.delete('state');
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await chrome.storage.session.set({ encryptionKey: await crypto.subtle.exportKey('jwk', key) });
  return key;
}
async function savedKey(): Promise<CryptoKey | null> {
  await restrictAccess();
  const stored = await chrome.storage.session.get(['vaultKey', 'unlockUntil']);
  if (!stored.vaultKey) return null;
  if (typeof stored.unlockUntil !== 'number' || stored.unlockUntil <= Date.now()) { await lockVault(); return null; }
  return crypto.subtle.importKey('jwk', stored.vaultKey, 'AES-GCM', true, ['encrypt', 'decrypt']);
}
async function rememberKey(key: CryptoKey, minutes: number) {
  const unlockUntil = Date.now() + minutes * 60000;
  await restrictAccess();
  await chrome.storage.session.set({ vaultKey: await crypto.subtle.exportKey('jwk', key), unlockUntil });
  if (chrome.alarms) await chrome.alarms.create('vault-idle-lock', { when: unlockUntil });
}
export async function touchVault() {
  const meta = await db.metadata.get('vault');
  const key = meta && await savedKey();
  if (meta && key) await rememberKey(key, meta.header.idleMinutes);
}
export async function readState(): Promise<AppState> {
  const meta = await db.metadata.get('vault');
  const key = meta ? await savedKey() : await sessionKey();
  if (!key && meta) {
    const locked = initialState(); locked.storage = { mode: 'saved', locked: true, idleMinutes: meta.header.idleMinutes }; return locked;
  }
  const record = await db.records.get(meta ? 'vault-state' : 'state');
  if (!record) {
    if (meta) throw new Error('The saved vault record is missing. Restore an encrypted backup; no data was reset.');
    return initialState();
  }
  const state = migrateState(await unseal(key!, record));
  if(meta && state.storage.idleMinutes!==meta.header.idleMinutes)throw new Error('Saved vault metadata changed. Restore a known-good backup.');
  if (meta) state.storage = { mode: 'saved', locked: false, idleMinutes: meta.header.idleMinutes };
  const secret = await chrome.storage.session.get('providerKey');
  state.provider.configured = typeof secret.providerKey === 'string' && !!secret.providerKey;
  return state;
}
export async function writeState(state: AppState, expectedRevision: number): Promise<void> {
  const parsed = State.parse(state);
  if (parsed.storage.locked) throw new Error('Unlock your saved profile before making changes.');
  const meta = await db.metadata.get('vault');
  const key = meta ? await savedKey() : await sessionKey();
  if (!key) throw new Error('Your saved profile locked. Unlock it before continuing.');
  const record = await seal(key, meta ? 'vault-state' : 'state', parsed.revision, parsed);
  await db.transaction('rw', db.records, async () => {
    const old = await db.records.get(record.id);
    if ((old?.revision ?? 0) !== expectedRevision) throw new Error('State changed. Refresh before trying again.');
    await db.records.put(record);
  });
}
export async function lockVault() {
  await chrome.storage.session.clear();
  await db.records.delete('state');
  if (chrome.alarms) await chrome.alarms.clear('vault-idle-lock');
}
export async function endSession() { await lockVault(); }
export async function deleteAllData() {
  await chrome.storage.session.clear();
  await db.transaction('rw', db.records, db.metadata, async () => { await db.records.clear(); await db.metadata.clear(); });
  if (chrome.alarms) await chrome.alarms.clear('vault-idle-lock');
}
export async function createVault(state: AppState, passphrase: string, idleMinutes: number) {
  if (await db.metadata.get('vault')) throw new Error('A saved profile already exists. Unlock it or delete it explicitly.');
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const header = await wrapKey(key, passphrase, idleMinutes);
  const saved = { ...state, storage: { mode: 'saved' as const, locked: false, idleMinutes }, revision: state.revision + 1 };
  const encrypted = await seal(key, 'vault-state', saved.revision, State.parse(saved));
  await db.transaction('rw', db.records, db.metadata, async () => {
    if (await db.metadata.get('vault')) throw new Error('A vault was created in another operation. Refresh first.');
    if (((await db.records.get('state'))?.revision ?? 0) !== state.revision) throw new Error('Profile changed while enabling saved mode. Try again.');
    await db.metadata.put({ id: 'vault', header }); await db.records.put(encrypted); await db.records.delete('state');
  });
  await chrome.storage.session.remove('encryptionKey');
  await rememberKey(key, idleMinutes); return readState();
}
export async function unlockVault(passphrase: string) {
  const meta = await db.metadata.get('vault');
  if (!meta) throw new Error('No saved profile exists on this browser.');
  const key = await unwrapKey(meta.header, passphrase);
  const record = await db.records.get('vault-state');
  if (!record) throw new Error('Saved profile data is missing; restore a backup.');
  const state = migrateState(await unseal(key, record));
  state.storage = { mode: 'saved', locked: false, idleMinutes: meta.header.idleMinutes };
  state.provider.configured = false; state.requestIds = [];state.aiRequests=0;
  if (state.session) { state.session.state = 'paused'; state.session.generation++; state.session.approved = {}; state.session.note = 'Saved profile unlocked. Inspect the current page before resuming.'; }
  await rememberKey(key, meta.header.idleMinutes);
  const previous = state.revision; state.revision++;
  await writeState(state, previous); return state;
}
export async function changePassphrase(oldPassphrase: string, newPassphrase: string) {
  const meta = await db.metadata.get('vault');
  if (!meta) throw new Error('Create a saved profile first.');
  const key = await unwrapKey(meta.header, oldPassphrase);
  const header = await wrapKey(key, newPassphrase, meta.header.idleMinutes, meta.header.vaultId);
  await db.metadata.put({ id: 'vault', header });
  await rememberKey(key, header.idleMinutes);
}
const Backup = z.object({ format: z.literal('applypilot-encrypted-backup'), version: z.literal(1), header: VaultHeader,
  record: z.object({ id: z.literal('vault-state'), revision: z.number().int().nonnegative(), iv: z.array(z.number().int().min(0).max(255)).length(12), data: z.string().max(11500000) }).strict()
}).strict();
export async function exportBackup() {
  const meta = await db.metadata.get('vault'), record = await db.records.get('vault-state');
  if (!meta || !record) throw new Error('Enable saved-profile mode to export an encrypted backup.');
  return JSON.stringify(Backup.parse({ format: 'applypilot-encrypted-backup', version: 1, header: meta.header, record: { ...record, iv: [...record.iv], data: base64(new Uint8Array(record.data)) } }));
}
async function openBackup(text: string, passphrase: string) {
  if (text.length > 12000000) throw new Error('Backup exceeds the supported size.');
  let backup: z.infer<typeof Backup>;
  try { backup = Backup.parse(JSON.parse(text)); } catch { throw new Error('Invalid or unsupported encrypted backup. No data was changed.'); }
  const key = await unwrapKey(backup.header, passphrase);
  const raw = await unseal(key, { ...backup.record, iv: new Uint8Array(backup.record.iv), data: fromBase64(backup.record.data).buffer });
  const state = migrateState(raw);
  state.session = null; state.requestIds = []; state.aiRequests = 0; state.provider.configured = false;
  state.storage = { mode: 'saved', locked: false, idleMinutes: backup.header.idleMinutes };
  return { backup, key, state };
}
export async function previewBackup(text: string, passphrase: string) {
  const { state } = await openBackup(text, passphrase);
  return { hash: await textHash(text), name: state.profile.facts.find(f => f.key === 'fullName')?.value ?? state.profile.facts.find(f => f.key === 'firstName')?.value ?? 'Unnamed profile', contactFacts: state.profile.facts.length, careerEntries: state.profile.candidate.employment.length + state.profile.candidate.education.length + state.profile.candidate.projects.length, resume: state.resume?.name ?? 'None', answers: state.memory.length, receipts: state.history.length };
}
export async function restoreBackup(text: string, passphrase: string, previewHash: string) {
  if (await textHash(text) !== previewHash) throw new Error('Backup changed after preview. Review it again.');
  const { backup, key, state } = await openBackup(text, passphrase);
  state.revision++;
  const record = await seal(key, 'vault-state', state.revision, state);
  await db.transaction('rw', db.records, db.metadata, async () => {
    await db.metadata.put({ id: 'vault', header: backup.header }); await db.records.put(record); await db.records.delete('state');
  });
  await chrome.storage.session.clear(); await rememberKey(key, backup.header.idleMinutes); return state;
}
