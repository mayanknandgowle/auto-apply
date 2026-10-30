import { z } from 'zod';
export const Requirement = z.object({
  id: z.string().uuid(), text: z.string().min(1).max(1000), source: z.string().min(1).max(2000),
  category: z.enum(['required', 'responsibilities', 'preferred', 'domain']),
  status: z.enum(['supported', 'partial', 'not-evidenced', 'unassessed']), quote: z.string().max(3000),
  eligibility: z.enum(['none', 'unknown', 'meets', 'does-not-meet'])
}).strict();
export type Requirement = z.infer<typeof Requirement>;
export const Assessment = z.object({
  rubric: z.literal('resume-evidence-v1'), resumeHash: z.string(), jobHash: z.string(), confirmedAt: z.string().datetime(),
  requirements: z.array(Requirement).min(1).max(100), score: z.number().min(0).max(100).nullable(), coverage: z.number(),
  categoryScores: z.record(z.string(), z.number().nullable()), denominator: z.number(), blockers: z.array(z.string())
}).strict();
export type Assessment = z.infer<typeof Assessment>;
export const weights = { required: 50, responsibilities: 25, preferred: 15, domain: 10 } as const;
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, ' ').trim();
export function deduplicateRequirements(requirements: Requirement[]): Requirement[] {
  const unique = new Map<string, Requirement>();
  for (const requirement of requirements) {
    const id = key(requirement.text);
    const previous = unique.get(id);
    if (!previous || weights[requirement.category] > weights[previous.category]) unique.set(id, requirement);
  }
  return [...unique.values()];
}
export function scoreRequirements(requirements: Requirement[], resumeText: string, jobText: string) {
  const unique = deduplicateRequirements(requirements);
  if (!resumeText.trim() || !jobText.trim() || !unique.length) throw new Error('Usable resume text and job requirements are needed for an assessment.');
  for (const r of unique) {
    if (!jobText.includes(r.source)) throw new Error('A requirement source is not present in the saved job description.');
    if (['supported', 'partial'].includes(r.status) && (!r.quote.trim() || !resumeText.includes(r.quote))) throw new Error('Supported and partial requirements need an exact excerpt from the selected resume.');
    if (/\b(age|gender|religion|race|ethnicity|marital|disability|sexual orientation)\b/i.test(r.text)) throw new Error('Protected personal characteristics cannot be scoring features.');
  }
  const categories = (Object.keys(weights) as (keyof typeof weights)[]).filter(c => unique.some(r => r.category === c));
  const denominator = categories.reduce((sum, c) => sum + weights[c], 0);
  let earned = 0, assessed = 0;
  const categoryScores: Record<string, number | null> = {};
  for (const category of categories) {
    const members = unique.filter(r => r.category === category);
    const known = members.filter(r => r.status !== 'unassessed');
    const points = known.reduce((sum, r) => sum + (r.status === 'supported' ? 1 : r.status === 'partial' ? .5 : 0), 0);
    earned += weights[category] * points / members.length;
    assessed += weights[category] * known.length / members.length;
    categoryScores[category] = known.length ? Math.round(100 * points / members.length) : null;
  }
  const coverage = Math.round(1000 * assessed / denominator) / 10;
  return { score: coverage >= 80 ? Math.round(100 * earned / denominator) : null, coverage, categoryScores, denominator,
    blockers: unique.filter(r => r.eligibility === 'does-not-meet').map(r => r.text), requirements: unique };
}
export function proposeRequirements(jobText: string): Requirement[] {
  let category: Requirement['category'] = 'required';
  const result: Requirement[] = [];
  for (const raw of jobText.split(/\n/)) {
    const text = raw.trim().replace(/^[-•*]\s*/, '');
    if (!text) continue;
    if (/^(preferred|nice to have)/i.test(text)) category = 'preferred';
    else if (/^(responsibilit|what you.ll do)/i.test(text)) category = 'responsibilities';
    else if (/^(domain|industry context)/i.test(text)) category = 'domain';
    else if (/^(required|qualifications|requirements|must have)/i.test(text)) category = 'required';
    if (text.length < 8 || text.length > 1000 || /^[\w\s]+:$/.test(text)) continue;
    result.push({ id: crypto.randomUUID(), text, source: text, category, status: 'unassessed', quote: '', eligibility: 'none' });
    if (result.length >= 100) break;
  }
  return deduplicateRequirements(result);
}
export function readability(text: string) {
  return [
    { check: 'Extractable text', status: text.trim().length >= 100 ? 'Passed' : 'Needs attention', detail: `${text.trim().length} extracted characters. Review the extraction for missing content.` },
    { check: 'Email detected', status: /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(text) ? 'Passed' : 'Needs attention', detail: 'A syntactic check only; no address verification.' },
    { check: 'Section headings', status: /\b(experience|education|projects|skills)\b/i.test(text) ? 'Passed' : 'Needs attention', detail: 'Recognizable text headings help readers; this does not guarantee ATS behavior.' },
    { check: 'Unfinished placeholders', status: /\[(?:insert|add|your|metric|company)[^\]]*\]/i.test(text) ? 'Needs attention' : 'Passed', detail: 'Checks common bracketed placeholders.' },
    { check: 'Date text', status: /\b(?:19|20)\d{2}\b/.test(text) ? 'Passed' : 'Could not assess', detail: 'Detects year text only. Chronology and overlapping roles need review; no dates are inferred.' },
    { check: 'Document integrity', status: 'Could not assess', detail: 'Text alone cannot verify original file integrity. Generated derivatives have a separate exact-text reparse check.' },
    { check: 'Reading order, visual layout and language', status: 'Could not assess', detail: 'Review the original document visually. Plain-text extraction cannot establish clipping, reading order or every glyph.' }
  ];
}
export async function textHash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
