import { describe, it, expect } from 'vitest';
import { Candidate, Employment, Compensation, experienceMonths, convertCompensation } from '../../src/core/candidate';
import { initialState, migrateState, type Control, type State } from '../../src/core/model';
import { makeMemory, memoryMatch } from '../../src/core/reuse';
import { profileCommand } from '../../src/orchestration/profile-commands';
import { scoreRequirements, type Requirement } from '../../src/core/assessment';
const provenance = () => ({id:crypto.randomUUID(),source:'fixture',confirmedAt:new Date().toISOString(),revision:1});
const employment = (start:string,end:string,kind='professional') => Employment.parse({...provenance(),employer:'Fixture',title:'Engineer',kind,start,end,current:false,location:'',description:''});
describe('candidate precision',()=>{
  it('unions overlaps, distinguishes internships and abstains on year-only dates',()=>{
    const entries=[employment('2024-01','2024-06'),employment('2024-04','2024-09'),employment('2024-01','2024-03','internship')];
    expect(experienceMonths(entries,'2026-10').months).toBe(9);
    expect(experienceMonths(entries,'2026-10','internship').months).toBe(3);
    expect(experienceMonths([employment('2024','2025')],'2026-10').months).toBeNull();
    expect(experienceMonths([employment('2027-01','2027-02')],'2026-10').months).toBeNull();
    expect(Candidate.parse({}).employment).toEqual([]);
  });
  it('converts pay only when currency, basis and gross/net agree',()=>{
    const pay=Compensation.parse({...provenance(),status:'known',kind:'expected',amount:120000,currency:'INR',period:'annual',basis:'fixed',grossNet:'gross'});
    expect(convertCompensation(pay,{...pay,period:'monthly'})).toBe(10000);
    for(const change of [{currency:'USD'},{basis:'total' as const},{grossNet:'net' as const}]) expect(convertCompensation(pay,{...pay,...change})).toBeNull();
    expect(Compensation.safeParse({...pay,status:'unknown'}).success).toBe(false);
  });
  it('migrates legacy data without silently accepting future schemas',()=>{
    const old={schema:1,revision:3,profile:{revision:1,facts:[],evidence:[]},session:null,resume:null,jobText:'Legacy job',requestIds:[],aiRequests:0,provider:{model:'legacy-model',configured:false}};
    const migrated=migrateState(old);expect(migrated.schema).toBe(2);expect(migrated.jobText).toBe('Legacy job');expect(migrated.profile.candidate.employment).toEqual([]);expect(migrated.storage.mode).toBe('session');expect(migrated.provider.kind).toBe('gemini');
    expect(()=>migrateState({...old,schema:99})).toThrow('unsupported');
    expect(()=>migrateState({...old,profile:{wrong:true}})).toThrow();
  });
});
describe('reviewed imports',()=>{
  it('restores the prior value but never overwrites a newer edit',async()=>{
    const state=initialState();
    await profileCommand(state,{type:'IMPORT_CONTACT',key:'email',value:'first@example.test',source:'one'});
    await profileCommand(state,{type:'IMPORT_CONTACT',key:'email',value:'second@example.test',source:'two'});
    await profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[1]!.id});
    expect(state.profile.facts[0]!.value).toBe('first@example.test');
    state.profile.facts[0]!.revision++;
    await expect(profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[0]!.id})).rejects.toThrow('newer');
  });
  it('deletes source rollback content while preserving confirmed facts with provenance',async()=>{
    const state=initialState(); await profileCommand(state,{type:'IMPORT_CONTACT',key:'email',value:'first@example.test',source:'one'});
    await profileCommand(state,{type:'SOURCE_DELETE',source:'one'});
    expect(state.profile.facts[0]!.sourceDeleted).toBe(true); expect(state.imports[0]!.before).toBeNull();
    await expect(profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[0]!.id})).rejects.toThrow();
  });
  it('source deletion also removes earlier values retained by later imports',async()=>{
    const state=initialState();await profileCommand(state,{type:'IMPORT_CONTACT',key:'email',value:'one@example.test',source:'one'});await profileCommand(state,{type:'IMPORT_CONTACT',key:'email',value:'two@example.test',source:'two'});
    await profileCommand(state,{type:'SOURCE_DELETE',source:'one'});expect(state.imports[1]!.before).toBeNull();expect(state.imports[1]!.rollbackUnavailable).toBe(true);expect(state.imports[1]!.sourceDeleted).toBe(false);
    await expect(profileCommand(state,{type:'IMPORT_UNDO',id:state.imports[1]!.id})).rejects.toThrow();expect(state.profile.facts[0]!.value).toBe('two@example.test');
  });
});
describe('scoped memory',()=>{
  const control:Control={id:'x',fingerprint:'fp',label:'Are you available?',kind:'select',autocomplete:'',required:true,value:'',options:[{label:'Yes',value:'yes'}],maxLength:-1,invalid:false};
  function state() { const s=initialState(); s.job={company:'Acme',role:'Developer',country:'India',location:'',requisition:'',url:'https://jobs.example.test/a',confirmed:true,revision:1}; s.session={url:s.job.url,origin:'https://jobs.example.test'} as State['session']; return s; }
  it('requires exact question/options and matching context, profile revision and expiry',()=>{
    const s=state();s.memory=[makeMemory(control,'yes',s)]; expect(memoryMatch(control,s)?.answer).toBe('yes');
    expect(memoryMatch({...control,options:[{label:'Yes please',value:'yes'}]},s)).toBeUndefined();
    expect(memoryMatch({...control,label:'Are you available now?'},s)).toBeUndefined();
    expect(memoryMatch(control,s,Date.now()+31*86400000)).toBeUndefined();
    for(const [field,value] of [['company','Other'],['role','Manager'],['country','USA'],['url','https://jobs.example.test/b']] as const) expect(memoryMatch(control,{...s,job:{...s.job,[field]:value}})).toBeUndefined();
    s.profile.revision++; expect(memoryMatch(control,s)).toBeUndefined();
  });
  it('refuses memory without confirmed job context',()=>{const s=state();s.job.confirmed=false;expect(()=>makeMemory(control,'yes',s)).toThrow('Confirm');});
  it('does not assign another page employer to a receipt',async()=>{const s=state();Object.assign(s.session!,{url:'https://jobs.example.test/other',state:'paused',journal:[],uploads:[]});await profileCommand(s,{type:'SAVE_RECEIPT',userReported:false});expect(s.history[0]!.job.company).toBe('');expect(s.history[0]!.status).toBe('prepared');});
});
describe('honest evidence rubric',()=>{
  const requirement=(text:string,overrides:Partial<Requirement>={}):Requirement=>({id:crypto.randomUUID(),text,source:text,category:'required',status:'supported',quote:'TypeScript',eligibility:'none',...overrides});
  it('deduplicates requirements and renormalizes absent categories',()=>{
    const r=requirement('TypeScript');const result=scoreRequirements([r,{...r,id:crypto.randomUUID()}],'TypeScript','TypeScript');
    expect(result.score).toBe(100);expect(result.requirements).toHaveLength(1);expect(result.denominator).toBe(50);
  });
  it('suppresses low-coverage scores and keeps blockers separate',()=>{
    const result=scoreRequirements([requirement('TypeScript'),requirement('Degree',{status:'unassessed',quote:'',eligibility:'does-not-meet'})],'TypeScript','TypeScript\nDegree');
    expect(result.score).toBeNull();expect(result.coverage).toBe(50);expect(result.blockers).toEqual(['Degree']);
  });
  it('rejects evidence absent from the selected resume and invented job source',()=>{
    expect(()=>scoreRequirements([requirement('TypeScript')],'Python','TypeScript')).toThrow('selected resume');
    expect(()=>scoreRequirements([requirement('TypeScript')],'TypeScript','Other')).toThrow('job description');
    expect(()=>scoreRequirements([requirement('Age 30')],'TypeScript','Age 30')).toThrow('Protected');
  });
});
