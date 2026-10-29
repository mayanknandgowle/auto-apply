import { z } from 'zod';
import type { Control, Profile, State } from './model';

export const JobContext = z.object({
  company: z.string().max(200), role: z.string().max(200), country: z.string().max(100), location: z.string().max(200),
  requisition: z.string().max(100), url: z.string().max(3000), confirmed: z.boolean(), revision: z.number().int().nonnegative()
}).strict();
export type JobContext = z.infer<typeof JobContext>;
export const emptyJob = (): JobContext => ({ company: '', role: '', country: '', location: '', requisition: '', url: '', confirmed: false, revision: 0 });
export const AnswerMemory = z.object({
  id: z.string().uuid(), question: z.string().max(1500), kind: z.string().max(50), options: z.string().max(60000), answer: z.string().max(10000),
  origin: z.string().url(), company: z.string().min(1).max(200), role: z.string().min(1).max(200), country: z.string().min(1).max(100),
  profileRevision: z.number().int(), approvedAt: z.string().datetime(), expiresAt: z.string().datetime()
}).strict();
export type AnswerMemory = z.infer<typeof AnswerMemory>;
export const ImportedChange = z.object({
  id: z.string().uuid(), source: z.string().max(200), at: z.string().datetime(), key: z.string().max(50),
  before: z.unknown(), afterId: z.string().uuid(), afterRevision: z.number().int(), rolledBack: z.boolean(), sourceDeleted: z.boolean(), rollbackUnavailable:z.boolean().optional()
}).strict();
export type ImportedChange = z.infer<typeof ImportedChange>;
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
export function memoryMatch(control: Control, state: State, now = Date.now()): AnswerMemory | undefined {
  const job = state.job;
  if (!state.session || !job.confirmed || job.url !== state.session.url) return;
  return state.memory.find(m => m.question === control.label && m.kind === control.kind && m.options === JSON.stringify(control.options) &&
    m.origin === state.session!.origin && normalized(m.company) === normalized(job.company) && normalized(m.role) === normalized(job.role) &&
    normalized(m.country) === normalized(job.country) && m.profileRevision === state.profile.revision && Date.parse(m.expiresAt) > now);
}
export function makeMemory(control: Control, answer: string, state: State, now = new Date()): AnswerMemory {
  const job = state.job;
  if (!state.session || !job.confirmed || job.url !== state.session.url || !job.company.trim() || !job.role.trim() || !job.country.trim()) throw new Error('Confirm the employer, role and job country for this page before saving reusable answers.');
  const days = /salary|notice|compensation|availab|start date/i.test(control.label) ? 7 : 30;
  return AnswerMemory.parse({ id: crypto.randomUUID(), question: control.label, kind: control.kind, options: JSON.stringify(control.options), answer,
    origin: state.session.origin, company: job.company, role: job.role, country: job.country, profileRevision: state.profile.revision,
    approvedAt: now.toISOString(), expiresAt: new Date(now.getTime() + days * 86400000).toISOString() });
}
export function restoreImport(profile: Profile, change: ImportedChange): Profile {
  const current = profile.facts.find(f => f.key === change.key);
  if (change.rolledBack || change.sourceDeleted || change.rollbackUnavailable || current?.id !== change.afterId || current.revision !== change.afterRevision) throw new Error('This value changed after import or its rollback source was deleted. Review it manually; rollback will not overwrite newer edits.');
  const facts = profile.facts.filter(f => f.key !== change.key);
  if (change.before) facts.push(change.before as Profile['facts'][number]);
  return { ...profile, revision: profile.revision + 1, facts };
}
