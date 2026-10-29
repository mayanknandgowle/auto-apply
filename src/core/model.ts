import { z } from 'zod';
import { Candidate } from './candidate';
import { AnswerMemory, ImportedChange, JobContext, emptyJob } from './reuse';
import { Assessment, Requirement } from './assessment';
import { ResumeEdit } from '../documents/edits';

export const SCHEMA = 2;
export const Provider = z.object({ kind: z.enum(['gemini', 'openai', 'compatible']).default('gemini'), endpoint: z.string().max(1000).default(''), model: z.string().max(120), configured: z.boolean() }).strict();
export const ProfileKey = z.enum(['firstName', 'lastName', 'fullName', 'email', 'phone', 'city', 'region', 'postalCode', 'country', 'address', 'linkedin', 'github', 'portfolio']);
export type ProfileKey = z.infer<typeof ProfileKey>;
export const profileLabels: Record<ProfileKey, string> = {
  firstName: 'First name', lastName: 'Last name', fullName: 'Full name', email: 'Email', phone: 'Phone',
  city: 'City', region: 'State / region', postalCode: 'Postal code', country: 'Country', address: 'Street address',
  linkedin: 'LinkedIn URL', github: 'GitHub URL', portfolio: 'Portfolio URL'
};
export const Fact = z.object({
  id: z.string().uuid(), key: ProfileKey, value: z.string().max(500), source: z.string().max(200),
  confirmedAt: z.string(), revision: z.number().int().positive(),
  sourceDeleted: z.boolean().optional()
}).strict();
export const Evidence = z.object({ id: z.string().uuid(), title: z.string().min(1).max(120), text: z.string().min(1).max(3000), confirmedAt: z.string() }).strict();
export const Profile = z.object({ revision: z.number().int().nonnegative(), facts: z.array(Fact).max(30), evidence: z.array(Evidence).max(40), candidate: Candidate.default(() => Candidate.parse({})) }).strict();
export type Profile = z.infer<typeof Profile>;
export const Control = z.object({
  id: z.string().max(80), fingerprint: z.string().max(30000), label: z.string().max(1500),
  kind: z.enum(['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select', 'checkbox', 'radio', 'file', 'unsupported']),
  autocomplete: z.string().max(100), required: z.boolean(), value: z.string().max(12000),
  options: z.array(z.object({ label: z.string().max(500), value: z.string().max(500) }).strict()).max(100),
  maxLength: z.number().int(), invalid: z.boolean()
  ,file:z.object({accept:z.string().max(500),name:z.string().max(200),size:z.number().int(),multiple:z.boolean()}).strict().optional()
}).strict();
export type Control = z.infer<typeof Control>;
export const Snapshot = z.object({
  documentToken: z.string().uuid(), snapshotId: z.string().uuid(), url: z.string().url().max(3000), title: z.string().max(300),
  heading: z.string().max(300), jobText: z.string().max(16000), controls: z.array(Control).max(200),
  warnings: z.array(z.string().max(300)).max(20), capturedAt: z.number()
}).strict();
export type Snapshot = z.infer<typeof Snapshot>;
export const Journal = z.object({
  id: z.string().uuid(), controlId: z.string(), label: z.string().max(1500), before: z.string().max(12000), after: z.string().max(12000),
  fingerprint: z.string().max(30000), documentToken: z.string().uuid(), status: z.enum(['intent', 'verified', 'uncertain', 'undone']), at: z.string()
}).strict();
export type Journal = z.infer<typeof Journal>;
export const Upload = z.object({id:z.string().uuid(),controlId:z.string(),documentToken:z.string().uuid(),hash:z.string(),name:z.string().max(200),status:z.enum(['intent','attached-unverified','uncertain']),at:z.string().datetime()}).strict();
export const Decision = z.object({ control: Control, reason: z.string().max(400), draft: z.string().max(10000).optional(), evidenceIds: z.array(z.string()).optional() }).strict();
export const Session = z.object({
  id: z.string().uuid(), tabId: z.number().int(), origin: z.string().url(), url: z.string().url(), title: z.string().max(300),
  state: z.enum(['ready', 'filling', 'awaiting-user', 'paused', 'review']), generation: z.number().int(),
  snapshot: Snapshot, decisions: z.array(Decision).max(200), journal: z.array(Journal).max(500),
  approved: z.record(z.string(), z.object({ value: z.string().max(10000), fingerprint: z.string(), documentToken: z.string() }).strict()),
  note: z.string().max(600), startedAt: z.string(), mode: z.enum(['assist', 'autofill'])
  ,uploads:z.array(Upload).max(20).default([])
}).strict();
export type Session = z.infer<typeof Session>;
export const Resume = z.object({ id: z.string().uuid(), name: z.string().max(200), mime: z.string(), size: z.number().int(), hash: z.string(), text: z.string().max(60000), base64: z.string().max(4200000), importedAt: z.string() }).strict();
export const Variant = z.object({ resume: Resume, parentHash:z.string(), jobHash:z.string(), profileRevision:z.number().int(), approvedText:z.string().max(60000), edits:z.array(ResumeEdit).max(200), previewReviewed:z.literal(true) }).strict();
export const Receipt = z.object({ id: z.string().uuid(), at: z.string().datetime(), job: JobContext, url: z.string().url(), status: z.enum(['prepared', 'user-reported-submitted']), resumeName: z.string().max(200), resumeHash: z.string(), upload: z.literal('not-verified'), uploads:z.array(Upload).max(20).default([]), answers: z.array(z.object({ label: z.string().max(1500), value: z.string().max(10000), status: z.string().max(30) }).strict()).max(100) }).strict();
export const State = z.object({
  schema: z.literal(2), revision: z.number().int().nonnegative(), profile: Profile,
  session: Session.nullable(), resume: Resume.nullable(), jobText: z.string().max(16000),
  requestIds: z.array(z.string()).max(100), aiRequests: z.number().int().nonnegative(),
  provider: Provider,
  storage: z.object({ mode: z.enum(['session', 'saved']), locked: z.boolean(), idleMinutes: z.number().int().min(1).max(60), recoveryError:z.string().optional() }).strict().default({ mode: 'session', locked: false, idleMinutes: 15 }),
  job: JobContext.default(emptyJob), memory: z.array(AnswerMemory).max(200).default([]), imports: z.array(ImportedChange).max(100).default([]),
  assessment: Assessment.nullable().default(null), history: z.array(Receipt).max(50).default([]),
  retention: z.enum(['30', '90', 'keep']).default('30')
  ,variants:z.array(Variant).max(5).default([]),selectedVariant:z.string().uuid().nullable().default(null)
}).strict();
export type State = z.infer<typeof State>;
export function initialState(): State {
  return State.parse({ schema: 2, revision: 0, profile: { revision: 0, facts: [], evidence: [] }, session: null, resume: null, jobText: '', requestIds: [], aiRequests: 0, provider: { model: '', configured: false } });
}
export function migrateState(raw: unknown): State {
  if (!raw || typeof raw !== 'object') throw new Error('Saved data is invalid. Keep your backup; no records were reset.');
  const source = raw as Record<string, unknown>;
  if (source.schema !== 1 && source.schema !== 2) throw new Error('This data uses an unsupported version. Update ApplyPilot; no records were reset.');
  return State.parse({ ...source, schema: 2 });
}
export const UiCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET') }).strict(),
  z.object({ type:z.literal('TOUCH') }).strict(),
  z.object({ type: z.literal('INSPECT') }).strict(),
  z.object({ type: z.literal('PROFILE'), values: z.record(ProfileKey, z.string().max(500)), evidence: z.array(Evidence).max(40), source: z.string().max(200) }).strict(),
  z.object({ type: z.literal('START'), mode: z.enum(['assist', 'autofill']) }).strict(),
  z.object({ type: z.literal('TICK') }).strict(),
  z.object({ type: z.literal('PAUSE') }).strict(),
  z.object({ type: z.literal('ANSWER'), controlId: z.string(), value: z.string().max(10000), remember: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('CANDIDATE'), candidate: Candidate }).strict(),
  z.object({ type: z.literal('IMPORT_CONTACT'), key: ProfileKey, value: z.string().min(1).max(500), source: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('IMPORT_UNDO'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('SOURCE_DELETE'), source: z.string().max(200) }).strict(),
  z.object({ type: z.literal('MEMORY_DELETE'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('JOB_CONTEXT'), job: JobContext }).strict(),
  z.object({ type: z.literal('ASSESS'), requirements: z.array(Requirement).min(1).max(100) }).strict(),
  z.object({ type: z.literal('SAVE_RECEIPT'), userReported: z.boolean() }).strict(),
  z.object({ type: z.literal('DELETE_RECEIPT'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('RETENTION'), value: z.enum(['30', '90', 'keep']) }).strict(),
  z.object({ type: z.literal('VAULT_CREATE'), passphrase: z.string().min(12).max(1024), idleMinutes: z.number().int().min(1).max(60) }).strict(),
  z.object({ type: z.literal('VAULT_UNLOCK'), passphrase: z.string().max(1024) }).strict(),
  z.object({ type: z.literal('VAULT_LOCK') }).strict(),
  z.object({ type: z.literal('VAULT_REWRAP'), oldPassphrase: z.string().max(1024), newPassphrase: z.string().min(12).max(1024) }).strict(),
  z.object({ type: z.literal('BACKUP_EXPORT') }).strict(),
  z.object({ type: z.literal('BACKUP_PREVIEW'), backup: z.string().max(12000000), passphrase: z.string().max(1024) }).strict(),
  z.object({ type: z.literal('BACKUP_RESTORE'), backup: z.string().max(12000000), passphrase: z.string().max(1024), previewHash: z.string().length(64) }).strict(),
  z.object({ type: z.literal('DELETE_ALL'), confirmation: z.literal('DELETE') }).strict(),
  z.object({ type: z.literal('UNDO'), actionId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('RESUME_FILE'), resume: Resume }).strict(),
  z.object({ type: z.literal('RESUME_VARIANT'), variant: Variant }).strict(),
  z.object({ type: z.literal('SELECT_RESUME'), id:z.string().uuid().nullable() }).strict(),
  z.object({ type: z.literal('DOWNLOAD_RESUME') }).strict(),
  z.object({ type:z.literal('ATTACH_RESUME'),controlId:z.string(),hash:z.string() }).strict(),
  z.object({ type: z.literal('DELETE_VARIANT'), id:z.string().uuid() }).strict(),
  z.object({ type: z.literal('DELETE_RESUME') }).strict(),
  z.object({ type: z.literal('JOB'), text: z.string().max(16000) }).strict(),
  z.object({ type: z.literal('PROVIDER'), key: z.string().max(500), model: z.string().min(1).max(120), kind: z.enum(['gemini','openai','compatible']).default('gemini'), endpoint: z.string().max(1000).default('') }).strict(),
  z.object({ type: z.literal('AI_BEGIN'), controlId: z.string() }).strict(),
  z.object({ type: z.literal('AI_RESULT'), taskId: z.string().uuid(), result: z.unknown() }).strict(),
  z.object({ type: z.literal('END') }).strict()
]);
export type UiCommand = z.infer<typeof UiCommand>;
export const Envelope = z.object({ schema: z.literal(1), requestId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), command: UiCommand }).strict();
export const DriverCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('INSPECT') }).strict(),
  z.object({ type: z.literal('BIND'), sessionId: z.string().uuid(), generation: z.number().int(), documentToken: z.string().uuid() }).strict(),
  z.object({ type: z.literal('WRITE'), actionId: z.string().uuid(), sessionId: z.string().uuid(), generation: z.number().int(), documentToken: z.string().uuid(), snapshotId: z.string().uuid(), controlId: z.string(), fingerprint: z.string(), before: z.string().max(12000), value: z.string().max(10000), expiresAt: z.number(), undo: z.boolean() }).strict(),
  z.object({ type: z.literal('PAUSE'), generation: z.number().int() }).strict()
  ,z.object({type:z.literal('ATTACH'),actionId:z.string().uuid(),sessionId:z.string().uuid(),generation:z.number().int(),documentToken:z.string().uuid(),snapshotId:z.string().uuid(),controlId:z.string(),fingerprint:z.string(),before:z.literal(''),expiresAt:z.number(),file:z.object({name:z.string().max(200),mime:z.enum(['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),size:z.number().int().min(10).max(3145728),hash:z.string().length(64),base64:z.string().max(4200000)}).strict()}).strict()
]);
export type DriverCommand = z.infer<typeof DriverCommand>;
export function publicState(state: State) {
  return { ...state, resume: state.resume ? { ...state.resume, base64: '' } : null, variants:state.variants.map(v=>({...v,resume:{...v.resume,base64:''}})), requestIds: [] };
}
export function selectedResume(state:State) { return state.selectedVariant ? state.variants.find(v=>v.resume.id===state.selectedVariant && v.parentHash===state.resume?.hash)?.resume ?? null : state.resume; }
