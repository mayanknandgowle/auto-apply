import { useEffect, useState } from 'react';
import { jobConflicts, type JobSource } from '../core/job-sources';
import type { PanelProps } from './types';

const fieldLabel: Record<string,string> = {company:'Company',role:'Role',requisition:'Requisition ID',location:'Location',workArrangement:'Work arrangement',employmentType:'Employment type',responsibilities:'Responsibilities',requiredQualifications:'Required qualifications',preferredQualifications:'Preferred qualifications',experience:'Experience',compensation:'Compensation',documents:'Required documents'};

function SourceReview({source,busy,save}: {source:JobSource;busy:boolean;save:(source:JobSource)=>void}) {
  const [draft,setDraft]=useState(source);
  useEffect(()=>setDraft(source),[source]);
  return <details><summary>{source.kind} · {source.capturedAt.slice(0,10)} · {source.facts.length} proposed facts</summary>
    <p className="fine">{source.url || 'Pasted by you; no employer URL verified.'}</p>
    {source.kind!=='user-provided' && <label>Source classification<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as JobSource['kind']})}>{['unclassified-page','employer-posting','application','discovery'].map(k=><option key={k}>{k}</option>)}</select></label>}
    {draft.facts.map((fact,i)=><div className="evidence" key={i}><label>{fieldLabel[fact.field]}<textarea value={fact.value} maxLength={2000} onChange={e=>setDraft({...draft,facts:draft.facts.map((f,n)=>n===i?{...f,value:e.target.value,certainty:'uncertain',reviewed:false}:f)})}/></label><blockquote>{fact.excerpt}</blockquote><p>{fact.certainty==='explicit'?'Explicit source statement':'Uncertain interpretation — verify the wording'}</p><label className="inline"><input type="checkbox" checked={fact.reviewed} onChange={e=>setDraft({...draft,facts:draft.facts.map((f,n)=>n===i?{...f,reviewed:e.target.checked}:f)})}/>I reviewed this fact and its source</label></div>)}
    {!draft.facts.length&&<p>No reliable structured facts detected. Review the source and enter missing context manually.</p>}
    <button disabled={busy} onClick={()=>save(draft)}>Save source review</button>
  </details>;
}
export function JobSourcesPanel({state,busy,raw,perform}:PanelProps) {
  const conflicts=jobConflicts(state.jobSources);
  return <section className="card"><h2>Job sources & conflicts</h2><p>Captured and pasted sources stay separate. Review each source and confirm the application’s employer and role above. Missing fields remain unknown; source review does not authorize filling.</p>
    {!!conflicts.length&&<p className="warning">Different source statements need review: {conflicts.map(field=>fieldLabel[field]).join(', ')}. Nothing has been merged automatically.</p>}
    {state.jobSources.map(source=><div key={source.id}><SourceReview source={source} busy={busy} save={s=>void perform(()=>raw({type:'REVIEW_JOB_SOURCE',source:s}))}/><button className="text-button" disabled={busy} onClick={()=>void perform(()=>raw({type:'DELETE_JOB_SOURCE',id:source.id}))}>Delete this job source</button></div>)}
    {!state.jobSources.length&&<p>Inspect a job description or save pasted text in Resume to capture a source.</p>}
  </section>;
}
