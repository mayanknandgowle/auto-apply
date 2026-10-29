import { defineBackground } from 'wxt/utils/define-background';
import { Coordinator } from '../orchestration/coordinator';

export default defineBackground(() => {
  const coordinator = new Coordinator();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.runtime.onConnect.addListener(port => coordinator.connect(port));
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'vault-idle-lock') void coordinator.expireVault(); });
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    void coordinator.receive(message, sender).then(data => respond({ ok: true, ...data })).catch(error => {
      const message = error instanceof Error && error.name !== 'ZodError' ? error.message : 'The data could not be validated. Refresh and try again.';
      respond({ ok: false, error: message.slice(0, 600) });
    });
    return true;
  });
  chrome.tabs.onActivated.addListener(() => { void coordinator.interrupt('Active tab changed. Return to the application and inspect again.'); });
  chrome.tabs.onRemoved.addListener(() => { void coordinator.interrupt('A tab closed. Inspect the intended application before resuming.'); });
  chrome.tabs.onUpdated.addListener((_tabId, change) => { if (change.status === 'loading') void coordinator.interrupt('A page navigated. Inspect the current application step before resuming.'); });
  chrome.permissions.onRemoved.addListener(() => { void coordinator.interrupt('Site access changed. Grant access again before continuing.'); });
});
