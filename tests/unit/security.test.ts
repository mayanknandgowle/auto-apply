import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { seal, unseal, readState, writeState, endSession, deleteAllData, createVault, unlockVault, lockVault, exportBackup, previewBackup, restoreBackup, changePassphrase } from '../../src/storage/repository';
import { initialState } from '../../src/core/model';
import { geminiRequest, validateDraft } from '../../src/providers/gemini';

const store: Record<string, unknown> = {};
beforeEach(async () => {
  vi.stubGlobal('chrome', { storage: { session: { setAccessLevel: async () => undefined, get: async (key: string | string[]) => Object.fromEntries((Array.isArray(key) ? key : [key]).map(k => [k,store[k]])), set: async (data: Record<string, unknown>) => Object.assign(store, data), remove:async(key:string)=>{delete store[key];}, clear: async () => { for (const key of Object.keys(store)) delete store[key]; } }, local: { setAccessLevel: async () => undefined } } });
  await deleteAllData();
});
describe('saved vault lifecycle', () => {
  const pass = 'synthetic-passphrase-123';
  async function saved() { const state = initialState(); state.jobText = 'Private fixture description';state.aiRequests=5; return createVault(state, pass, 1); }
  it('survives key loss, rejects wrong passphrases and resumes paused without keys', async () => {
    await saved(); store.providerKey = 'synthetic-key';
    await endSession(); expect(store.vaultKey).toBeUndefined(); expect(store.providerKey).toBeUndefined();
    expect((await readState()).storage.locked).toBe(true); expect((await readState()).jobText).toBe('');
    await expect(unlockVault('incorrect-secret')).rejects.toThrow('incorrect');
    const unlocked=await unlockVault(pass);expect(unlocked.jobText).toBe('Private fixture description');expect(unlocked.aiRequests).toBe(0);
  });
  it('idle expiry removes usable secrets and refuses writes', async () => {
    const state = await saved(); store.unlockUntil = Date.now() - 1;
    expect((await readState()).storage.locked).toBe(true);
    await expect(writeState({...state,revision:state.revision+1},state.revision)).rejects.toThrow('locked');
    expect(store.vaultKey).toBeUndefined();
  });
  it('backup preview, tamper rejection and restore preserve the original on failure', async () => {
    await saved(); const backup = await exportBackup();
    expect(backup).not.toContain('Private fixture'); expect(backup).not.toContain('vaultKey');
    const preview = await previewBackup(backup,pass);
    await expect(restoreBackup(backup+' ',pass,preview.hash)).rejects.toThrow('changed');
    const damaged = JSON.parse(backup); damaged.record.data = (damaged.record.data[0]==='A'?'B':'A')+damaged.record.data.slice(1);
    await expect(previewBackup(JSON.stringify(damaged),pass)).rejects.toThrow();
    const changedPolicy=JSON.parse(backup);changedPolicy.header.idleMinutes=60;
    await expect(previewBackup(JSON.stringify(changedPolicy),pass)).rejects.toThrow();
    expect((await readState()).jobText).toBe('Private fixture description');
    await deleteAllData(); await restoreBackup(backup,pass,preview.hash);
    expect((await readState()).jobText).toBe('Private fixture description');
    expect((await readState()).session).toBeNull();
  });
  it('rewrapping changes the live passphrase without changing historical backups', async () => {
    await saved(); const backup = await exportBackup();
    await changePassphrase(pass,'replacement-synthetic-pass'); await lockVault();
    await expect(unlockVault(pass)).rejects.toThrow('incorrect');
    expect((await unlockVault('replacement-synthetic-pass')).jobText).toBe('Private fixture description');
    expect((await previewBackup(backup,pass)).contactFacts).toBe(0);
    await deleteAllData(); expect((await readState()).storage.mode).toBe('session');
  });
});
describe('encrypted checkpoints', () => {
  it('encrypts, authenticates identity/revision and uses unique nonces', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
    const a = await seal(key,'profile',1,{ name:'Synthetic' });
    const b = await seal(key,'profile',1,{ name:'Synthetic' });
    expect(a.iv).not.toEqual(b.iv);
    expect(new TextDecoder().decode(a.data)).not.toContain('Synthetic');
    expect(await unseal(key,a)).toEqual({ name:'Synthetic' });
    await expect(unseal(key,{ ...a, revision:2 })).rejects.toThrow();
    await expect(unseal(key,{ ...a, id:'other' })).rejects.toThrow();
  });
  it('survives repository reopening, rejects stale writes, and loses data when key is lost', async () => {
    const state = initialState(); state.revision=1; state.jobText='Synthetic private job';
    await writeState(state,0);
    expect((await readState()).jobText).toBe('Synthetic private job');
    await expect(writeState({ ...state, revision:2 },0)).rejects.toThrow('State changed');
    delete store.encryptionKey;
    expect((await readState()).jobText).toBe('');
  });
  it('end session removes provider credentials and data', async () => {
    const state=initialState(); state.revision=1; await writeState(state,0); store.providerKey='synthetic-test';
    await endSession(); expect(store.providerKey).toBeUndefined(); expect((await readState()).revision).toBe(0);
  });
});
describe('provider isolation and evidence', () => {
  it('rejects invented evidence IDs, mismatched quotes, and unsupported drafts', () => {
    const id=crypto.randomUUID(); const evidence=[{ id, text:'Built a TypeScript inventory tool.', title:'Project' }];
    const result={ answer:'I built an inventory tool.', abstain:false, reason:'', evidence:[{ id, quote:'TypeScript inventory tool' }] };
    expect(validateDraft(result,evidence).answer).toContain('inventory');
    expect(()=>validateDraft({ ...result,evidence:[{ id:crypto.randomUUID(),quote:'TypeScript' }] },evidence)).toThrow();
    expect(()=>validateDraft({ ...result,evidence:[{ id,quote:'Raised revenue 50%' }] },evidence)).toThrow();
    expect(()=>validateDraft({ ...result,evidence:[] },evidence)).toThrow();
  });
  it('binds keys to a fixed host with no redirects and never retries rate limits', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{ status:429 })); vi.stubGlobal('fetch',fetcher);
    await expect(geminiRequest('test-only-key','test-model','test',new AbortController().signal)).rejects.toThrow('quota');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options]=fetcher.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
    expect(url).not.toContain('test-only-key'); expect(options.redirect).toBe('error');
    expect(options.headers['x-goog-api-key']).toBe('test-only-key');
  });
  it('rejects URL-like model IDs before networking', async () => {
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(geminiRequest('key','https://evil.invalid','test',new AbortController().signal)).rejects.toThrow('valid');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
