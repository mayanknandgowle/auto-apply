import type { Control, Session, State, Snapshot } from './model';

export const sensitiveQuestion = (label: string) => /\b(gender|sex|race|ethnic|disab|veteran|health|religio|salary|compensation|sponsor|authori[sz]|citizen|criminal|convict|birth|age|nationality)/i.test(label);

/** Stable semantics across a reload; uncertainty never authorizes a second dispatch. */
export function writeBlocked(session: Session, control: Control) {
  return session.journal.some(j => ['intent', 'uncertain'].includes(j.status) &&
    ((j.controlId === control.id && j.documentToken === session.snapshot.documentToken) || j.fingerprint === control.fingerprint));
}
export function reconcile(session: Session, snapshot: Snapshot) {
  for (const entry of session.journal.filter(e => e.status === 'intent')) {
    const control = snapshot.controls.find(c => c.id === entry.controlId && c.fingerprint === entry.fingerprint);
    entry.status = snapshot.documentToken === entry.documentToken && control?.value === entry.after && !control.invalid ? 'verified' : 'uncertain';
  }
  // Native FileList does not establish server receipt, including after a restart.
  for (const upload of session.uploads) if (upload.status === 'intent') upload.status = 'uncertain';
}
export function receiptAnswers(state: State) {
  return state.session!.journal.slice(-100).filter(j => !sensitiveQuestion(j.label)).map(j => ({ label: j.label, value: j.after, status: j.status }));
}
