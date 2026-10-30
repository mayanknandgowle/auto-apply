import { Snapshot, type DriverCommand } from '../core/model';

export async function activeTab(): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) throw new Error('Open a career page and click the ApplyPilot toolbar icon to grant access.');
  return tab as chrome.tabs.Tab & { id: number; url: string };
}
export async function sendDriver(tabId: number, command: DriverCommand): Promise<unknown> {
  const response = await chrome.tabs.sendMessage(tabId, command, { frameId: 0 });
  if (!response?.ok) throw new Error(response?.error || 'Unable to reach the page. Click the extension icon and inspect again.');
  return response.data;
}
export async function inspectTab(tabId: number, adaptersEnabled = true) {
  await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['driver.js'] });
  return Snapshot.parse(await sendDriver(tabId, { type: 'INSPECT', adaptersEnabled }));
}
