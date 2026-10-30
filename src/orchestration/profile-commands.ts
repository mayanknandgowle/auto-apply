import { Fact, selectedResume, type State, type UiCommand } from '../core/model';
import { approvedText, normalizeDocumentText } from '../documents/edits';
import { careerEvidence, Candidate, Employment, Education } from '../core/candidate';
import { careerMatches } from '../documents/career-import';
import { fromBase64 } from '../storage/crypto';
import { emptyJob, restoreImport } from '../core/reuse';
import { scoreRequirements, textHash } from '../core/assessment';
import { receiptAnswers } from '../core/recovery';

/** Pure state mutations; the coordinator serializes, validates and commits them. */
export async function profileCommand(state: State, command: UiCommand): Promise<boolean> {
  switch (command.type) {
    case 'REVIEW_JOB_SOURCE': {
      const previous=state.jobSources.find(s=>s.id===command.source.id);
      if(!previous || previous.url!==command.source.url || previous.text!==command.source.text || previous.capturedAt!==command.source.capturedAt)throw new Error('The captured source changed. Capture and review it again.');
      if(previous.kind==='user-provided' && command.source.kind!=='user-provided')throw new Error('Pasted text remains labeled user-provided.');
      for(const fact of command.source.facts)if(!fact.excerpt.trim()||!previous.text.includes(fact.excerpt))throw new Error('Every proposed fact needs an exact source excerpt.');
      state.jobSources=state.jobSources.map(s=>s.id===command.source.id?command.source:s);break;
    }
    case 'DELETE_JOB_SOURCE': state.jobSources=state.jobSources.filter(s=>s.id!==command.id);break;
    case 'RESUME_VARIANT': {
      const variant=command.variant;
      if(!state.resume || variant.parentHash!==state.resume.hash || variant.profileRevision!==state.profile.revision || variant.jobHash!==await textHash(state.jobText))throw new Error('Source resume, profile or job changed. Review this derivative again.');
      const text=approvedText(state.resume.text,variant.edits,[...state.profile.evidence,...careerEvidence(state.profile.candidate)]);
      if(text!==variant.approvedText || normalizeDocumentText(variant.resume.text)!==normalizeDocumentText(text))throw new Error('Derivative does not match the approved text.');
      const bytes=fromBase64(variant.resume.base64);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==variant.resume.hash || bytes.length!==variant.resume.size)throw new Error('Generated artifact integrity check failed.');
      if(state.variants.length>=5)throw new Error('Keep up to five derivatives. Delete an older version first.');
      state.variants.push(variant);break;
    }
    case 'SELECT_RESUME':
      if(command.id && !state.variants.some(v=>v.resume.id===command.id && v.parentHash===state.resume?.hash))throw new Error('This derivative belongs to another original.');
      state.selectedVariant=command.id;state.assessment=null;break;
    case 'DELETE_VARIANT': state.variants=state.variants.filter(v=>v.resume.id!==command.id);if(state.selectedVariant===command.id){state.selectedVariant=null;state.assessment=null;}break;
    case 'CANDIDATE': state.profile.candidate = command.candidate; state.profile.revision++; break;
    case 'IMPORT_CAREER': {
      const {proposal,targetId}=command;
      const records=state.profile.candidate[proposal.section];
      const before=targetId?records.find(r=>r.id===targetId):undefined;
      const matches=careerMatches(proposal,state.profile.candidate);
      if(targetId&&!before)throw new Error('The selected record changed. Review the import again.');
      if(!targetId&&matches.records.length&&!command.separateRecord)throw new Error('Review the possible duplicate before adding a separate record.');
      const record={...proposal.record,id:before?.id??crypto.randomUUID(),revision:(before?.revision??0)+1,confirmedAt:new Date().toISOString()};
      state.profile.candidate=Candidate.parse({...state.profile.candidate,[proposal.section]:[...records.filter(r=>r.id!==targetId),record]});
      state.profile.revision++;
      state.imports=[...state.imports,{id:crypto.randomUUID(),source:record.source,at:record.confirmedAt,key:proposal.section,before:before??null,afterId:record.id,afterRevision:record.revision,rolledBack:false,sourceDeleted:false,excerpt:proposal.excerpt}].slice(-100);
      break;
    }
    case 'IMPORT_CONTACT': {
      const before = state.profile.facts.find(f => f.key === command.key);
      const fact = Fact.parse({ id: crypto.randomUUID(), key: command.key, value: command.value.trim(), source: command.source, confirmedAt: new Date().toISOString(), revision: (before?.revision ?? 0) + 1 });
      if (!fact.value) throw new Error('Enter a value before confirming.');
      state.profile.facts = [...state.profile.facts.filter(f => f.key !== command.key), fact]; state.profile.revision++;
      state.imports = [...state.imports, { id: crypto.randomUUID(), source: command.source, at: new Date().toISOString(), key: command.key, before: before ?? null, afterId: fact.id, afterRevision: fact.revision, rolledBack: false, sourceDeleted: false }].slice(-100); break;
    }
    case 'IMPORT_UNDO': {
      const change = state.imports.find(i => i.id === command.id);
      if (!change) throw new Error('Import transaction no longer exists.');
      if(change.key==='employment'||change.key==='education') {
        const section=change.key, records=state.profile.candidate[section], current=records.find(r=>r.id===change.afterId);
        if(change.rolledBack||change.sourceDeleted||change.rollbackUnavailable||current?.revision!==change.afterRevision)throw new Error('This record has newer edits or its source was deleted. Rollback will not overwrite it.');
        const before=change.before?(section==='employment'?Employment:Education).parse(change.before):null;
        state.profile.candidate=Candidate.parse({...state.profile.candidate,[section]:[...records.filter(r=>r.id!==change.afterId),...(before?[before]:[])]});
        state.profile.revision++;change.rolledBack=true;break;
      }
      if (change.before) change.before = Fact.parse(change.before);
      state.profile = restoreImport(state.profile, change); change.rolledBack = true; break;
    }
    case 'SOURCE_DELETE':
      state.imports = state.imports.map(i => i.source === command.source ? { ...i, before: null, excerpt:undefined, sourceDeleted: true } : (i.before as {source?:string}|null)?.source===command.source?{...i,before:null,rollbackUnavailable:true}:i);
      state.profile.facts = state.profile.facts.map(f => f.source === command.source ? { ...f, sourceDeleted: true } : f);
      for(const section of ['employment','education','projects','compensation','authorization','certifications','languages','preferences','availability'] as const) {
        for(const record of state.profile.candidate[section])if(record.source===command.source)record.sourceDeleted=true;
      }
      if (state.resume?.name === command.source) { state.resume = null; state.assessment = null; state.variants=[];state.selectedVariant=null; } break;
    case 'MEMORY_DELETE': state.memory = state.memory.filter(m => m.id !== command.id); break;
    case 'JOB_CONTEXT':
      if (command.job.confirmed && (!state.session || command.job.url !== state.session.url || !command.job.company.trim() || !command.job.role.trim() || !command.job.country.trim())) throw new Error('Inspect this job page and supply employer, role and country before confirming.');
      state.job = { ...command.job, revision: state.job.revision + 1 }; break;
    case 'ASSESS':
      {const resume=selectedResume(state);if (!resume) throw new Error('Select a resume first.');
      state.assessment = { rubric: 'resume-evidence-v1', resumeHash: resume.hash, jobHash: await textHash(state.jobText), confirmedAt: new Date().toISOString(), ...scoreRequirements(command.requirements, resume.text, state.jobText) }; break;}
    case 'SAVE_RECEIPT': {
      const session = state.session;
      if (!session || session.state === 'filling') throw new Error('Inspect, pause and review before saving a receipt.');
      const resume=selectedResume(state);
      const job=state.job.confirmed&&state.job.url===session.url?state.job:emptyJob();
      state.history = [...state.history, { id: crypto.randomUUID(), at: new Date().toISOString(), job, url: session.url, status: command.userReported ? 'user-reported-submitted' as const : 'prepared' as const, resumeName: resume?.name ?? '', resumeHash: resume?.hash ?? '', upload: 'not-verified' as const, uploads:structuredClone(session.uploads), answers: receiptAnswers(state), steps:structuredClone(session.steps) }].slice(-50); break;
    }
    case 'DELETE_RECEIPT': state.history = state.history.filter(h => h.id !== command.id); break;
    case 'RETENTION': state.retention = command.value; break;
    default: return false;
  }
  if (state.session && ['CANDIDATE', 'IMPORT_CONTACT', 'IMPORT_CAREER', 'IMPORT_UNDO', 'JOB_CONTEXT', 'MEMORY_DELETE','SELECT_RESUME','DELETE_VARIANT','SOURCE_DELETE'].includes(command.type)) {
    state.session.state = 'paused'; state.session.generation++; state.session.approved = {}; state.session.note = 'Confirmed details changed. Inspect again before continuing.';
  }
  return true;
}
