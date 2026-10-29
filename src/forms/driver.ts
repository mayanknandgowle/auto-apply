import { DriverCommand, type Control, type Snapshot } from '../core/model';
import { manualOnly } from '../core/policy';
import { acceptsFile, resumeUploadControl } from '../documents/attachment';
import { fromBase64 } from '../storage/crypto';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const selector = 'input,textarea,select,[role="combobox"]';
const pageHidden=()=>document.visibilityState==='hidden';
export function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  if (!element.getClientRects().length || rect.width < 2 || rect.height < 2 || rect.right < 0 || rect.bottom < 0) return false;
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') return false;
  }
  return true;
}
function labelOf(el: Field): string {
  const labelled = el.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
  const labels = Array.from(el.labels ?? []).map(label => {
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input,select,textarea,button,[aria-hidden="true"]').forEach(control => control.remove());
    return copy.textContent ?? '';
  }).join(' ');
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim();
  const name = (labelled || el.getAttribute('aria-label') || labels || '').replace(/\s+/g, ' ').trim();
  const section = legend || el.closest('section')?.querySelector('h2,h3')?.textContent?.trim() || el.form?.querySelector('h2,h3')?.textContent?.trim();
  if (section && /\b(emergency|reference|referee|employer|manager|parent|spouse|dependent|citizenship|nationality|authorization|sponsorship|billing|payment|sign in|log in|authentication)\b/i.test(section)) {
    return `${section} — ${name}`.slice(0, 1500);
  }
  return ((el.type === 'radio' || el.type === 'checkbox') && legend ? `${legend} — ${name}` : name).slice(0, 1500);
}
function describe(el: Field, id: string): Control | undefined {
  if (!isVisible(el) || el.disabled || ('readOnly' in el && el.readOnly)) return;
  const type = el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLTextAreaElement ? 'textarea' : el.type;
  if (['password', 'hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
  const label = labelOf(el);
  const authContext = `${label} ${el.autocomplete} ${el.name} ${el.id}`;
  if (/\b(password|otp|captcha|one.time|verification.code|credit.card|card.number|cvc|cvv|ssn|social.security|bank.account)\b/i.test(authContext)) return;
  const kind = ['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select', 'checkbox', 'radio', 'file'].includes(type) ? type as Control['kind'] : 'unsupported';
  const options = el instanceof HTMLSelectElement ? Array.from(el.options).filter(o => !o.disabled).slice(0, 100).map(o => ({ value: o.value.slice(0, 500), label: o.label.slice(0, 500) })) : [];
  const value = type === 'file' ? '' : ['checkbox', 'radio'].includes(type) ? String((el as HTMLInputElement).checked) : el.value.slice(0, 12000);
  const detail = { label, kind, autocomplete: (el.getAttribute('autocomplete') ?? '').slice(0, 100), required: el.required, options, maxLength: 'maxLength' in el ? el.maxLength : -1, invalid: !el.validity.valid };
  const file=el instanceof HTMLInputElement && type==='file'?{accept:el.accept.slice(0,500),name:el.files?.[0]?.name.slice(0,200)??'',size:el.files?.[0]?.size??0,multiple:el.multiple}:undefined;
  const fingerprint = JSON.stringify({ ...detail, invalid: undefined, name: el.name, form: el.form?.getAttribute('action'), context: el.closest('fieldset')?.querySelector('legend')?.textContent, optionsCount: el instanceof HTMLSelectElement ? el.options.length : 0, ...(file?{accept:file.accept,multiple:file.multiple}:{}) });
  return { id, ...detail, value, fingerprint, ...(file?{file}:{}) };
}
export class FormDriver {
  readonly documentToken = crypto.randomUUID();
  private ids = new WeakMap<Element, string>();
  private registry = new Map<string, Field>();
  private snapshotId = '';
  private binding: { sessionId: string; generation: number } | undefined;
  private seen = new Set<string>();
  private currentUrl = location.href;

  inspect(): Snapshot {
    this.snapshotId = crypto.randomUUID();
    this.currentUrl = location.href;
    this.registry.clear();
    const scope = document.querySelector('main') ?? document.body;
    const controls: Control[] = [];
    const warnings: string[] = [];
    const nodes = Array.from(scope.querySelectorAll(selector));
    if (nodes.length > 200) warnings.push('This page has too many controls. Only the first 200 are inspected; complete the rest manually.');
    for (const node of nodes.slice(0, 200)) {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)) {
        if (isVisible(node)) warnings.push('A custom dropdown needs manual selection.');
        continue;
      }
      let id = this.ids.get(node);
      if (!id) { id = crypto.randomUUID(); this.ids.set(node, id); }
      const control = describe(node, id);
      if (control) { controls.push(control); this.registry.set(id, node); }
    }
    if (document.querySelector('iframe')) warnings.push('Embedded frames are not filled in this build. Complete them on the site.');
    if (document.querySelector('input[type="password"],iframe[src*="captcha"],[id*="captcha"]')) warnings.push('Sign-in or verification may require your attention. Authentication fields are excluded.');
    const jd = document.querySelector('[data-job-description], [itemprop="description"], .job-description');
    return {
      documentToken: this.documentToken, snapshotId: this.snapshotId, url: location.href.slice(0, 3000), title: document.title.slice(0, 300),
      heading: (document.querySelector('h1')?.textContent ?? document.title).trim().slice(0, 300),
      jobText: jd instanceof HTMLElement && isVisible(jd) ? jd.innerText.slice(0, 16000) : '',
      controls, warnings: [...new Set(warnings)].slice(0, 20), capturedAt: Date.now()
    };
  }
  async handle(input: unknown): Promise<unknown> {
    const cmd = DriverCommand.parse(input);
    if (cmd.type === 'INSPECT') return this.inspect();
    if (cmd.type === 'PAUSE') { this.binding = undefined; return { paused: true }; }
    if (cmd.type === 'BIND') {
      if (cmd.documentToken !== this.documentToken) throw new Error('Page changed. Inspect again.');
      this.binding = { sessionId: cmd.sessionId, generation: cmd.generation };
      return { bound: true };
    }
    if (!this.binding || this.binding.sessionId !== cmd.sessionId || this.binding.generation !== cmd.generation ||
      cmd.documentToken !== this.documentToken || cmd.snapshotId !== this.snapshotId || this.currentUrl !== location.href ||
      Date.now() > cmd.expiresAt || cmd.expiresAt > Date.now() + 5000 || this.seen.has(cmd.actionId) || document.visibilityState === 'hidden') {
      throw new Error('This action expired or the page changed. Inspect again.');
    }
    const el = this.registry.get(cmd.controlId);
    const current = el && describe(el, cmd.controlId);
    if (!el || !current || current.fingerprint !== cmd.fingerprint || current.value !== cmd.before) throw new Error('The field changed. Your edit was preserved.');
    if(cmd.type==='ATTACH') {
      if(!(el instanceof HTMLInputElement) || !resumeUploadControl(current) || el.files?.length || !acceptsFile(el.accept,cmd.file.name,cmd.file.mime))throw new Error('This upload needs manual review. Existing files are preserved.');
      const bytes=fromBase64(cmd.file.base64);
      if(bytes.length!==cmd.file.size)throw new Error('File size mismatch.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==cmd.file.hash || !this.binding || this.binding.sessionId!==cmd.sessionId || this.binding.generation!==cmd.generation || this.currentUrl!==location.href || pageHidden() || Date.now()>cmd.expiresAt || describe(el,cmd.controlId)?.fingerprint!==cmd.fingerprint || el.files?.length)throw new Error('File or page changed before attachment.');
      this.seen.add(cmd.actionId);if(this.seen.size>500)throw new Error('Action limit reached.');
      const transfer=new DataTransfer();transfer.items.add(new File([bytes],cmd.file.name,{type:cmd.file.mime}));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'files')!.set!.call(el,transfer.files);
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      await new Promise(resolve=>setTimeout(resolve,250));
      const after=describe(el,cmd.controlId),file=el.files?.[0];
      return {attached:!!after && after.fingerprint===cmd.fingerprint && !after.invalid && file?.name===cmd.file.name && file.size===cmd.file.size,processing:'not-verified'};
    }
    if (manualOnly(current) || (current.value && !cmd.undo)) throw new Error('Complete this field on the website.');
    if (current.maxLength > 0 && cmd.value.length > current.maxLength) throw new Error('The answer exceeds the field limit.');
    if (el instanceof HTMLSelectElement && (el.multiple || !current.options.some(o => o.value === cmd.value))) throw new Error('Choose an exact available option.');
    this.seen.add(cmd.actionId);
    if (this.seen.size > 500) throw new Error('Action limit reached. Start a fresh application.');
    const prototype = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, cmd.value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = describe(el, cmd.controlId);
    if (!result || result.fingerprint !== cmd.fingerprint || result.value !== cmd.value || (!cmd.undo && result.invalid)) return { verified: false };
    return { verified: true, value: result.value };
  }
}
