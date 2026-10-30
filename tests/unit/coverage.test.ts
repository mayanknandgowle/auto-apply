// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormDriver } from '../../src/forms/driver';
import { isLeverForm, leverIdentity, leverQuestion } from '../../src/forms/lever';
import { appendJobSource, captureJobSource, jobConflicts } from '../../src/core/job-sources';
import { careerMatches, careerProposals, careerImportExample } from '../../src/documents/career-import';
import { initialState, Session, type Control, type Snapshot } from '../../src/core/model';
import { profileCommand } from '../../src/orchestration/profile-commands';
import { reconcile, writeBlocked, receiptAnswers } from '../../src/core/recovery';
import { manualOnly } from '../../src/core/policy';
import { groundedImprovements } from '../../src/core/improvements';
import { readFileSync } from 'node:fs';

beforeEach(()=>{
  document.body.innerHTML='';
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(()=>[{width:100,height:30,right:100,bottom:30}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({width:100,height:30,right:100,bottom:30}) as DOMRect);
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
});
async function prepare() {
  const driver=new FormDriver(),snapshot=driver.inspect(),sessionId=crypto.randomUUID();
  await driver.handle({type:'BIND',sessionId,generation:1,documentToken:snapshot.documentToken});
  const write=(control:Control,value='true')=>driver.handle({type:'WRITE',actionId:crypto.randomUUID(),sessionId,generation:1,documentToken:snapshot.documentToken,snapshotId:snapshot.snapshotId,controlId:control.id,fingerprint:control.fingerprint,before:control.value,value,expiresAt:Date.now()+2000,undo:false});
  return {driver,snapshot,write};
}
function session(snapshot:Snapshot) {return Session.parse({id:crypto.randomUUID(),tabId:1,origin:'https://example.test',url:'https://example.test/apply',title:'Test',state:'paused',generation:1,snapshot,decisions:[],journal:[],approved:{},note:'',startedAt:new Date().toISOString(),mode:'autofill'});}

describe('reviewed advanced controls',()=>{
  it('uses exact reversed radio options and preserves an existing group selection',async()=>{
    document.body.innerHTML='<fieldset><legend>Do you NOT require sponsorship?</legend><label><input type="radio" name="work" value="no">No</label><label><input type="radio" name="work" value="yes">Yes</label></fieldset>';
    const {snapshot,write}=await prepare();
    expect(snapshot.controls[0]!.options.map(o=>o.label)).toEqual(['No','Yes']);
    expect(await write(snapshot.controls[1]!)).toEqual({verified:true,value:'true'});
    await expect(write(snapshot.controls[0]!)).rejects.toThrow('website');
  });
  it('selects only approved checkbox options and rejects attestation',async()=>{
    document.body.innerHTML='<fieldset><legend>Select all tools you use</legend><label><input type="checkbox" name="tools" value="a">A</label><label><input type="checkbox" name="tools" value="b">B</label></fieldset><fieldset><legend>I certify this application</legend><label><input type="checkbox" name="attest" value="yes">Yes</label></fieldset>';
    const {snapshot,write}=await prepare();
    expect(await write(snapshot.controls[0]!)).toEqual({verified:true,value:'true'});
    expect((document.querySelector('input[value=b]') as HTMLInputElement).checked).toBe(false);
    await expect(write(snapshot.controls[2]!)).rejects.toThrow('website');
  });
  it('rejects changed options, disabled fields and duplicate values',async()=>{
    document.body.innerHTML='<fieldset><legend>Choice</legend><label><input type="radio" name="x" value="a">A</label><label><input type="radio" name="x" value="b">B</label></fieldset><label>Email<input type="email" disabled></label>';
    const {snapshot,write}=await prepare();
    document.querySelector('input[value=b]')!.setAttribute('value','a');
    await expect(write(snapshot.controls[0]!)).rejects.toThrow('field changed');
    expect(manualOnly(snapshot.controls[2]!)).toBe(true);
    expect(new FormDriver().inspect().controls[0]!.choice?.writable).toBe(false);
  });
  it('finds labeled native fields in open shadow roots and respects hidden hosts',async()=>{
    const host=document.createElement('div');document.body.append(host);
    host.attachShadow({mode:'open'}).innerHTML='<span id="label">Email</span><input type="email" aria-labelledby="label">';
    const {snapshot,write}=await prepare();
    expect(snapshot.controls[0]!.label).toBe('Email');
    expect(await write(snapshot.controls[0]!,'alex@example.test')).toEqual({verified:true,value:'alex@example.test'});
    host.hidden=true;expect(new FormDriver().inspect().controls).toHaveLength(0);
  });
  it('does not infer contact data for repeated employment rows',()=>{
    document.body.innerHTML='<fieldset><legend>Employment 1</legend><label>Country<input></label></fieldset><fieldset><legend>Employment 2</legend><label>Country<input></label></fieldset>';
    expect(new FormDriver().inspect().controls.map(c=>c.label)).toEqual(['Employment 1 — Country','Employment 2 — Country']);
  });
  it('detects only the observed hosted Lever shape and scoped question labels',()=>{
    document.documentElement.innerHTML=readFileSync('tests/fixtures/lever.html','utf8');
    const url='https://jobs.lever.co/synthetic/11111111-2222-4333-8444-555555555555/apply';
    expect(isLeverForm(document,url)).toBe(true);
    expect(isLeverForm(document,'https://jobs.lever.co.attacker.test/synthetic/11111111-2222-4333-8444-555555555555/apply')).toBe(false);
    expect(leverIdentity('https://jobs.lever.co/synthetic')).toBeUndefined();
    expect(leverQuestion(document.querySelector('input[type=checkbox]')!)).toBe('Please check all that apply:');
  });
});

describe('source review, imports and recovery',()=>{
  it('preserves explicit source quotes, uncertainty, source types and conflicts',()=>{
    const a=captureJobSource('Company: Alpha\nRole: Developer\nResponsibilities:\n- Build apps\n5 years experience','user-provided');
    const b=captureJobSource('Company: Beta\nRole: Designer','discovery','https://example.test');
    expect(a.facts.find(f=>f.field==='responsibilities')?.excerpt).toBe('- Build apps');
    expect(a.facts.find(f=>f.field==='experience')?.certainty).toBe('uncertain');
    expect(jobConflicts([a,b])).toEqual(['company','role']);
    expect(a.kind).toBe('user-provided');
  });
  it('rejects fabricated source quotes and relabeling paste as employer content',async()=>{
    const state=initialState(),source=captureJobSource('Company: Example','user-provided');state.jobSources=[source];
    await expect(profileCommand(state,{type:'REVIEW_JOB_SOURCE',source:{...source,kind:'employer-posting'}})).rejects.toThrow('Pasted');
    await expect(profileCommand(state,{type:'REVIEW_JOB_SOURCE',source:{...source,facts:[{...source.facts[0]!,excerpt:'Fake'}]}})).rejects.toThrow('exact source');
  });
  it('imports explicit records, reviews duplicates, and rolls back without deleting unrelated facts',async()=>{
    const state=initialState(),{proposals,skipped}=careerProposals(careerImportExample,'Synthetic export');
    expect(skipped).toBe(0);expect(proposals).toHaveLength(2);
    for(const proposal of proposals)await profileCommand(state,{type:'IMPORT_CAREER',proposal,targetId:null,separateRecord:false});
    expect(state.profile.candidate.employment[0]!.kind).toBe('internship');
    expect(careerMatches(proposals[0]!,state.profile.candidate).exact).toHaveLength(1);
    await expect(profileCommand(state,{type:'IMPORT_CAREER',proposal:proposals[0]!,targetId:null,separateRecord:false})).rejects.toThrow('duplicate');
    await profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[0]!.id});
    expect(state.profile.candidate.employment).toHaveLength(0);expect(state.profile.candidate.education).toHaveLength(1);
  });
  it('preserves newer career edits and source-deletion boundaries',async()=>{
    const state=initialState(),proposal=careerProposals(careerImportExample,'Synthetic export').proposals[0]!;
    await profileCommand(state,{type:'IMPORT_CAREER',proposal,targetId:null,separateRecord:false});
    state.profile.candidate.employment[0]!.revision++;
    await expect(profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[0]!.id})).rejects.toThrow('newer');
    await profileCommand(state,{type:'SOURCE_DELETE',source:'Synthetic export'});
    expect(state.profile.candidate.employment[0]!.sourceDeleted).toBe(true);
    expect(state.imports[0]!.before).toBeNull();
  });
  it('does not invent employment type, missing dates or degree completion',()=>{
    const result=careerProposals('Employer: Example\nTitle: Developer\nStart: 2020\n\nInstitution: School\nDegree: BSc','Pasted');
    expect(result.proposals).toHaveLength(0);expect(result.skipped).toBe(2);
  });
  it('reconciles intents only against the same observed document; reload cannot enable retry',()=>{
    document.body.innerHTML='<label>Email<input type="email"></label>';
    const snapshot=new FormDriver().inspect(),s=session(snapshot),c=snapshot.controls[0]!;
    s.journal.push({id:crypto.randomUUID(),controlId:c.id,label:c.label,before:'',after:'alex@example.test',fingerprint:c.fingerprint,documentToken:snapshot.documentToken,status:'intent',at:new Date().toISOString()});
    const reloaded=new FormDriver().inspect();reconcile(s,reloaded);s.snapshot=reloaded;
    expect(s.journal[0]!.status).toBe('uncertain');expect(writeBlocked(s,reloaded.controls[0]!)).toBe(true);
  });
  it('marks interrupted upload uncertain and omits sensitive receipt answers',()=>{
    const snapshot=new FormDriver().inspect(),s=session(snapshot),state=initialState();state.session=s;
    s.uploads.push({id:crypto.randomUUID(),controlId:'file',documentToken:snapshot.documentToken,hash:'a',name:'resume.pdf',status:'intent',at:new Date().toISOString()});
    s.journal.push({id:crypto.randomUUID(),controlId:'s',label:'Current salary',before:'',after:'100',fingerprint:'x',documentToken:snapshot.documentToken,status:'verified',at:new Date().toISOString()});
    reconcile(s,snapshot);expect(s.uploads[0]!.status).toBe('uncertain');expect(receiptAnswers(state)).toEqual([]);
  });
  it('keeps unsupported resume requirements as gaps without invented wording',()=>{
    const proposals=groundedImprovements([{id:crypto.randomUUID(),text:'Rust',source:'Rust required',category:'required',status:'not-evidenced',quote:'',eligibility:'none'}],'TypeScript','Rust required');
    expect(proposals[0]!.category).toBe('gap');expect(proposals[0]!.proposed).toBe('');
  });
});

it('preserves older conflicting sources at capacity and deduplicates repeated captures',()=>{
  const sources=Array.from({length:20},(_,i)=>captureJobSource('Company: '+i,'user-provided'));
  expect(appendJobSource(sources,captureJobSource('Company: 0','user-provided'))).toBe(sources);
  expect(()=>appendJobSource(sources,captureJobSource('Company: New','user-provided'))).toThrow('Existing evidence was preserved');
  expect(sources).toHaveLength(20);expect(sources[0]!.facts[0]!.value).toBe('0');
});

it('compares source fact sets without treating one requirement list as a conflict',()=>{
 const a=captureJobSource('Requirements:\n- TypeScript\n- SQL','user-provided');
 expect(jobConflicts([a])).toEqual([]);
 expect(jobConflicts([a,captureJobSource('Requirements:\n- SQL\n- TypeScript','application')])).toEqual([]);
 expect(jobConflicts([a,captureJobSource('Requirements:\n- Python','application')])).toEqual(['requiredQualifications']);
});
it('does not retain already answered sensitive fields in an inspection',()=>{
 document.body.innerHTML='<label>Current salary<input value="50000"></label><fieldset><legend>Do you require sponsorship?</legend><label><input type="radio" name="work" value="yes" checked>Yes</label><label><input type="radio" name="work" value="no">No</label></fieldset><label>Email<input type="email"></label>';
 const snapshot=new FormDriver().inspect();
 expect(snapshot.controls.map(c=>c.label)).toEqual(['Email']);
 expect(JSON.stringify(snapshot)).not.toContain('50000');
 expect(snapshot.warnings.join(' ')).toContain('answered sensitive question');
});
