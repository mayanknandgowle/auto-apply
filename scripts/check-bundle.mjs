import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('.output/chrome-mv3');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,3);
assert.deepEqual([...manifest.permissions].sort(),['activeTab','scripting','storage','sidePanel','alarms'].sort());
assert.equal(manifest.host_permissions,undefined,'No unconditional host access in release');
assert.equal(manifest.externally_connectable,undefined);
assert.equal(manifest.web_accessible_resources,undefined);
assert.equal(manifest.content_scripts,undefined,'Page driver is explicitly injected');
assert(!manifest.content_security_policy.extension_pages.includes('unsafe-eval'));
assert(!manifest.content_security_policy.extension_pages.includes('unsafe-inline'));
for(const entry of await fs.readdir(root,{ recursive:true })){
  if(!/\.(?:js|mjs|html)$/.test(entry))continue;
  const code=await fs.readFile(path.join(root,entry),'utf8');
  assert(!/<script[^>]+src=["']https?:/i.test(code),`Remote executable script in ${entry}`);
  assert(!/AIza[0-9A-Za-z_-]{30,}/.test(code),`Potential embedded API key in ${entry}`);
}
console.log('Release manifest, permissions, CSP, remote script tags and embedded-key checks passed.');
