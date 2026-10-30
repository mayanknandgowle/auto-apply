/** Observed Lever hosted form structure, 2026-10-30. No remote code or action dispatch. */
export const LEVER_VERSION = 'lever-hosted-v1';
export function leverIdentity(url: string): string | undefined {
  const parsed = new URL(url);
  const match = /^\/([^/]+)\/([a-f0-9-]{36})(?:\/apply)?\/?$/.exec(parsed.pathname);
  return parsed.protocol === 'https:' && parsed.hostname === 'jobs.lever.co' && match ? `${parsed.origin}/${match[1]}/${match[2]}` : undefined;
}
export function isLeverForm(doc: Document, url: string) {
  return !!leverIdentity(url) && !!doc.querySelector('form#application-form input[data-qa="name-input"][name="name"]') && !!doc.querySelector('#btn-submit');
}
export function leverQuestion(el: Element): string | undefined {
  if (!el.closest('form#application-form')) return;
  const field = el.closest('.application-field');
  return field?.parentElement?.querySelector(':scope > .application-label')?.textContent?.replace(/\s+/g, ' ').trim();
}
