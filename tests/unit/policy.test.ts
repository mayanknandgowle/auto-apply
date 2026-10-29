import { describe, expect, it } from 'vitest';
import { initialState, Envelope, type Control } from '../../src/core/model';
import { mapField, manualOnly, resolveValue, trustedUi } from '../../src/core/policy';
const field = (label: string, changes: Partial<Control> = {}): Control => ({ id: 'f', fingerprint: 'p', label, kind: 'text', autocomplete: '', required: false, value: '', options: [], maxLength: -1, invalid: false, ...changes });
describe('exact contact mapping', () => {
  it.each([['First name *','firstName'],['Email address (required)','email'],['LinkedIn URL','linkedin'],['Country','country']])('maps %s', (label, key) => expect(mapField(field(label))).toBe(key));
  it.each(['Employer email', 'Emergency contact phone', 'Country of citizenship', 'Are you authorized to work in India?', 'Expected salary', 'Do not enter your name', 'School name', 'Name of reference'])('abstains on %s', label => expect(mapField(field(label))).toBeUndefined());
  it('does not infer false or select an approximate option', () => {
    const profile = initialState().profile;
    expect(resolveValue(field('Sponsorship'), profile)).toBeUndefined();
    profile.facts.push({ id: crypto.randomUUID(), key: 'country', value: 'India', source: 'manual', confirmedAt: new Date().toISOString(), revision: 1 });
    expect(resolveValue(field('Country', { kind: 'select', options: [{ label: 'United States', value: 'us' }] }), profile)).toBeUndefined();
    expect(resolveValue(field('Country', { kind: 'select', options: [{ label: 'India', value: 'in' }] }), profile)).toBe('in');
  });
  it('requires manual handling for attestations and uploads', () => {
    expect(manualOnly(field('I certify accuracy'))).toBe(true);
    expect(manualOnly(field('Resume', { kind: 'file' }))).toBe(true);
    expect(manualOnly(field('Agree', { kind: 'checkbox' }))).toBe(true);
  });
  it('does not silently truncate a fact', () => {
    const profile = initialState().profile;
    profile.facts.push({ id: crypto.randomUUID(), key: 'firstName', value: 'LongName', source: 'manual', confirmedAt: '', revision: 1 });
    expect(resolveValue(field('First name', { maxLength: 3 }), profile)).toBeUndefined();
  });
});
describe('message authority', () => {
  it('accepts only the exact trusted extension panel', () => {
    const sender = { id: 'ext', url: 'chrome-extension://ext/sidepanel.html' };
    expect(trustedUi(sender, 'ext', 'chrome-extension://ext/')).toBe(true);
    expect(trustedUi({ ...sender, tab: { id: 1 } as chrome.tabs.Tab, origin: 'chrome-extension://ext' }, 'ext', 'chrome-extension://ext/')).toBe(true);
    expect(trustedUi({ ...sender, origin: 'https://employer.invalid' }, 'ext', 'chrome-extension://ext/')).toBe(false);
    expect(trustedUi({ ...sender, url: 'https://employer.invalid' }, 'ext', 'chrome-extension://ext/')).toBe(false);
    expect(trustedUi({ ...sender, id: 'other' }, 'ext', 'chrome-extension://ext/')).toBe(false);
  });
  it('rejects submit, extra properties, and invalid revisions', () => {
    const envelope = { schema: 1, requestId: crypto.randomUUID(), expectedRevision: 0, command: { type: 'GET' } };
    expect(Envelope.safeParse(envelope).success).toBe(true);
    expect(Envelope.safeParse({ ...envelope, command: { type: 'SUBMIT' } }).success).toBe(false);
    expect(Envelope.safeParse({ ...envelope, authority: 'system' }).success).toBe(false);
    expect(Envelope.safeParse({ ...envelope, expectedRevision: -1 }).success).toBe(false);
  });
});
