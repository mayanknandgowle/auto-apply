import { DriverCommand, type Control, type Snapshot } from '../core/model';
import { manualOnly, hasValue } from '../core/policy';
import { sensitiveQuestion } from '../core/recovery';
import { isLeverForm, leverIdentity, leverQuestion, LEVER_VERSION } from './lever';
import { acceptsFile, resumeUploadControl } from '../documents/attachment';
import { fromBase64 } from '../storage/crypto';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const selector = 'input,textarea,select,[role="combobox"]';
const pageHidden=()=>document.visibilityState==='hidden';
function parentElement(el: Element): Element | null {
  return el.parentElement ?? (el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host : null);
}
function inspectableNodes(scope: Element): Element[] {
  const nodes: Element[] = [];
  let budget = 5000;
  const walk = (root: Element | ShadowRoot) => {
    for (const node of Array.from(root.children)) {
      if (--budget < 0) return;
      if (node.matches(selector)) nodes.push(node);
      if (node.shadowRoot) walk(node.shadowRoot);
      walk(node);
    }
  };
  walk(scope);
  return nodes;
}
export function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  const rect = element.getBoundingClientRect();
  if (!element.getClientRects().length || rect.width < 2 || rect.height < 2 || rect.right < 0 || rect.bottom < 0) return false;
  for (let el: Element | null = element; el; el = parentElement(el)) {
    if (el.matches('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') return false;
  }
  return true;
}
function labelOf(el: Field, lever = false): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const labelled = el.getAttribute('aria-labelledby')?.split(/\s+/).map(id => root.getElementById(id)?.textContent ?? '').join(' ');
  const labels = Array.from(el.labels ?? []).map(label => {
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input,select,textarea,button,[hidden],[aria-hidden="true"]').forEach(control => control.remove());
    return copy.textContent ?? '';
  }).join(' ');
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() || (lever ? leverQuestion(el) : undefined);
  const name = (labelled || el.getAttribute('aria-label') || labels || '').replace(/\s+/g, ' ').trim();
  const section = legend || el.closest('section')?.querySelector('h2,h3')?.textContent?.trim() || el.form?.querySelector('h2,h3')?.textContent?.trim();
  if (section && /\b(emergency|reference|referee|employer|employment|education|school|manager|parent|spouse|dependent|citizenship|nationality|authorization|sponsorship|billing|payment|sign in|log in|authentication)\b/i.test(section)) {
    return `${section} — ${name}`.slice(0, 1500);
  }
  return ((el.type === 'radio' || el.type === 'checkbox') && legend ? `${legend} — ${name}` : name || legend || '').slice(0, 1500);
}
function describe(el: Field, id: string, lever = false): Control | undefined {
  if (!isVisible(el)) return;
  const disabled = el.matches(':disabled,[aria-disabled="true"]') || ('readOnly' in el && el.readOnly);
  const type = el instanceof HTMLSelectElement ? 'select' : el instanceof HTMLTextAreaElement ? 'textarea' : el.type;
  if (['password', 'hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
  const label = labelOf(el, lever);
  const authContext = `${label} ${el.autocomplete} ${el.name} ${el.id}`;
  if (/\b(password|otp|captcha|one.time|verification.code|credit.card|card.number|cvc|cvv|ssn|social.security|bank.account)\b/i.test(authContext)) return;
  const kind = ['text', 'email', 'tel', 'url', 'number', 'date', 'textarea', 'select', 'checkbox', 'radio', 'file'].includes(type) ? type as Control['kind'] : 'unsupported';
  const peers = el instanceof HTMLInputElement && ['checkbox','radio'].includes(type)
    ? Array.from((el.getRootNode() as Document | ShadowRoot).querySelectorAll('input')).filter((p):p is HTMLInputElement => p instanceof HTMLInputElement && p.type === type && !!el.name && p.name === el.name && p.form === el.form) : [];
  const question = el.closest('fieldset')?.querySelector('legend')?.textContent?.trim() || (lever ? leverQuestion(el) : undefined);
  const optionLabel = (p: HTMLInputElement) => labelOf(p, lever).split(' — ').pop() ?? '';
  const choice = peers.length && question ? { question:question.slice(0,1500), option:optionLabel(el as HTMLInputElement).slice(0,500), group:el.name.slice(0,1000),
    selected:type === 'radio' ? peers.some(p=>p.checked) : (el as HTMLInputElement).checked,
    writable:peers.length <= 100 && peers.every(p=>isVisible(p) && !p.matches(':disabled') && !!optionLabel(p)) && new Set(peers.map(p=>p.value)).size===peers.length } : undefined;
  const options = el instanceof HTMLSelectElement ? Array.from(el.options).filter(o => !o.disabled && !o.closest('optgroup:disabled')).slice(0, 100).map(o => ({ value: o.value.slice(0, 500), label: o.label.slice(0, 500) })) : peers.slice(0,100).map(p=>({value:p.value.slice(0,500),label:optionLabel(p).slice(0,500)}));
  const value = type === 'file' ? '' : ['checkbox', 'radio'].includes(type) ? String((el as HTMLInputElement).checked) : el.value.slice(0, 12000);
  const detail = { label, kind, autocomplete: (el.getAttribute('autocomplete') ?? '').slice(0, 100), required: el.required, options, maxLength: 'maxLength' in el ? el.maxLength : -1, invalid: !el.validity.valid || el.getAttribute('aria-invalid') === 'true', disabled, validation:el.validationMessage.slice(0,500), ...(choice?{choice}:{}) };
  const file=el instanceof HTMLInputElement && type==='file'?{accept:el.accept.slice(0,500),name:el.files?.[0]?.name.slice(0,200)??'',size:el.files?.[0]?.size??0,multiple:el.multiple}:undefined;
  const fingerprint = JSON.stringify({ ...detail, invalid: undefined, validation:undefined, choice:choice?{...choice,selected:undefined}:undefined, name: el.name, form: el.form?.getAttribute('action'), context: el.closest('fieldset')?.querySelector('legend')?.textContent, optionsCount: el instanceof HTMLSelectElement ? el.options.length : 0, ...(file?{accept:file.accept,multiple:file.multiple}:{}) });
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
  private lever = false;
  private adaptersEnabled = true;

  inspect(): Snapshot {
    this.snapshotId = crypto.randomUUID();
    this.currentUrl = location.href;
    this.lever = this.adaptersEnabled && isLeverForm(document, location.href);
    this.registry.clear();
    const scope = document.querySelector('main') ?? document.body;
    const controls: Control[] = [];
    const warnings: string[] = [];
    const nodes = inspectableNodes(scope);
    if (nodes.length > 200) warnings.push('This page has too many controls. Only the first 200 are inspected; complete the rest manually.');
    for (const node of nodes.slice(0, 200)) {
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement)) {
        if (isVisible(node)) warnings.push('A custom dropdown needs manual selection.');
        continue;
      }
      let id = this.ids.get(node);
      if (!id) { id = crypto.randomUUID(); this.ids.set(node, id); }
      const control = describe(node, id, this.lever);
      if (control && sensitiveQuestion(control.label) && hasValue(control)) {
        warnings.push('An answered sensitive question was excluded from the inspection. Review it directly on the website.');
        continue;
      }
      if (control) { controls.push(control); this.registry.set(id, node); }
    }
    if (document.querySelector('iframe')) warnings.push('Embedded frames are not filled in this build. Complete them on the site.');
    if (document.querySelector('canvas')) warnings.push('Canvas controls require manual completion. Closed shadow roots cannot be inspected.');
    if (controls.some(c=>c.disabled)) warnings.push('Disabled or read-only controls are shown for review and will not be filled.');
    if (this.lever) warnings.push('Experimental Lever hosted adapter. Submit application is terminal and stays manual. Live writes and server upload acceptance are unvalidated.');
    if (document.querySelector('input[type="password"],iframe[src*="captcha"],[id*="captcha"]')) warnings.push('Sign-in or verification may require your attention. Authentication fields are excluded.');
    const jd = document.querySelector('[data-job-description], [itemprop="description"], .job-description');
    return {
      documentToken: this.documentToken, snapshotId: this.snapshotId, url: location.href.slice(0, 3000), title: document.title.slice(0, 300),
      heading: (document.querySelector('h1')?.textContent ?? document.title).trim().slice(0, 300),
      jobText: jd instanceof HTMLElement && isVisible(jd) ? jd.innerText.slice(0, 16000) : '',
      controls, warnings: [...new Set(warnings)].slice(0, 20), capturedAt: Date.now(),
      ...(this.lever ? {adapter:{id:LEVER_VERSION,identity:leverIdentity(location.href)!,stage:'application' as const,terminal:'manual' as const}} : {})
    };
  }
  async handle(input: unknown): Promise<unknown> {
    const cmd = DriverCommand.parse(input);
    if (cmd.type === 'INSPECT') { this.adaptersEnabled = cmd.adaptersEnabled ?? true; return this.inspect(); }
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
    const current = el && describe(el, cmd.controlId, this.lever);
    if (!el || !current || current.fingerprint !== cmd.fingerprint || current.value !== cmd.before) throw new Error('The field changed. Your edit was preserved.');
    if(cmd.type==='ATTACH') {
      if(!(el instanceof HTMLInputElement) || !resumeUploadControl(current) || el.files?.length || !acceptsFile(el.accept,cmd.file.name,cmd.file.mime))throw new Error('This upload needs manual review. Existing files are preserved.');
      const bytes=fromBase64(cmd.file.base64);
      if(bytes.length!==cmd.file.size)throw new Error('File size mismatch.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==cmd.file.hash || !this.binding || this.binding.sessionId!==cmd.sessionId || this.binding.generation!==cmd.generation || this.currentUrl!==location.href || pageHidden() || Date.now()>cmd.expiresAt || describe(el,cmd.controlId,this.lever)?.fingerprint!==cmd.fingerprint || el.files?.length)throw new Error('File or page changed before attachment.');
      this.seen.add(cmd.actionId);if(this.seen.size>500)throw new Error('Action limit reached.');
      const transfer=new DataTransfer();transfer.items.add(new File([bytes],cmd.file.name,{type:cmd.file.mime}));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'files')!.set!.call(el,transfer.files);
      el.dispatchEvent(new Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      await new Promise(resolve=>setTimeout(resolve,250));
      const after=describe(el,cmd.controlId,this.lever),file=el.files?.[0];
      return {attached:!!after && after.fingerprint===cmd.fingerprint && !after.invalid && file?.name===cmd.file.name && file.size===cmd.file.size,processing:'not-verified'};
    }
    if (manualOnly(current) || (hasValue(current) && !cmd.undo)) throw new Error('Complete this field on the website.');
    if (current.choice && (cmd.undo || cmd.value !== 'true')) throw new Error('Only explicitly selecting an empty choice is supported. Change existing selections on the website.');
    if (current.maxLength > 0 && cmd.value.length > current.maxLength) throw new Error('The answer exceeds the field limit.');
    if (el instanceof HTMLSelectElement && (el.multiple || !current.options.some(o => o.value === cmd.value))) throw new Error('Choose an exact available option.');
    this.seen.add(cmd.actionId);
    if (this.seen.size > 500) throw new Error('Action limit reached. Start a fresh application.');
    const prototype = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, current.choice ? 'checked' : 'value')!.set!.call(el, current.choice ? true : cmd.value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = describe(el, cmd.controlId, this.lever);
    if (!result || result.fingerprint !== cmd.fingerprint || result.value !== cmd.value || (!cmd.undo && result.invalid)) return { verified: false };
    return { verified: true, value: result.value };
  }
}
