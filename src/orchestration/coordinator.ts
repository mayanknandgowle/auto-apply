import { z } from 'zod';
import { Envelope, initialState, publicState, selectedResume, type State, type Session, type Journal } from '../core/model';
import { explanation, manualOnly, resolveValue, trustedUi } from '../core/policy';
import { readState as readStoredState, writeState, endSession, lockVault, touchVault, createVault, unlockVault, changePassphrase, exportBackup, previewBackup, restoreBackup, deleteAllData } from '../storage/repository';
import { emptyJob, makeMemory, memoryMatch } from '../core/reuse';
import { careerEvidence } from '../core/candidate';
import { profileCommand } from './profile-commands';
import { providerUrl } from '../providers/transport';
import { acceptsFile, resumeUploadControl } from '../documents/attachment';
async function readState():Promise<State> {
  try{return await readStoredState();}
  catch {const state=initialState();state.storage={mode:'saved',locked:true,idleMinutes:15,recoveryError:'Local data could not be read. No records were reset. Export the encrypted data for recovery, restore a known-good backup, or explicitly delete all data.'};return state;}
}
import { activeTab, inspectTab, sendDriver } from '../browser/client';
import { validateDraft, type AiTask } from '../providers/gemini';

export class Coordinator {
  private queue: Promise<unknown> = Promise.resolve();
  private panels = new Set<chrome.runtime.Port>();
  private interrupted = 0;
  private initialized = false;
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async commit(state: State) {
    state.memory = state.memory.filter(m => Date.parse(m.expiresAt) > Date.now());
    if (state.retention !== 'keep') state.history = state.history.filter(h => Date.parse(h.at) > Date.now() - Number(state.retention) * 86400000);
    const old = state.revision;
    state.revision++;
    await writeState(state, old);
  }
  async recover() {
    if (this.initialized) return;
    this.initialized = true;
    const state = await readState();
    if (state.session?.state === 'filling') {
      this.pauseState(state.session, 'Worker restarted. Inspect the page before resuming; pending writes will not be repeated.');
      await this.commit(state);
    }
  }
  connect(port: chrome.runtime.Port) {
    if (port.name !== 'applypilot-panel' || !port.sender || !trustedUi(port.sender, chrome.runtime.id, chrome.runtime.getURL(''))) return port.disconnect();
    this.panels.add(port);
    port.onDisconnect.addListener(() => { this.panels.delete(port); if (!this.panels.size) void this.interrupt('Panel closed. Inspect again before resuming.'); });
  }
  private pauseState(session: Session, note: string) {
    session.state = 'paused'; session.generation++; session.approved = {}; session.note = note;
  }
  async interrupt(note: string) {
    this.interrupted++;
    return this.enqueue(async () => {
      const state = await readState();
      if (!state.session) return;
      this.pauseState(state.session, note);
      await sendDriver(state.session.tabId, { type: 'PAUSE', generation: state.session.generation }).catch(() => undefined);
      await this.commit(state);
      for (const port of this.panels) { try { port.postMessage({ type: 'REFRESH' }); } catch { /* closed */ } }
    });
  }
  private refreshPanels(reset=false) {
    for (const port of this.panels) { try { port.postMessage({ type: reset?'RESET':'REFRESH' }); } catch { /* closed */ } }
  }
  async expireVault() {
    this.interrupted++;
    return this.enqueue(async () => {
      const { unlockUntil } = await chrome.storage.session.get('unlockUntil');
      if (typeof unlockUntil === 'number' && unlockUntil > Date.now()) return;
      await lockVault(); this.refreshPanels(true);
    });
  }
  async receive(raw: unknown, sender: chrome.runtime.MessageSender) {
    if (!trustedUi(sender, chrome.runtime.id, chrome.runtime.getURL(''))) throw new Error('Only the ApplyPilot panel can authorize this action.');
    if (JSON.stringify(raw).length > 12500000) throw new Error('Message exceeds the input limit.');
    const message = Envelope.parse(raw);
    if (['PAUSE', 'END', 'VAULT_LOCK', 'DELETE_ALL', 'BACKUP_RESTORE'].includes(message.command.type)) this.interrupted++;
    return this.enqueue(async () => {
      await this.recover();
      let state = await readState();
      const command = message.command;
      if (command.type === 'GET' || command.type === 'TOUCH') {
        if(!state.storage.locked){
          if(command.type==='TOUCH')await touchVault();
          const expiredMemory=state.memory.some(m=>Date.parse(m.expiresAt)<=Date.now());
          const expiredHistory=state.retention!=='keep'&&state.history.some(h=>Date.parse(h.at)<=Date.now()-Number(state.retention)*86400000);
          if(expiredMemory||expiredHistory)await this.commit(state);
        }
        return { state: publicState(state) };
      }
      if (command.type === 'END' || command.type === 'VAULT_LOCK' || command.type === 'DELETE_ALL') {
        if (state.session) await sendDriver(state.session.tabId, { type: 'PAUSE', generation: state.session.generation + 1 }).catch(() => undefined);
        if (command.type === 'DELETE_ALL') await deleteAllData(); else await endSession();
        this.refreshPanels(true); return { state: publicState(await readState()) };
      }
      if (command.type === 'VAULT_UNLOCK') { state = await unlockVault(command.passphrase); this.refreshPanels(); return { state: publicState(state) }; }
      if (command.type === 'BACKUP_EXPORT') return { state: publicState(state), backup: await exportBackup() };
      if (command.type === 'BACKUP_PREVIEW') {
        const preview = await previewBackup(command.backup, command.passphrase);
        await chrome.storage.session.set({ backupPreview: preview.hash });
        return { state: publicState(state), preview };
      }
      if (command.type === 'BACKUP_RESTORE') {
        const { backupPreview } = await chrome.storage.session.get('backupPreview');
        if (backupPreview !== command.previewHash) throw new Error('Preview this backup before replacing local data.');
        if (state.session) await sendDriver(state.session.tabId, { type: 'PAUSE', generation: state.session.generation + 1 }).catch(() => undefined);
        state = await restoreBackup(command.backup, command.passphrase, command.previewHash);
        this.refreshPanels(true); return { state: publicState(state) };
      }
      if (state.storage.locked) throw new Error('Unlock your saved profile before continuing.');
      if (command.type === 'DOWNLOAD_RESUME') { const artifact=selectedResume(state);if(!artifact)throw new Error('Select a resume first.');return {state:publicState(state),artifact}; }
      if (message.expectedRevision !== state.revision && command.type !== 'PAUSE') throw new Error('The session changed. Refresh and try again.');
      if (!['TICK', 'AI_RESULT'].includes(command.type)) await touchVault();
      if (state.requestIds.includes(message.requestId)) throw new Error('This command was already handled. Refresh first.');
      state.requestIds = [...state.requestIds, message.requestId].slice(-100);
      let task: AiTask | undefined;
      if (await profileCommand(state, command)) { await this.commit(state); return { state: publicState(state) }; }
      switch (command.type) {
        case 'VAULT_CREATE':
          if (state.session) this.pauseState(state.session, 'Saved profile enabled. Inspect again before continuing.');
          state = await createVault(state, command.passphrase, command.idleMinutes);
          this.refreshPanels(); return { state: publicState(state) };
        case 'VAULT_REWRAP': await changePassphrase(command.oldPassphrase, command.newPassphrase); break;
        case 'PROFILE': {
          state.profile.revision++;
          state.profile.facts = Object.entries(command.values).filter(([, value]) => value.trim()).map(([key, value]) => {
            const old = state.profile.facts.find(f => f.key === key);
            if (old?.value === value.trim()) return old;
            return { id: old?.id ?? crypto.randomUUID(), key: key as State['profile']['facts'][number]['key'], value: value.trim(), source: old?.value === value.trim() ? old.source : command.source, confirmedAt: new Date().toISOString(), revision: (old?.revision ?? 0) + 1 };
          });
          state.profile.evidence = command.evidence;
          if (state.session) this.pauseState(state.session, 'Profile updated. Inspect again to use the new facts.');
          break;
        }
        case 'INSPECT': {
          const tab = await activeTab();
          const snapshot = await inspectTab(tab.id);
          const existing = state.session;
          const same = existing?.tabId === tab.id && existing.origin === new URL(snapshot.url).origin && existing.url === snapshot.url;
          if(state.job.url && state.job.url!==snapshot.url)state.job={...emptyJob(),revision:state.job.revision+1};
          if(existing && !same && !snapshot.jobText){state.jobText='';state.assessment=null;}
          const journal = same ? existing.journal : [];
          // An interrupted intent is reconciled, never blindly retried.
          for (const entry of journal.filter(e => e.status === 'intent')) {
            const control = snapshot.controls.find(c => c.id === entry.controlId && c.fingerprint === entry.fingerprint);
            entry.status = snapshot.documentToken === entry.documentToken && control?.value === entry.after && !control.invalid ? 'verified' : 'uncertain';
          }
          state.session = { id: same ? existing.id : crypto.randomUUID(), tabId: tab.id, origin: new URL(snapshot.url).origin, url: snapshot.url, title: snapshot.heading, state: 'ready', generation: (existing?.generation ?? 0) + 1, snapshot, decisions: [], journal, approved: {}, uploads:same?existing.uploads:[], note: 'Page inspected. No fields have been changed by this inspection.', startedAt: same ? existing.startedAt : new Date().toISOString(), mode: existing?.mode ?? 'autofill' };
          this.decisions(state.session, state);
          if (snapshot.jobText && snapshot.jobText !== state.jobText) { state.jobText = snapshot.jobText; state.assessment = null; }
          break;
        }
        case 'START': {
          const session = this.requireSession(state);
          await this.assertActive(session);
          if (!this.panels.size) throw new Error('Keep the ApplyPilot panel open while filling.');
          const snapshot = await inspectTab(session.tabId);
          if (snapshot.url !== session.url || snapshot.documentToken !== session.snapshot.documentToken) throw new Error('The page changed. Inspect this step before starting.');
          session.snapshot = snapshot; session.state = 'filling'; session.mode = command.mode; session.generation++;
          session.note = 'Filling one verified field at a time. The site may autosave entries.';
          await sendDriver(session.tabId, { type: 'BIND', sessionId: session.id, generation: session.generation, documentToken: snapshot.documentToken });
          break;
        }
        case 'TICK':
          try { await this.tick(state); }
          catch { if (state.session) this.pauseState(state.session, 'Execution stopped because the page or permission changed. Inspect the intended application before resuming.'); }
          break;
        case 'PAUSE': {
          if (state.session) {
            this.pauseState(state.session, 'Paused. Existing entries are preserved. Inspect again to resume.');
            await sendDriver(state.session.tabId, { type: 'PAUSE', generation: state.session.generation }).catch(() => undefined);
          }
          break;
        }
        case 'ANSWER': {
          const session = this.requireSession(state);
          const decision = session.decisions.find(d => d.control.id === command.controlId);
          if (!decision || manualOnly(decision.control)) throw new Error('Complete this question on the website.');
          if (decision.control.value) throw new Error('This field already contains an answer. Edit it on the website.');
          if (!command.value.trim()) throw new Error('Enter an answer or complete it on the website.');
          if (decision.control.kind === 'select' && !decision.control.options.some(o => o.value === command.value)) throw new Error('Select one of the exact options.');
          session.approved[command.controlId] = { value: command.value, fingerprint: decision.control.fingerprint, documentToken: session.snapshot.documentToken };
          if (command.remember) {
            const memory = makeMemory(decision.control, command.value, state);
            state.memory = [...state.memory.filter(m => !(m.question === memory.question && m.origin === memory.origin && m.company === memory.company && m.role === memory.role && m.country === memory.country)), memory].slice(-200);
          }
          session.note = 'Answer approved for this page only. Choose Help me apply to fill it.';
          break;
        }
        case 'UNDO': await this.undo(state, command.actionId); break;
        case 'ATTACH_RESUME': await this.attach(state,command.controlId,command.hash);break;
        case 'RESUME_FILE': state.resume = command.resume; state.selectedVariant=null;state.variants=[]; state.assessment = null; if (state.session) this.pauseState(state.session, 'Selected resume changed. Review and upload the selected file manually.'); break;
        case 'DELETE_RESUME': state.resume = null; state.selectedVariant=null;state.variants=[];state.assessment = null; break;
        case 'JOB': state.jobText = command.text; state.assessment = null; if (state.session) this.pauseState(state.session, 'Job description updated. Inspect again before continuing.'); break;
        case 'PROVIDER':
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/.test(command.model) || command.model.includes('://')) throw new Error('Enter a model ID, without a URL.');
          if (!await chrome.permissions.contains({origins:[`${new URL(providerUrl(command)).origin}/*`]})) throw new Error('Grant access to the selected provider first.');
          await chrome.storage.session.set({ providerKey: command.key, providerBinding: JSON.stringify({kind:command.kind,endpoint:command.endpoint,model:command.model}) });
          await chrome.storage.session.remove('aiTask');
          state.provider = { kind: command.kind, endpoint: command.endpoint, model: command.model, configured: !!command.key }; break;
        case 'AI_BEGIN': {
          const session = this.requireSession(state);
          await this.assertActive(session);
          const decision = session.decisions.find(d => d.control.id === command.controlId);
          if (!decision || !['textarea', 'text'].includes(decision.control.kind) || manualOnly(decision.control)) throw new Error('This question needs your own answer.');
          const evidence = [...state.profile.evidence, ...careerEvidence(state.profile.candidate)];
          if (!state.provider.configured || !evidence.length) throw new Error('Add confirmed career evidence in Profile and configure Gemini first.');
          if (state.aiRequests >= 5) throw new Error('This session has reached its 5-request drafting limit. Manual answers remain available.');
          state.aiRequests++;
          task = { id: crypto.randomUUID(), controlId: command.controlId, generation: session.generation, profileRevision: state.profile.revision, documentToken: session.snapshot.documentToken, snapshotId: session.snapshot.snapshotId, model: state.provider.model, kind:state.provider.kind, endpoint:state.provider.endpoint, question: decision.control.label, evidence: evidence.map(({ id, title, text }) => ({ id, title, text })), jobText: state.jobText };
          if (JSON.stringify(task).length > 24000) throw new Error('Reduce the career evidence or job description before drafting.');
          await chrome.storage.session.set({ aiTask: task }); break;
        }
        case 'AI_RESULT': {
          const { aiTask } = await chrome.storage.session.get('aiTask') as { aiTask?: AiTask };
          const session = this.requireSession(state);
          if (!aiTask || aiTask.id !== command.taskId || aiTask.generation !== session.generation || aiTask.profileRevision !== state.profile.revision || aiTask.documentToken !== session.snapshot.documentToken || aiTask.snapshotId !== session.snapshot.snapshotId) throw new Error('The AI result is stale. Review the current page before drafting again.');
          await this.assertActive(session);
          const result = validateDraft(command.result, aiTask.evidence);
          const decision = session.decisions.find(d => d.control.id === aiTask.controlId);
          if (decision) { decision.draft = result.abstain ? undefined : result.answer; decision.reason = result.abstain ? result.reason.slice(0, 400) : 'Drafted for review. Check every claim against the cited evidence before approving.'; decision.evidenceIds = result.evidence.map(e => e.id); }
          await chrome.storage.session.remove('aiTask'); break;
        }
      }
      await this.commit(state);
      return { state: publicState(state), ...(task ? { task } : {}) };
    });
  }
  private requireSession(state: State) { if (!state.session) throw new Error('Inspect the current application first.'); return state.session; }
  private async attach(state:State,controlId:string,hash:string) {
    const session=this.requireSession(state),artifact=selectedResume(state),epoch=this.interrupted;
    if(!artifact || artifact.hash!==hash || session.state==='filling' || !this.panels.size)throw new Error('Pause, select the exact resume, and review the upload first.');
    if(session.uploads.length>=20 || session.uploads.some(u=>u.controlId===controlId&&u.documentToken===session.snapshot.documentToken))throw new Error('This attachment already has an attempt. Inspect the visible result and finish manually; no automatic retry.');
    await this.assertActive(session);const snapshot=await inspectTab(session.tabId);
    const old=session.snapshot.controls.find(c=>c.id===controlId),control=snapshot.controls.find(c=>c.id===controlId);
    if(snapshot.url!==session.url || snapshot.documentToken!==session.snapshot.documentToken || !old || !control || old.fingerprint!==control.fingerprint || !resumeUploadControl(control) || control.file?.name || !acceptsFile(control.file?.accept??'',artifact.name,artifact.mime))throw new Error('Upload control changed, contains a file, or does not accept this format. Complete it manually.');
    session.snapshot=snapshot;session.state='paused';session.generation++;session.approved={};
    const upload={id:crypto.randomUUID(),controlId,documentToken:snapshot.documentToken,hash:artifact.hash,name:artifact.name,status:'intent' as 'intent'|'attached-unverified'|'uncertain',at:new Date().toISOString()};session.uploads.push(upload);await this.commit(state);
    try {
      if(epoch!==this.interrupted || !this.panels.size)throw new Error('Interrupted');await this.assertActive(session);
      await sendDriver(session.tabId,{type:'BIND',sessionId:session.id,generation:session.generation,documentToken:snapshot.documentToken});
      if(epoch!==this.interrupted)throw new Error('Interrupted');
      const result=z.object({attached:z.boolean()}).parse(await sendDriver(session.tabId,{type:'ATTACH',actionId:upload.id,sessionId:session.id,generation:session.generation,documentToken:snapshot.documentToken,snapshotId:snapshot.snapshotId,controlId,fingerprint:control.fingerprint,before:'',expiresAt:Date.now()+3000,file:{name:artifact.name,mime:artifact.mime as 'application/pdf'|'application/vnd.openxmlformats-officedocument.wordprocessingml.document',size:artifact.size,hash:artifact.hash,base64:artifact.base64}}));
      upload.status=result.attached?'attached-unverified':'uncertain';
    }catch{upload.status='uncertain';}
    session.note=upload.status==='attached-unverified'?'Selected file attached to the native input. Server processing is not verified. Check the website before continuing.':'Attachment result is uncertain. Check the website; this attempt will not be repeated automatically.';
  }
  private async assertActive(session: Session) {
    const tab = await activeTab();
    if (tab.id !== session.tabId || tab.url !== session.url) throw new Error('Return to the bound application and inspect again. The target tab or page has changed.');
  }
  private decisions(session: Session, state: State) {
    session.decisions = session.snapshot.controls.filter(c => {
      if (c.kind === 'file' || c.kind === 'unsupported' || c.kind === 'checkbox' || c.kind === 'radio') return true;
      const duplicated = session.snapshot.controls.filter(other => other.label === c.label).length > 1;
      return (!c.value || c.invalid) && (duplicated || !(resolveValue(c, state.profile) ?? memoryMatch(c, state)?.answer));
    }).map(control => ({ control, reason: explanation(control) }));
  }
  private async tick(state: State) {
    const session = this.requireSession(state);
    if (session.state !== 'filling' || !this.panels.size) return;
    const epoch = this.interrupted;
    await this.assertActive(session);
    const snapshot = await inspectTab(session.tabId);
    if (snapshot.documentToken !== session.snapshot.documentToken || snapshot.url !== session.url) {
      this.pauseState(session, 'Page changed. Inspect the new step before resuming.'); return;
    }
    session.snapshot = snapshot;
    const next = snapshot.controls.map(control => {
      const approved = session.approved[control.id];
      const exactApproval = approved?.documentToken === snapshot.documentToken && approved.fingerprint === control.fingerprint;
      const duplicate = snapshot.controls.filter(c => c.label === control.label).length > 1;
      const value = exactApproval ? approved.value : !duplicate ? resolveValue(control, state.profile) ?? memoryMatch(control, state)?.answer : undefined;
      return { control, value };
    }).find(({ control, value }) => !manualOnly(control) && !control.value && value !== undefined && !session.journal.some(j => j.controlId === control.id && j.documentToken === snapshot.documentToken && ['uncertain', 'intent'].includes(j.status)));
    if (!next) {
      this.decisions(session, state);
      if (!snapshot.controls.length) {
        session.state = 'awaiting-user';
        session.note = 'No supported native controls were found. Complete this step on the website, then inspect again.';
        return;
      }
      session.state = session.decisions.length ? 'awaiting-user' : 'review';
      session.note = session.decisions.length ? 'Review the questions below. Continue to the next step on the website, then inspect again.' : 'Known fields are filled. Review this step and continue manually. ApplyPilot will not click Next or Submit.';
      return;
    }
    if (epoch !== this.interrupted || !this.panels.size) { this.pauseState(session, 'Execution paused before the next field.'); return; }
    const { control, value } = next;
    const action: Journal = { id: crypto.randomUUID(), controlId: control.id, label: control.label, before: control.value, after: value!, fingerprint: control.fingerprint, documentToken: snapshot.documentToken, status: 'intent', at: new Date().toISOString() };
    if (session.journal.length >= 499) throw new Error('Application action limit reached. Start a new session.');
    session.journal.push(action);
    await this.commit(state); // Intent is durable before dispatch.
    if (epoch !== this.interrupted || !this.panels.size) { action.status = 'uncertain'; this.pauseState(session, 'Paused before dispatch. Inspect to reconcile.'); return; }
    try {
      await this.assertActive(session);
      await sendDriver(session.tabId, { type: 'BIND', sessionId: session.id, generation: session.generation, documentToken: snapshot.documentToken });
      if (epoch !== this.interrupted || !this.panels.size) throw new Error('Paused');
      const result = z.object({ verified: z.boolean(), value: z.string().optional() }).parse(await sendDriver(session.tabId, { type: 'WRITE', actionId: action.id, sessionId: session.id, generation: session.generation, documentToken: snapshot.documentToken, snapshotId: snapshot.snapshotId, controlId: control.id, fingerprint: control.fingerprint, before: control.value, value: value!, expiresAt: Date.now() + 2000, undo: false }));
      action.status = result.verified && result.value === value ? 'verified' : 'uncertain';
    } catch { action.status = 'uncertain'; }
    delete session.approved[control.id];
    if (action.status !== 'verified') this.pauseState(session, 'This field could not be verified. Check it on the website, then inspect again.');
    else if (session.mode === 'assist') this.pauseState(session, 'One field filled and verified. Inspect to continue.');
  }
  private async undo(state: State, actionId: string) {
    const session = this.requireSession(state);
    await this.assertActive(session);
    if (session.state === 'filling') throw new Error('Pause before undoing a field.');
    const action = session.journal.find(j => j.id === actionId && j.status === 'verified');
    if (!action) throw new Error('That action is unavailable.');
    const snapshot = await inspectTab(session.tabId);
    const control = snapshot.controls.find(c => c.id === action.controlId);
    if (snapshot.documentToken !== action.documentToken || !control || control.fingerprint !== action.fingerprint || control.value !== action.after) throw new Error('The field has changed. Your newer edit was preserved.');
    await sendDriver(session.tabId, { type: 'BIND', sessionId: session.id, generation: session.generation, documentToken: snapshot.documentToken });
    const result = z.object({ verified: z.boolean(), value: z.string().optional() }).parse(await sendDriver(session.tabId, { type: 'WRITE', actionId: crypto.randomUUID(), sessionId: session.id, generation: session.generation, documentToken: snapshot.documentToken, snapshotId: snapshot.snapshotId, controlId: control.id, fingerprint: control.fingerprint, before: action.after, value: action.before, expiresAt: Date.now() + 2000, undo: true }));
    action.status = result.verified ? 'undone' : 'uncertain'; session.snapshot = await inspectTab(session.tabId);
  }
}
