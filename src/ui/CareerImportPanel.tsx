import { useState } from 'react';
import { careerImportExample, careerMatches, careerProposals, type CareerProposal } from '../documents/career-import';
import type { PanelProps } from './types';

function CareerDetails({record}: {record:CareerProposal['record']}) {
  const fields = 'employer' in record
    ? [['Employer',record.employer],['Job title',record.title],['Employment type',record.kind],['Start',record.start],['End',record.current?'Present':record.end],['Location',record.location],['Description',record.description]]
    : [['Institution',record.institution],['Degree',record.degree],['Status',record.status],['Start',record.start],['End',record.end],['Specialization',record.specialization],['Original grade',record.grade],['Grade scale',record.gradeScale]];
  return <div className="evidence">{fields.filter(([,value])=>value).map(([label,value])=><p key={label}><strong>{label}:</strong> {value}</p>)}<p className="fine">Source: {record.source}</p></div>;
}

export function CareerImportPanel({state,busy,raw,perform}:PanelProps) {
  const [text,setText]=useState(''),[proposals,setProposals]=useState<CareerProposal[]>([]),[skipped,setSkipped]=useState(0);
  const [targets,setTargets]=useState<Record<string,string>>({});
  function extract(value:string,source:string) { const result=careerProposals(value,source);setProposals(result.proposals);setSkipped(result.skipped);setTargets({}); }
  return <section className="card"><h2>Review career imports</h2><p>Extract explicit labeled employment and education blocks from local text. Missing or ambiguous dates, employment type and degree status are left for manual entry. No professional employment is inferred.</p>
    <details><summary>Supported text format</summary><pre>{careerImportExample}</pre><p>Optional labels: Location, Description, Specialization, Grade, Grade scale. Use End: present only for a current employment record. Separate records with a blank line.</p></details>
    <label>Career import text<textarea value={text} maxLength={60000} rows={6} onChange={e=>setText(e.target.value)}/></label>
    <button disabled={busy} onClick={()=>extract(text,'Pasted career text')}>Review career text</button><button disabled={busy||!state.resume} onClick={()=>extract(state.resume!.text,state.resume!.name)}>Review career facts from original resume</button>
    {skipped>0&&<p className="warning">{skipped} blocks could not be safely structured. Review missing information in the original; nothing was saved from those blocks.</p>}
    {proposals.map(proposal=>{const id=proposal.record.id,matches=careerMatches(proposal,state.profile.candidate),target=targets[id]??'';return <article className="decision" key={id}><h3>{matches.disposition}</h3><blockquote>{proposal.excerpt}</blockquote><h4>Proposed record</h4><CareerDetails record={proposal.record}/>
      {matches.records.map(record=><div key={record.id}><h4>Existing record · revision {record.revision}</h4><CareerDetails record={record}/></div>)}
      <label>Merge choice<select value={target} onChange={e=>setTargets({...targets,[id]:e.target.value})}><option value="">Keep existing / leave unresolved</option><option value="new">Accept as a separate new record</option>{matches.records.map(record=><option key={record.id} value={record.id}>Replace reviewed record: {record.start??'Unknown start'} to {record.end??'Unknown end/current'}</option>)}</select></label>
      <p className="fine">To edit a proposal, correct the source text and extract again. Omissions never delete other records.</p><button disabled={busy||!target} onClick={()=>void perform(async()=>{await raw({type:'IMPORT_CAREER',proposal,targetId:target==='new'?null:target,separateRecord:target==='new'});setProposals(p=>p.filter(item=>item.record.id!==id));})}>Confirm reviewed career import</button><button className="text-button" disabled={busy} onClick={()=>setProposals(p=>p.filter(item=>item.record.id!==id))}>Keep existing and dismiss</button>
    </article>;})}
  </section>;
}
