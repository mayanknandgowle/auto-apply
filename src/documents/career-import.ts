import { z } from 'zod';
import { Employment, Education, type Candidate } from '../core/candidate';

export const CareerProposal = z.discriminatedUnion('section', [
  z.object({section:z.literal('employment'),record:Employment,excerpt:z.string().min(1).max(6000)}).strict(),
  z.object({section:z.literal('education'),record:Education,excerpt:z.string().min(1).max(6000)}).strict()
]);
export type CareerProposal = z.infer<typeof CareerProposal>;
export const careerImportExample = 'Employer: Example Studio\nTitle: Engineer\nType: internship\nStart: 2024-06\nEnd: 2024-08\n\nInstitution: Example University\nDegree: BSc\nStatus: completed\nStart: 2020\nEnd: 2024';

/** Explicit labeled blocks only. Unstructured text is left for manual review. */
export function careerProposals(text:string,source:string): { proposals:CareerProposal[]; skipped:number } {
  const proposals:CareerProposal[]=[];
  let skipped=0;
  for(const block of text.slice(0,60000).split(/\n\s*\n/).slice(0,100)) {
    const values:Record<string,string>={};
    let duplicate=false;
    for(const line of block.split('\n')) {
      const m=/^\s*([A-Za-z ]+):\s*(.+)\s*$/.exec(line);
      if(m) { const key=m[1]!.trim().toLowerCase(); if(key in values)duplicate=true;values[key]=m[2]!.trim(); }
    }
    const provenance={id:crypto.randomUUID(),source,confirmedAt:new Date().toISOString(),revision:1};
    const proposal=values.employer ? {section:'employment',excerpt:block,record:{...provenance,employer:values.employer,title:values.title,kind:values.type,start:values.start,end:values.end==='present'?null:values.end,current:values.end==='present',location:values.location??'',description:values.description??''}}
      : values.institution ? {section:'education',excerpt:block,record:{...provenance,institution:values.institution,degree:values.degree,status:values.status,start:values.start??null,end:values.end??null,specialization:values.specialization??'',grade:values.grade??'',gradeScale:values['grade scale']??''}} : undefined;
    const parsed=CareerProposal.safeParse(proposal);
    if(!duplicate && parsed.success)proposals.push(parsed.data);else if(block.trim())skipped++;
  }
  return {proposals,skipped};
}
const key=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export function careerMatches(proposal:CareerProposal,candidate:Candidate) {
  const records=proposal.section==='employment' ? candidate.employment.filter(r=>key(r.employer)===key(proposal.record.employer)&&key(r.title)===key(proposal.record.title))
    : candidate.education.filter(r=>key(r.institution)===key(proposal.record.institution)&&key(r.degree)===key(proposal.record.degree));
  const exact=records.filter(r=>r.start===proposal.record.start && r.end===proposal.record.end);
  return {records, exact, disposition:records.length ? exact.length===1 ? 'Possible duplicate or conflict' : 'Uncertain match — review dates' : 'Addition'};
}
