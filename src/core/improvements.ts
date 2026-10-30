import type { Requirement } from './assessment';

export function groundedImprovements(requirements:Requirement[],resumeText:string,jobText:string) {
  return requirements.filter(r=>jobText.includes(r.source)).map(r=>{
    const evidenced=['supported','partial'].includes(r.status)&&!!r.quote.trim()&&resumeText.includes(r.quote);
    return {id:r.id,requirement:r.text,source:r.source,evidence:evidenced?r.quote:'No reviewed evidence in the selected resume.',
      category:evidenced?'supported-formatting':r.status==='not-evidenced'?'gap':'needs-confirmation',
      proposed:evidenced?r.quote.trim().replace(/[\t ]+/g,' '):'',
      reason:evidenced?'Keep this exact evidence visible in the relevant section. This proposal only normalizes spacing; review placement and every factual claim before editing.'
        :r.status==='not-evidenced'?'Wording cannot establish a missing qualification. Add nothing unless you can confirm relevant evidence; a genuine gap must remain visible.'
        :'Review the requirement against the original resume and confirmed facts before proposing any factual addition.',
      status:'needs-review' as const};
  });
}
