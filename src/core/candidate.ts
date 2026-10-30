import { z } from 'zod';

export const PartialDate = z.string().regex(/^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/, 'Use YYYY or YYYY-MM.');
const provenance = {
  id: z.string().uuid(), source: z.string().min(1).max(200), confirmedAt: z.string().datetime(), revision: z.number().int().positive(), sourceDeleted:z.boolean().optional()
};
function dateOrder(start:string|null,end:string|null){return !start||!end||`${start.length===4?start+'-01':start}`<=`${end.length===4?end+'-12':end}`;}
export const Employment = z.object({
  ...provenance, employer: z.string().min(1).max(200), title: z.string().min(1).max(200),
  kind: z.enum(['professional', 'contract', 'internship']), start: PartialDate, end: PartialDate.nullable(), current: z.boolean(),
  location: z.string().max(200), description: z.string().max(4000)
}).strict().refine(v => v.current ? v.end === null : v.end !== null, 'Provide an end date or mark this as current.')
  .refine(v => dateOrder(v.start,v.end), 'End date must not precede start date.');
export type Employment = z.infer<typeof Employment>;
export const Education = z.object({
  ...provenance, institution: z.string().min(1).max(200), degree: z.string().min(1).max(200), specialization: z.string().max(200),
  start: PartialDate.nullable(), end: PartialDate.nullable(), status: z.enum(['completed', 'in-progress', 'not-completed']),
  grade: z.string().max(50), gradeScale: z.string().max(100)
}).strict().refine(v => !v.grade || !!v.gradeScale, 'Keep the original grade scale with the grade.').refine(v=>dateOrder(v.start,v.end),'End date must not precede start date.');
export const Project = z.object({ ...provenance, title: z.string().min(1).max(200), role: z.string().max(200), tools: z.array(z.string().min(1).max(100)).max(50), description: z.string().min(1).max(4000), start: PartialDate.nullable(), end: PartialDate.nullable() }).strict();
export const Compensation = z.object({
  ...provenance, status: z.enum(['known', 'unknown', 'declined', 'not-applicable']), kind: z.enum(['current', 'expected']),
  amount: z.number().finite().nonnegative().max(1e12).nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  period: z.enum(['annual', 'monthly']), basis: z.enum(['fixed', 'total']), grossNet: z.enum(['gross', 'net', 'unknown'])
}).strict().refine(v => v.status === 'known' ? v.amount !== null : v.amount === null, 'Unknown or declined compensation must not contain an amount.');
export type Compensation = z.infer<typeof Compensation>;
export const Authorization = z.object({
  ...provenance, country: z.string().min(1).max(100), currentPermission: z.enum(['yes', 'no', 'unknown', 'declined']),
  futureSponsorship: z.enum(['yes', 'no', 'unknown', 'declined']), effectiveDate: z.iso.date()
}).strict();
export const Candidate = z.object({
  employment: z.array(Employment).max(40).default([]), education: z.array(Education).max(30).default([]),
  projects: z.array(Project).max(40).default([]), skills: z.array(z.string().min(1).max(100)).max(100).default([]),
  compensation: z.array(Compensation).max(10).default([]), authorization: z.array(Authorization).max(20).default([]),
  certifications:z.array(z.object({...provenance,title:z.string().min(1).max(200),issuer:z.string().min(1).max(200),issued:PartialDate.nullable(),expires:PartialDate.nullable(),url:z.union([z.literal(''),z.url().max(1000)])}).strict()).max(40).default([]),
  languages:z.array(z.object({...provenance,language:z.string().min(1).max(100),proficiency:z.enum(['unknown','basic','conversational','professional','native-or-bilingual'])}).strict()).max(30).default([]),
  preferences:z.array(z.object({...provenance,kind:z.enum(['location','work-arrangement','employment-type','role']),status:z.enum(['known','unknown','declined','not-applicable']),value:z.string().max(500)}).strict().refine(v=>v.status==='known'?!!v.value.trim():v.value==='','Only a known preference may have a value.')).max(30).default([]),
  availability:z.array(z.object({...provenance,status:z.enum(['known','unknown','declined','not-applicable']),earliestDate:z.iso.date().nullable(),conditions:z.string().max(1000)}).strict().refine(v=>v.status==='known'?v.earliestDate!==null:v.earliestDate===null,'Only confirmed availability may contain a date.')).max(10).default([]),
  notice: z.object({ status: z.enum(['known', 'unknown', 'declined', 'not-applicable']), days: z.number().int().min(0).max(730).nullable(), negotiable: z.enum(['yes', 'no', 'unknown']), confirmedAt: z.string() }).strict().refine(v=>v.status==='known'?v.days!==null:v.days===null,'Only a known notice period may contain a number of days.').nullable().default(null)
}).strict();
export type Candidate = z.infer<typeof Candidate>;

function monthIndex(value: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
/** Calendar months inclusive, unioned. Year-only/invalid dates abstain rather than invent precision. */
export function experienceMonths(entries: Employment[], asOfMonth: string, kind: 'professional' | 'internship' | 'total' = 'professional'): { months: number | null; reason: string } {
  const now = monthIndex(asOfMonth);
  if (now === null) return { months: null, reason: 'A valid as-of month is required.' };
  const relevant = entries.filter(e => kind === 'total' || (kind === 'internship' ? e.kind === 'internship' : e.kind !== 'internship'));
  const ranges: [number, number][] = [];
  for (const entry of relevant) {
    const start = monthIndex(entry.start), end = entry.current ? now : monthIndex(entry.end ?? '');
    if (start === null || end === null) return { months: null, reason: 'Month-level dates are needed; year-only dates remain ambiguous.' };
    if (start > end || end > now) return { months: null, reason: 'Review future or inconsistent employment dates.' };
    ranges.push([start, end + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let months = 0, end = -Infinity;
  for (const [a, b] of ranges) { months += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
  return { months, reason: 'Inclusive calendar months; overlapping roles counted once. Projects are excluded.' };
}
export function convertCompensation(value: Compensation, target: Pick<Compensation, 'currency' | 'period' | 'basis' | 'grossNet'>): number | null {
  if (value.status !== 'known' || value.amount === null || value.currency !== target.currency || value.basis !== target.basis || value.grossNet !== target.grossNet || value.grossNet === 'unknown') return null;
  return value.period === target.period ? value.amount : target.period === 'monthly' ? value.amount / 12 : value.amount * 12;
}
export function careerEvidence(candidate: Candidate): { id: string; title: string; text: string }[] {
  return [
    ...candidate.employment.map(e => ({ id: e.id, title: `${e.title} — ${e.employer}`, text: `${e.title} at ${e.employer}, ${e.start} to ${e.current ? 'present' : e.end}. Type: ${e.kind}. ${e.description}` })),
    ...candidate.education.map(e => ({ id: e.id, title: `${e.degree} — ${e.institution}`, text: `${e.degree}, ${e.specialization}, ${e.institution}. Status: ${e.status}. ${e.start ?? 'Start unknown'} to ${e.end ?? 'End unknown'}.${e.grade ? ` Grade ${e.grade} (${e.gradeScale}).` : ''}` })),
    ...candidate.projects.map(p => ({ id: p.id, title: p.title, text: `${p.title}. Role: ${p.role}. Tools: ${p.tools.join(', ')}. ${p.description}` }))
  ];
}
