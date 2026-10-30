import { z } from 'zod';

export const jobFields = ['company', 'role', 'requisition', 'location', 'workArrangement', 'employmentType', 'responsibilities', 'requiredQualifications', 'preferredQualifications', 'experience', 'compensation', 'documents'] as const;
export const JobSource = z.object({
  id: z.string().uuid(), kind: z.enum(['user-provided', 'unclassified-page', 'employer-posting', 'application', 'discovery']),
  url: z.string().max(3000), capturedAt: z.string().datetime(), text: z.string().max(16000),
  facts: z.array(z.object({ field: z.enum(jobFields), value: z.string().max(2000), excerpt: z.string().max(2000),
    certainty: z.enum(['explicit', 'uncertain']), reviewed: z.boolean() }).strict()).max(100)
}).strict();
export type JobSource = z.infer<typeof JobSource>;
export function appendJobSource(sources: JobSource[], source: JobSource): JobSource[] {
  if (sources.some(s => s.kind === source.kind && s.url === source.url && s.text === source.text)) return sources;
  if (sources.length >= 20) throw new Error('Job source limit reached. Review and delete an old source before capturing another. Existing evidence was preserved.');
  return [...sources, source];
}
const headings: Record<string, typeof jobFields[number]> = {
  company: 'company', employer: 'company', role: 'role', 'job title': 'role', 'requisition id': 'requisition', 'job id': 'requisition',
  location: 'location', 'work arrangement': 'workArrangement', 'location type': 'workArrangement', 'employment type': 'employmentType',
  responsibilities: 'responsibilities', requirements: 'requiredQualifications', 'required qualifications': 'requiredQualifications',
  'preferred qualifications': 'preferredQualifications', 'nice to have': 'preferredQualifications', experience: 'experience',
  compensation: 'compensation', salary: 'compensation', 'required documents': 'documents'
};

/** Conservative line extraction. No inference of employer, country, currency or eligibility. */
export function captureJobSource(text: string, kind: JobSource['kind'], url = '', now = new Date()): JobSource {
  const facts: JobSource['facts'] = [];
  let section: typeof jobFields[number] | undefined;
  for (const raw of text.slice(0, 16000).split('\n')) {
    const line = raw.trim();
    if (!line || line.length > 2000) continue;
    const match = /^([^:]{2,40}):\s*(.*)$/.exec(line);
    const field = headings[(match?.[1] ?? line).toLowerCase()];
    if (field) {
      section = ['responsibilities', 'requiredQualifications', 'preferredQualifications', 'documents'].includes(field) ? field : undefined;
      if (match?.[2]) facts.push({ field, value: match[2], excerpt: line, certainty: 'explicit', reviewed: false });
    } else if (section && /^[-•*]\s+/.test(line)) {
      facts.push({ field: section, value: line.replace(/^[-•*]\s+/, ''), excerpt: line, certainty: 'explicit', reviewed: false });
    } else {
      section = undefined;
      const uncertain = /\b\d+\+?\s+years?\b/i.test(line) ? 'experience' : /\b(remote|hybrid|on-site)\b/i.test(line) ? 'workArrangement' : undefined;
      if (uncertain) facts.push({ field: uncertain, value: line, excerpt: line, certainty: 'uncertain', reviewed: false });
    }
    if (facts.length >= 100) break;
  }
  return JobSource.parse({ id: crypto.randomUUID(), kind, url, capturedAt: now.toISOString(), text: text.slice(0, 16000), facts });
}

export function jobConflicts(sources: JobSource[]) {
  return jobFields.filter(field => {
    const perSource = sources.map(s => [...new Set(s.facts.filter(f => f.field === field)
      .map(f => f.value.trim().toLowerCase()))].sort()).filter(values => values.length);
    return new Set(perSource.map(values => JSON.stringify(values))).size > 1;
  });
}
