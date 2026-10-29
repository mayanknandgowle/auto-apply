import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ApplyPilot — application assistant',
    description: 'Fill verified profile details with supervision. Pause, review, and stay in control.',
    version: '0.2.0',
    minimum_chrome_version: '142',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel', 'alarms'],
    optional_host_permissions: ['https://*/*'],
    action: { default_title: 'Open ApplyPilot' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'self' https:; worker-src 'self'"
    }
  }
});
