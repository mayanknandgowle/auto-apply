import { useCallback, useEffect, useRef, useState } from 'react';
import { initialState, profileLabels, ProfileKey, selectedResume, type State, type UiCommand } from '../core/model';
import { explanation, manualOnly, hasValue } from '../core/policy';
import { contactCandidates, editingPrompt, importResume } from '../documents/intake';
import { runProviderDraft, providerName } from '../providers/transport';
import { sensitiveQuestion, writeBlocked } from '../core/recovery';
import { JobSourcesPanel } from './JobSourcesPanel';
import { ProviderPanel } from './ProviderPanel';
import { ResumeEditor } from './ResumeEditor';
import { resumeUploadControl, acceptsFile } from '../documents/attachment';

type View = 'application' | 'profile' | 'resume' | 'settings';
import { VaultPanel } from './VaultPanel';
import { CareerImportPanel } from './CareerImportPanel';
import { CandidateEditor } from './CandidateEditor';
import { JobPanel, AssessmentPanel, HistoryPanel, ImportsPanel } from './ReviewPanels';
import { careerEvidence } from '../core/candidate';
import type { Reply } from './types';
const emptyValues = () => Object.fromEntries(ProfileKey.options.map(key => [key, ''])) as Record<ProfileKey, string>;

export function App() {
  const [state, setState] = useState<State>(initialState);
  const current = useRef(state);
  const [view, setView] = useState<View>('application');
  const [busy, setBusy] = useState(false);
  const [connected,setConnected]=useState(false);
  const [privacyEpoch,setPrivacyEpoch]=useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [values, setValues] = useState(emptyValues);
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [retaining,setRetaining]=useState<Record<string,boolean>>({});
  const [remember, setRemember] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hindi, setHindi] = useState(false);
  const [mode, setMode] = useState<'assist' | 'autofill'>('autofill');
  const [job, setJob] = useState('');
  const [pasted, setPasted] = useState('');
  const [candidates, setCandidates] = useState<Partial<Record<ProfileKey, string>>>({});
  const [importSource, setImportSource] = useState('Pasted profile');
  const [prompt, setPrompt] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);
  const [grants, setGrants] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const running = useRef(false);

  const adopt = useCallback((next: State,reset=false) => {
    if (reset || (next.storage.locked && !current.current.storage.locked) || (!next.revision && current.current.revision > 0)) {
      setPrivacyEpoch(epoch=>epoch+1);
      abort.current?.abort(); setValues(emptyValues()); setAnswers({}); setRemember({}); setRetaining({}); setCandidates({}); setPasted(''); setPrompt(''); setEvidenceText(''); setEvidenceTitle(''); setJob(''); setSharing(null);
    }
    current.current = next; setState(next);
  }, []);
  const raw = useCallback(async (command: UiCommand): Promise<Reply> => {
    const reply = await chrome.runtime.sendMessage({ schema: 1, requestId: crypto.randomUUID(), expectedRevision: current.current.revision, command }) as Reply;
    if (!reply.ok) throw new Error(reply.error ?? 'The action could not be completed.');
    adopt(reply.state,['END','DELETE_ALL','VAULT_LOCK','BACKUP_RESTORE'].includes(command.type)); return reply;
  }, [adopt]);
  const perform = useCallback(async (fn: () => Promise<unknown>) => {
    setError(''); setNotice(''); setBusy(true);
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'The action could not be completed.'); await raw({ type: 'GET' }).catch(() => undefined); }
    finally { setBusy(false); }
  }, [raw]);
  useEffect(() => {
    let closed = false;
    let port: chrome.runtime.Port | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const refresh = (message?:{type:string}) => { abort.current?.abort(); void raw({ type: 'GET' }).then(reply=>{if(message?.type==='RESET')adopt(reply.state,true);}).catch(() => undefined); };
    const connect = () => {
      if (closed) return;
      port = chrome.runtime.connect({ name: 'applypilot-panel' });
      port.onMessage.addListener(refresh);
      port.onDisconnect.addListener(() => { if (!closed) { setConnected(false);abort.current?.abort(); reconnect = setTimeout(connect, 300); } });
      void raw({ type: 'GET' }).then(()=>{if(!closed)setConnected(true);}).catch(() => {setConnected(false);setError('Connection interrupted. Reopen ApplyPilot if it does not recover.');});
    };
    connect();
    return () => { closed = true; clearTimeout(reconnect); abort.current?.abort(); port?.disconnect(); };
  }, [raw,adopt]);
  useEffect(() => {
    setValues({ ...emptyValues(), ...Object.fromEntries(state.profile.facts.map(f => [f.key, f.value])) });
  }, [state.profile.revision]);
  useEffect(() => { setJob(state.jobText); }, [state.jobText]);
  useEffect(()=>{
    if(state.storage.mode!=='saved'||state.storage.locked)return;
    let touched=Date.now();
    const activity=()=>{if(Date.now()-touched>30000){touched=Date.now();void raw({type:'TOUCH'}).catch(()=>undefined);}};
    document.addEventListener('keydown',activity);document.addEventListener('pointerdown',activity);
    return()=>{document.removeEventListener('keydown',activity);document.removeEventListener('pointerdown',activity);};
  },[state.storage.mode,state.storage.locked,raw]);
  useEffect(() => {
    if (state.session?.state !== 'filling' || busy || running.current) return;
    const timer = setTimeout(() => {
      running.current = true;
      void perform(() => raw({ type: 'TICK' })).finally(() => { running.current = false; });
    }, 180);
    return () => clearTimeout(timer);
  }, [state.revision, state.session?.state, busy, perform, raw]);
  useEffect(() => { if (view === 'settings') void chrome.permissions.getAll().then(p => setGrants(p.origins ?? [])); }, [view, state.revision]);
  const session = state.session;
  const sharedEvidence = [...state.profile.evidence, ...careerEvidence(state.profile.candidate)];
  const panelProps = { state, busy, raw, perform };
  if (state.storage.locked) return <div className="app-shell"><main><h1>ApplyPilot</h1>{error && <div role="alert" className="alert error">{error}</div>}<VaultPanel {...panelProps}/></main></div>;
  const verified = session?.journal.filter(j => j.status === 'verified').length ?? 0;
  const pause = () => { abort.current?.abort(); void perform(() => raw({ type: 'PAUSE' })); };
  const saveProfile = (nextValues = values, evidence = state.profile.evidence, source = 'Manual entry') => raw({ type: 'PROFILE', values: nextValues, evidence, source });
  async function draft(controlId: string) {
    const controller = new AbortController(); abort.current = controller;
    const reply = await raw({ type: 'AI_BEGIN', controlId });
    if (!reply.task) throw new Error('Draft task could not be started.');
    const result = await runProviderDraft(reply.task, controller.signal);
    if (controller.signal.aborted) throw new Error('Draft cancelled.');
    await raw({ type: 'AI_RESULT', taskId: reply.task.id, result });
    setSharing(null);
  }
  return <div className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true">a<span>↗</span></span><div><strong>ApplyPilot</strong><small>Your experience. Less typing.</small></div></div><span className="pill">LOCAL ALPHA</span></header>
    <div className="session-strip" role="region" aria-label="Storage and submission policy"><span><i aria-hidden="true"/>{state.storage.mode === 'saved' ? 'Saved profile · unlocked' : 'Session only'}</span><span>No automatic submission</span></div>
    <nav aria-label="Main views">{(['application', 'profile', 'resume', 'settings'] as View[]).map(tab => <button key={tab} aria-current={view === tab ? 'page' : undefined} onClick={() => setView(tab)}>{tab === 'application' ? 'Apply' : tab[0]!.toUpperCase() + tab.slice(1)}</button>)}</nav>
    <main>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert" role="status">{notice}</div>}
      {session && <section className="bound-job" aria-label="Bound application"><div><span className="eyebrow">CURRENT APPLICATION · TAB {session.tabId}</span><strong>{session.title || 'Application page'}</strong><small>{session.origin}</small></div><button className="pause" onClick={pause}>Pause</button></section>}
      {view === 'application' && <>
        <section className="intro"><span className="eyebrow">A LITTLE HELP, EVERY STEP</span><h1>Make room for<br/><em>your next chapter.</em></h1><p>Fill the details you’ve confirmed. Review the questions that need you.</p></section>
        <section className="card"><div className="section-title"><h2>{session ? 'Your application' : 'Start with an open job page'}</h2><span className="step-tag">01</span></div>
          <p>Open a career page, click the ApplyPilot toolbar icon, then inspect. Inspection never fills or submits.</p>
          <button className="secondary full" disabled={busy || !connected || session?.state === 'filling'} onClick={() => void perform(() => raw({ type: 'INSPECT' }))}>{session ? 'Inspect current step' : 'Inspect current page'}</button>
          {session && <><button className="text-button" disabled={busy || !connected || session.state==='filling'} onClick={()=>void perform(()=>raw({type:'INSPECT',continueApplication:true,sessionId:session.id}))}>Inspect next step of this application</button><p className="fine">Use this only for the same job in the same tab and website. Prior steps and uncertain attempts stay in this application journal.</p><div className="metrics"><div><strong>{verified}</strong><span>verified writes</span></div><div><strong>{session.decisions.length}</strong><span>to review</span></div><div><strong>{session.snapshot.controls.length}</strong><span>controls found</span></div></div>
            <p className="status" role="status">{session.note}</p>
            <label>Application mode<select aria-label="Application mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="autofill">Autofill to review</option><option value="assist">Assist — one field at a time</option></select></label>
            <button className="primary full" disabled={busy || !connected || session.state === 'filling'} onClick={() => void perform(() => raw({ type: 'START', mode }))}>Help me apply <span aria-hidden="true">↗</span></button>
            <p className="fine">Sites may autosave fields before submission. Continue and upload files on the site, then inspect the next step.</p>
            {session.snapshot.warnings.map(w => <p className="warning" key={w}>{w}</p>)}
          </>}
        </section>
        {!state.profile.facts.length && <button className="onboarding-link" onClick={() => setView('profile')}><strong>Add your details</strong><span>A partial profile works. No AI key needed. →</span></button>}
        {session && <section className="card"><div className="section-title"><h2>Decisions inbox</h2><label className="inline"><input type="checkbox" checked={hindi} onChange={e => setHindi(e.target.checked)}/>हिन्दी help</label></div>
          {!session.decisions.length && <p>No unresolved questions found in the inspected controls. Review the entire page yourself before continuing.</p>}
          {session.decisions.map(decision => <article className="decision" key={decision.control.id}>
            <span className="eyebrow">{manualOnly(decision.control) ? 'COMPLETE ON THE WEBSITE' : session.approved[decision.control.id] ? 'APPROVED FOR THIS PAGE' : decision.draft ? 'DRAFTED FOR REVIEW' : 'NEEDS YOUR ANSWER'}</span>
            <h3>{decision.control.label || 'Unlabelled control — check on the website'}{decision.control.required ? ' *' : ''}</h3>
            <p>{hindi ? explanation(decision.control, true) : decision.reason}</p><p className="fine">Decision: {decision.resolution ?? 'pending'}</p>{decision.control.validation && <p className="warning">{decision.control.validation}</p>}{decision.control.options.length > 0 && <p>Exact options: {decision.control.options.map(o=>o.label).join(' · ')}</p>}<div className="button-row">{(['deferred','unknown','pending'] as const).map(resolution=><button className="text-button" key={resolution} disabled={busy || session.state==='filling'} onClick={()=>void perform(()=>raw({type:'DECISION',controlId:decision.control.id,resolution}))}>{resolution==='deferred'?'Defer':resolution==='unknown'?"I don’t know":'Review again'}</button>)}</div>
            {resumeUploadControl(decision.control) && selectedResume(state) && <div><p>Selected file: <strong>{selectedResume(state)!.name}</strong> · {Math.ceil(selectedResume(state)!.size/1024)} KB</p><p className="fine">Allowed by the page: {decision.control.file?.accept || 'No format restriction declared'}. Attaching can immediately send this file to the employer. Server processing must be checked on the website.</p><button disabled={busy || session.state==='filling' || !!decision.control.file?.name || session.uploads.some(u=>u.hash===selectedResume(state)!.hash || u.fingerprint===decision.control.fingerprint || (u.controlId===decision.control.id && u.documentToken===session.snapshot.documentToken)) || !acceptsFile(decision.control.file?.accept??'',selectedResume(state)!.name,selectedResume(state)!.mime)} onClick={()=>void perform(()=>raw({type:'ATTACH_RESUME',controlId:decision.control.id,hash:selectedResume(state)!.hash}))}>Attach selected resume to this input</button></div>}
            {!manualOnly(decision.control) && !writeBlocked(session,decision.control) && !hasValue(decision.control) && <>
              <label><span className="sr-only">Answer for {decision.control.label}</span>{decision.control.choice ? <select aria-label={`Answer for ${decision.control.label}`} value={answers[decision.control.id] ?? ''} onChange={e=>setAnswers({...answers,[decision.control.id]:e.target.value})}><option value="">Keep unselected</option><option value="true">Select this exact option: {decision.control.choice.option}</option></select> : decision.control.kind === 'select' ? <select aria-label={`Answer for ${decision.control.label}`} value={answers[decision.control.id] ?? ''} onChange={e => setAnswers({ ...answers, [decision.control.id]: e.target.value })}><option value="">Choose an option</option>{decision.control.options.filter(o => o.value).map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select> : <textarea aria-label={`Answer for ${decision.control.label}`} value={answers[decision.control.id] ?? decision.draft ?? ''} maxLength={decision.control.maxLength > 0 ? decision.control.maxLength : 10000} onChange={e => setAnswers({ ...answers, [decision.control.id]: e.target.value })} rows={3}/>}</label>
              {decision.evidenceIds?.map(id => <details key={id}><summary>Supporting evidence</summary><p>{sharedEvidence.find(e => e.id === id)?.text ?? 'Evidence unavailable'}</p></details>)}
              {sensitiveQuestion(decision.control.label) && <label className="inline"><input type="checkbox" checked={retaining[decision.control.id]??false} onChange={e=>setRetaining({...retaining,[decision.control.id]:e.target.checked})}/>Keep this sensitive answer in my encrypted application journal. Otherwise I will answer on the website.</label>}<label className="inline"><input type="checkbox" checked={remember[decision.control.id] ?? false} onChange={e => setRemember({...remember, [decision.control.id]: e.target.checked})}/>Remember for this confirmed job context</label><div className="button-row"><button disabled={busy} onClick={() => void perform(() => raw({ type: 'ANSWER', controlId: decision.control.id, value: answers[decision.control.id] ?? decision.draft ?? '', remember: remember[decision.control.id] ?? false, retainSensitive:retaining[decision.control.id]??false }))}>Approve for this page</button>
              {['textarea', 'text'].includes(decision.control.kind) && !sensitiveQuestion(decision.control.label) && <button className="text-button" disabled={busy} onClick={() => setSharing(decision.control.id)}>Draft with {providerName(state.provider.kind)}</button>}</div>
              {sharing === decision.control.id && <div className="sharing"><h4>Review what will be shared</h4><p>{providerName(state.provider.kind)} receives this question, the job description, and your confirmed career evidence below. It receives no contact fields or original file. Review the evidence for personal details.</p><details open><summary>Shared career evidence and job text</summary><pre>{sharedEvidence.map(e => `${e.title}\n${e.text}`).join('\n\n')}<br/>{state.jobText || 'No job description supplied.'}</pre></details><p className="fine">Draft requests used: {state.aiRequests}/5. Provider charges and data terms apply.</p><button disabled={busy} onClick={() => void perform(() => draft(decision.control.id))}>Send and draft for review</button><button className="text-button" onClick={() => { abort.current?.abort(); setSharing(null); }}>Cancel</button></div>}
            </>}
          </article>)}
        </section>}
        {session?.uploads.map(upload=><p className="alert" key={upload.id}>{upload.name}: {upload.status}. Server processing not verified.</p>)}<JobPanel key={`JobPanel:${privacyEpoch}`} {...panelProps}/><JobSourcesPanel {...panelProps}/><HistoryPanel key={`HistoryPanel:${privacyEpoch}`} {...panelProps}/>{session && session.journal.length > 0 && <section className="card"><h2>Activity</h2><ol className="activity">{session.journal.slice(-12).reverse().map(action => <li key={action.id}><div><strong>{action.label}</strong><small>{action.status === 'verified' ? 'Written and verified' : action.status === 'intent' ? 'Pending reconciliation' : action.status}</small></div>{action.status === 'verified' && action.documentToken===session.snapshot.documentToken && !session.snapshot.controls.find(c=>c.id===action.controlId)?.choice && <button className="text-button" disabled={busy || session.state === 'filling'} onClick={() => void perform(() => raw({ type: 'UNDO', actionId: action.id }))}>Undo</button>}</li>)}</ol></section>}
      </>}
      {view === 'profile' && <>
        <section className="intro compact"><span className="eyebrow">YOUR SOURCE OF TRUTH</span><h1>A profile that<br/><em>sounds like you.</em></h1><p>Only confirmed details are used. Leave anything unknown blank.</p></section>
        <form className="card" onSubmit={e => { e.preventDefault(); void perform(() => saveProfile()); }}><h2>Contact details</h2><div className="form-grid">{ProfileKey.options.map(field => <label key={field}>{profileLabels[field]}<input type={field === 'email' ? 'email' : ['linkedin', 'github', 'portfolio'].includes(field) ? 'url' : 'text'} value={values[field]} disabled={busy} maxLength={500} onChange={e => setValues({ ...values, [field]: e.target.value })}/></label>)}</div><button className="primary full" disabled={busy}>Confirm and save profile</button><p className="fine">Encrypted locally. Choose session-only or a passphrase-protected saved profile in Settings.</p></form>
        <CareerImportPanel key={`CareerImport:${privacyEpoch}`} {...panelProps}/><CandidateEditor key={`CandidateEditor:${privacyEpoch}`} {...panelProps}/><section className="card"><h2>Career evidence</h2><p>Add an experience or project in your own words. AI drafts can cite this evidence only after you confirm it.</p><label>Evidence title<input value={evidenceTitle} maxLength={120} onChange={e => setEvidenceTitle(e.target.value)} placeholder="For example, inventory project"/></label><label>Verified experience<textarea aria-label="Verified experience" value={evidenceText} maxLength={3000} onChange={e => setEvidenceText(e.target.value)} rows={5} placeholder="What you did, the tools you used, and outcomes you can support."/></label><button disabled={busy || !evidenceText.trim() || !evidenceTitle.trim()} onClick={() => void perform(async () => { await saveProfile(values, [...state.profile.evidence, { id: crypto.randomUUID(), title: evidenceTitle.trim(), text: evidenceText.trim(), confirmedAt: new Date().toISOString() }]); setEvidenceText(''); setEvidenceTitle(''); })}>Confirm and add evidence</button>{state.profile.evidence.map(item => <article className="evidence" key={item.id}><h3>{item.title}</h3><p>{item.text}</p><button className="text-button" disabled={busy} onClick={() => void perform(() => saveProfile(values, state.profile.evidence.filter(e => e.id !== item.id)))}>Remove</button></article>)}</section>
        <section className="card"><h2>Import a profile</h2><p>Paste exported profile text, or import your resume in the Resume tab. Naukri/Indeed direct page import is not available in this build.</p><label>Profile text<textarea aria-label="Profile text" value={pasted} onChange={e => setPasted(e.target.value)} maxLength={60000} rows={5}/></label><button onClick={() => { setCandidates(contactCandidates(pasted)); setImportSource('Pasted profile'); setNotice('Review detected contact details below. Other information can be entered manually.'); }}>Review extracted details</button></section>
        {Object.keys(candidates).length > 0 && <section className="card"><h2>Review imported details</h2>{Object.entries(candidates).map(([field, value]) => <article className="decision" key={field}><h3>{profileLabels[field as ProfileKey]}</h3><p>{values[field as ProfileKey]===value?'Duplicate':values[field as ProfileKey]?'Conflict — review before replacing':'Addition'}</p><label>Review imported {profileLabels[field as ProfileKey]}<input value={value} maxLength={500} disabled={busy} onChange={e=>setCandidates({...candidates,[field]:e.target.value})}/></label><p>Imported: {value}</p>{values[field as ProfileKey] && <p>Current: {values[field as ProfileKey]}</p>}<button disabled={busy} onClick={() => void perform(async () => { await raw({type: 'IMPORT_CONTACT', key: field as ProfileKey, value: value!, source: importSource}); const rest = { ...candidates }; delete rest[field as ProfileKey]; setCandidates(rest); })}>Confirm imported value</button><button className="text-button" disabled={busy} onClick={()=>setCandidates(current=>{const next={...current};delete next[field as ProfileKey];return next;})}>Keep existing</button></article>)}</section>}
      </>}
      {view === 'profile' && <ImportsPanel key={`ImportsPanel:${privacyEpoch}`} {...panelProps}/>}
      {view === 'resume' && <>
        <section className="intro compact"><span className="eyebrow">KEEP YOUR STORY INTACT</span><h1>Your resume,<br/><em>in your hands.</em></h1><p>Parse locally. Review extracted text. Keep the original unchanged.</p></section>
        <section className="card"><h2>Original resume</h2><label className="upload">Choose PDF or DOCX<input type="file" accept=".pdf,.docx" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void perform(async () => { const resume = await importResume(file); await raw({ type: 'RESUME_FILE', resume }); setCandidates(contactCandidates(resume.text)); setImportSource(resume.name); setNotice('Original stored locally. Review detected details in Profile before using them.'); }); }}/></label><p className="fine">Up to 3 MB / 20 PDF pages. No OCR. Selecting a file sends nothing to an AI provider.</p>
          {state.resume && <><div className="file-info"><strong>{state.resume.name}</strong><small>{Math.ceil(state.resume.size / 1024)} KB · immutable original</small></div><p>Upload this original file using the employer’s file picker. Attachment processing is not verified by this build.</p><details><summary>Review extracted text</summary><pre>{state.resume.text}</pre></details><button className="text-button" onClick={() => setView('profile')}>Review imported contact details →</button><button className="text-button" disabled={busy} onClick={() => void perform(() => raw({ type: 'DELETE_RESUME' }))}>Remove local resume</button></>}
        </section>
        <section className="card"><h2>Job description</h2><p>Check the captured text or paste the official description. Save the text before reviewing the evidence assessment below.</p><label>Job description<textarea aria-label="Job description" value={job} maxLength={16000} rows={7} onChange={e => setJob(e.target.value)}/></label><button disabled={busy} onClick={() => void perform(() => raw({ type: 'JOB', text: job }))}>Save job description</button></section>
        <AssessmentPanel key={`AssessmentPanel:${privacyEpoch}`} {...panelProps}/><ResumeEditor key={`ResumeEditor:${privacyEpoch}`} {...panelProps}/><section className="card"><h2>Editing prompt</h2><p>Create a prompt to review and redact before copying to an editor of your choice. No document is generated or sent automatically.</p><button disabled={!state.resume} onClick={() => setPrompt(editingPrompt(selectedResume(state)?.text ?? '', job, sharedEvidence.map(e => e.text).join('\n')))}>Prepare editing prompt</button>{prompt && <><label>Review and redact prompt<textarea aria-label="Review and redact prompt" value={prompt} rows={10} onChange={e => setPrompt(e.target.value)}/></label><button onClick={() => void perform(async () => { await navigator.clipboard.writeText(prompt); setNotice('Reviewed prompt copied.'); })}>Copy reviewed prompt</button></>}</section>
      </>}
      {view === 'settings' && <>
        <section className="intro compact"><span className="eyebrow">YOUR DATA, YOUR CHOICES</span><h1>Stay in<br/><em>the pilot’s seat.</em></h1></section>
        <VaultPanel key={`${state.storage.mode}:${privacyEpoch}`} {...panelProps}/><ProviderPanel key={`ProviderPanel:${privacyEpoch}`} {...panelProps} onRequest={controller => { abort.current = controller; }}/>
        <section className="card"><h2>Site adapter</h2><p>Experimental Lever hosted-form interpretation: {state.adaptersEnabled?'enabled':'disabled'}</p><button disabled={busy} onClick={()=>void perform(()=>raw({type:'ADAPTERS',enabled:!state.adaptersEnabled}))}>{state.adaptersEnabled?'Disable Lever adapter':'Enable Lever adapter'}</button><p>Generic native controls remain available when disabled. All navigation and submission remain manual.</p></section><section className="card"><h2>Privacy & site access</h2><p>No account, backend, analytics, or browser sync. Sensitive records are encrypted in local IndexedDB; the key stays in trusted session storage. Browser restart, extension reload/update, or ending a session removes usable keys. Saved profiles remain encrypted and require their passphrase.</p><p>Session-only data is deleted when the session ends. Saved profiles lock until you unlock them. Keep your original documents outside the extension.</p>{grants.map(origin => <div className="permission" key={origin}><span>{origin}</span><button onClick={() => void perform(async () => { await chrome.permissions.remove({ origins: [origin] }); setGrants((await chrome.permissions.getAll()).origins ?? []); })}>Revoke</button></div>)}<button className="danger full" disabled={busy} onClick={() => { abort.current?.abort(); void perform(async () => { await raw({ type: 'END' }); setAnswers({}); setCandidates({}); setPasted(''); setPrompt(''); setEvidenceText(''); setEvidenceTitle(''); setJob(''); setSharing(null); setNotice(state.storage.mode === 'saved' ? 'Saved profile locked. Session keys removed.' : 'Session ended. Usable local data and keys removed.'); }); }}>{state.storage.mode === 'saved' ? 'End session & lock saved profile' : 'End session & delete local data'}</button><p className="fine">Deletion does not remove information already sent to a website or provider, and is not forensic secure erasure.</p></section>
      </>}
      <footer><span className="footer-mark" aria-hidden="true">↗</span><p>Built for thoughtful applications.<br/>Internal alpha · Reviewed native controls.</p></footer>
    </main>
    <div className="bottom-bar" role="region" aria-label="Execution controls"><span>{busy ? 'Working…' : session?.state === 'filling' ? 'Filling with supervision' : 'You’re in control'}</span><button className="text-button" onClick={pause}>Pause / cancel AI</button></div>
  </div>;
}
