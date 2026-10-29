import type { Control, Profile, ProfileKey } from './model';

const aliases: Record<string, ProfileKey> = {
  'first name': 'firstName', 'given name': 'firstName', 'last name': 'lastName', surname: 'lastName', 'family name': 'lastName',
  'full name': 'fullName', 'legal name': 'fullName', name: 'fullName', email: 'email', 'email address': 'email',
  phone: 'phone', 'phone number': 'phone', 'mobile number': 'phone', telephone: 'phone', city: 'city',
  state: 'region', region: 'region', 'state province': 'region', country: 'country', 'postal code': 'postalCode', 'zip code': 'postalCode',
  address: 'address', 'street address': 'address', linkedin: 'linkedin', 'linkedin url': 'linkedin', 'linkedin profile': 'linkedin',
  github: 'github', 'github url': 'github', portfolio: 'portfolio', 'portfolio url': 'portfolio', 'personal website': 'portfolio'
};
export function normalizeLabel(label: string) {
  return label.toLowerCase().replace(/[＊*]/g, '').replace(/\((?:required|optional)\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function mapField(control: Control): ProfileKey | undefined {
  if (!['text', 'email', 'tel', 'url', 'select', 'textarea'].includes(control.kind)) return;
  // Exact wording is deliberate: employer contact, citizenship and salary must not match contact substrings.
  return aliases[normalizeLabel(control.label)];
}
export function resolveValue(control: Control, profile: Profile): string | undefined {
  const key = mapField(control);
  if (!key) return;
  let value = profile.facts.find(f => f.key === key)?.value.trim();
  if (!value && key === 'fullName') {
    const first = profile.facts.find(f => f.key === 'firstName')?.value;
    const last = profile.facts.find(f => f.key === 'lastName')?.value;
    if (first && last) value = `${first} ${last}`;
  }
  if (!value) return;
  if (control.kind === 'select') {
    const options = control.options.filter(o => o.label.trim().toLowerCase() === value!.toLowerCase());
    return options.length === 1 ? options[0]!.value : undefined;
  }
  if (control.maxLength > 0 && value.length > control.maxLength) return;
  return value;
}
export function manualOnly(control: Control) {
  return ['file', 'unsupported', 'checkbox', 'radio'].includes(control.kind) || /\b(password|one.time|otp|captcha|signature|certify|attest|agree|consent|credit card|bank account|social security|ssn)\b/i.test(control.label);
}
export function explanation(control: Control, hindi = false): string {
  if (manualOnly(control)) return hindi ? 'इस प्रश्न को वेबसाइट पर खुद पूरा करें, फिर दोबारा जाँचें।' : 'Complete this control on the website, then inspect again. Uploads, agreements and unsupported controls need your review.';
  if (/sponsor/i.test(control.label)) return hindi ? 'यह भविष्य में नियोक्ता की वीज़ा सहायता के बारे में है। मौजूदा कार्य अनुमति से इसका उत्तर तय नहीं होता।' : 'This asks about employer sponsorship. Current work authorization does not establish whether you need future sponsorship.';
  if (/authori[sz]|eligible.*work/i.test(control.label)) return hindi ? 'निर्दिष्ट देश में अपनी वास्तविक कार्य अनुमति के अनुसार उत्तर दें।' : 'Answer for the country and time frame stated. Location or nationality alone does not establish work authorization.';
  if (/salary|compensation|ctc|pay\b/i.test(control.label)) return hindi ? 'मुद्रा, सालाना या मासिक रकम, और वर्तमान या अपेक्षित वेतन जाँचें।' : 'Check currency, annual versus monthly amount, fixed versus total pay, and current versus expected compensation.';
  return hindi ? 'मूल प्रश्न और सभी विकल्प पढ़ें। केवल सत्यापित जानकारी दें; अनिश्चित होने पर वेबसाइट पर पूरा करें।' : 'Read the complete question and exact options. Use your own verified information; leave unknown facts unresolved.';
}
export function trustedUi(sender: chrome.runtime.MessageSender, extensionId: string, origin: string): boolean {
  // Chrome also supplies sender.tab when the same trusted page is opened in a tab.
  // Trust browser-provided origin/URL, never a claimed role in the message payload.
  return sender.id === extensionId && sender.url === `${origin}sidepanel.html` &&
    (!sender.origin || sender.origin === origin.replace(/\/$/, ''));
}
