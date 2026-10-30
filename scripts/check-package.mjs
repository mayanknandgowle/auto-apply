import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const release = path.resolve('.output/chrome-mv3');
const archive = path.resolve(`.output/applypilot-${version}-chrome.zip`);
const bytes = await fs.readFile(archive);
let end = bytes.length - 22;
while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
assert(end >= 0, 'ZIP end record missing');
const count = bytes.readUInt16LE(end + 10);
let offset = bytes.readUInt32LE(end + 16);
const entries = new Set();
for (let i = 0; i < count; i++) {
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'Invalid ZIP central directory');
  const method = bytes.readUInt16LE(offset + 10);
  const size = bytes.readUInt32LE(offset + 20);
  const nameLength = bytes.readUInt16LE(offset + 28);
  const extraLength = bytes.readUInt16LE(offset + 30);
  const commentLength = bytes.readUInt16LE(offset + 32);
  const local = bytes.readUInt32LE(offset + 42);
  const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
  offset += 46 + nameLength + extraLength + commentLength;
  assert(!name.includes('..') && !name.includes('\\') && !name.startsWith('/'), `Unsafe archive path: ${name}`);
  if (name.endsWith('/')) continue;
  assert(!entries.has(name), `Duplicate archive entry: ${name}`);
  entries.add(name);
  assert(/^(manifest\.json|sidepanel\.html|background\.js|driver\.js|THIRD_PARTY_NOTICES\.txt|(?:assets|chunks|pdf-fonts)\/[^/]+)$/.test(name), `Unexpected release file: ${name}`);
  assert.equal(bytes.readUInt32LE(local), 0x04034b50);
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  const compressed = bytes.subarray(start, start + size);
  assert(method === 0 || method === 8, 'Unsupported ZIP compression');
  const content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: 5_000_000 });
  assert(content.equals(await fs.readFile(path.join(release, name))), `ZIP differs from release build: ${name}`);
}
const releaseFiles = (await fs.readdir(release, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => path.relative(release, path.join(e.parentPath, e.name)).replaceAll('\\', '/'));
assert.deepEqual([...entries].sort(), releaseFiles.sort(), 'ZIP file set differs from release');
const manifest = JSON.parse(await fs.readFile(path.join(release, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, version);
assert.equal(manifest.host_permissions, undefined, 'Test host permissions leaked into release');
assert(entries.has('THIRD_PARTY_NOTICES.txt'));
const testCopy = path.resolve('.output/chrome-test');
const hasTestCopy = await fs.access(testCopy).then(() => true, () => false);
if (hasTestCopy) {
  for (const name of releaseFiles.filter(name => name !== 'manifest.json')) {
    assert((await fs.readFile(path.join(release, name))).equals(await fs.readFile(path.join(testCopy, name))), `Release differs from browser test copy: ${name}`);
  }
  console.log(`Browser test copy matches all ${releaseFiles.length - 1} non-manifest release files. This byte check does not assert that tests passed.`);
}
console.log(`Package verified: ${entries.size} files, ${bytes.length} bytes, SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`);
