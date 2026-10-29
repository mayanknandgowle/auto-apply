import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { FormDriver } from '../forms/driver';

export default defineUnlistedScript(() => {
  const world = globalThis as typeof globalThis & { __applyPilotInstalled?: boolean };
  if (world.__applyPilotInstalled) return;
  world.__applyPilotInstalled = true;
  const driver = new FormDriver();
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('background.js')) return false;
    void driver.handle(message).then(data => respond({ ok: true, data })).catch(() => respond({ ok: false, error: 'The control changed or is unsupported. Inspect again; existing values were preserved.' }));
    return true;
  });
});
