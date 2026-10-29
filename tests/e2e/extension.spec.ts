import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { syntheticDocx, syntheticPdf } from '../fixtures/documents';

let context: BrowserContext;
let panel: Page;
let job: Page;
let worker: Worker;
let extensionId: string;
const base = 'http://127.0.0.1:4177';
const browserProfile = path.resolve(`test-results/browser-profile-${process.pid}`);
const extensionPath=path.resolve('.output/chrome-test');
async function launch() {
  context=await chromium.launchPersistentContext(browserProfile,{
    channel:'chromium', headless:true,
    args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]
  });
  worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  extensionId=new URL(worker.url()).hostname;
  // Match the documented unpacked-install flow. Chromium disables an unpacked
  // extension on runtime.reload when Developer mode has never been enabled.
  const extensions=await context.newPage();
  await extensions.goto('chrome://extensions');
  const developerMode=extensions.getByRole('switch',{name:'Developer mode'});
  if(await developerMode.getAttribute('aria-checked')!=='true') await developerMode.click();
  await expect(developerMode).toHaveAttribute('aria-checked','true');
  await extensions.close();
}

test.beforeAll(async () => {
  // Keep production code unchanged. A test-only localhost host grant substitutes for the toolbar's activeTab user gesture.
  await mkdir(extensionPath,{ recursive:true });
  await cp(path.resolve('.output/chrome-mv3'), extensionPath, { recursive:true });
  const manifest=JSON.parse(await readFile(path.join(extensionPath,'manifest.json'),'utf8'));
  manifest.host_permissions=[`${base}/*`];
  await writeFile(path.join(extensionPath,'manifest.json'),JSON.stringify(manifest));
  await launch();
  console.log('Browser under test:',await worker.evaluate(()=>navigator.userAgent));
});
test.afterAll(async () => { await context?.close(); });
test.beforeEach(async () => {
  job=await context.newPage(); await job.goto(base);
  panel=await context.newPage(); await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.setViewportSize({ width:420, height:900 });
  await expect(panel.getByRole('heading',{ name:'Start with an open job page' })).toBeVisible();
  await job.bringToFront();
});
test.afterEach(async () => {
  if (!panel.isClosed()) {
    await panel.evaluate(async () => {
      await chrome.runtime.sendMessage({schema:1,requestId:crypto.randomUUID(),expectedRevision:0,command:{type:'DELETE_ALL',confirmation:'DELETE'}});
    }).catch(() => undefined);
  }
  if (!panel.isClosed() && await panel.getByRole('button',{name:'Settings',exact:true}).count()) {
    await panel.getByRole('button',{ name:'Settings', exact:true }).click();
    await panel.getByRole('button',{ name:'End session & delete local data' }).click();
    await expect(panel.getByText('Session ended. Usable local data and keys removed.')).toBeVisible();
    await panel.close();
  }
  await job.close();
});

async function enableVault() {
  await panel.getByRole('button',{name:'Settings',exact:true}).click();
  await panel.getByLabel('New vault passphrase',{exact:true}).fill('synthetic-browser-passphrase');
  await panel.getByLabel('Repeat new passphrase',{exact:true}).fill('synthetic-browser-passphrase');
  await panel.getByRole('button',{name:'Enable saved profile'}).click();
  await expect(panel.getByRole('button',{name:'Lock saved profile',exact:true})).toBeVisible();
}
async function unlock() {
  await panel.getByLabel('Vault passphrase',{exact:true}).fill('synthetic-browser-passphrase');
  await panel.getByRole('button',{name:'Unlock saved profile'}).click();
  await expect(panel.getByRole('button',{name:'Profile',exact:true})).toBeVisible();
}

test('saved vault clears the panel on lock, rejects wrong passphrase and restores profile',async()=>{
  await profile();await enableVault();
  await panel.getByRole('button',{name:'Lock saved profile',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'Saved profile locked'})).toBeVisible();
  await expect(panel.getByRole('button',{name:'Profile',exact:true})).toHaveCount(0);
  await expect(panel.locator('body')).not.toContainText('alex@example.test');
  await panel.getByLabel('Vault passphrase',{exact:true}).fill('wrong-passphrase');
  await panel.getByRole('button',{name:'Unlock saved profile'}).click();
  await expect(panel.getByRole('alert')).toContainText('incorrect');
  await unlock();await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('alex@example.test');
});

test('saved vault remains locked after browser restart and unlock retains confirmed facts',async()=>{
  await profile();await enableVault();await context.close();await launch();
  job=await context.newPage();await job.goto(base);
  panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading',{name:'Saved profile locked'})).toBeVisible();
  await unlock();await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(panel.getByLabel('First name',{exact:true})).toHaveValue('Alex');
});

test('idle expiry clears secrets and replaces the open panel with the lock screen',async()=>{
  await profile();await enableVault();
  await worker.evaluate(async()=>{
    await chrome.storage.session.set({unlockUntil:Date.now()-1});
    await chrome.alarms.create('vault-idle-lock',{when:Date.now()+100});
  });
  await expect(panel.getByRole('heading',{name:'Saved profile locked'})).toBeVisible({timeout:15000});
  expect(await worker.evaluate(async()=>!!(await chrome.storage.session.get('vaultKey')).vaultKey)).toBe(false);
  await unlock();
});

test('encrypted backup restores only after a reviewable preview',async()=>{
  await profile();await enableVault();
  const downloaded=panel.waitForEvent('download');
  await panel.getByRole('button',{name:'Export encrypted backup'}).click();
  const file=await downloaded;const backup=await readFile((await file.path())!,'utf8');
  expect(backup).not.toContain('alex@example.test');
  await panel.getByText('Restore an encrypted backup',{exact:true}).click();
  await panel.getByLabel('Backup file',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await panel.getByLabel('Backup passphrase',{exact:true}).fill('synthetic-browser-passphrase');
  await expect(panel.getByRole('button',{name:'Replace local data with this backup'})).toHaveCount(0);
  await panel.getByRole('button',{name:'Preview backup',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'Alex',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Replace local data with this backup'}).click();
  await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('alex@example.test');
});

test('import rollback restores earlier contact and refuses to overwrite a later edit',async()=>{
  await profile();await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await panel.getByLabel('Profile text',{exact:true}).fill('new@example.test');
  await panel.getByRole('button',{name:'Review extracted details'}).click();
  await panel.getByRole('button',{name:'Confirm imported value'}).click();
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('new@example.test');
  await panel.getByRole('button',{name:'Roll back imported value'}).click();
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('alex@example.test');
  await panel.getByRole('button',{name:'Review extracted details'}).click();
  await panel.getByRole('button',{name:'Confirm imported value'}).click();
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('new@example.test');
  await panel.getByLabel('Email',{exact:true}).fill('later@example.test');
  await panel.getByRole('button',{name:'Confirm and save profile'}).click();
  await expect(panel.getByRole('button',{name:'Confirm and save profile'})).toBeEnabled();
  await panel.getByRole('button',{name:'Roll back imported value'}).filter({visible:true}).last().click();
  await expect(panel.getByRole('alert')).toContainText('newer edits');
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('later@example.test');
});

test('structured employment and education retain dates and original grade scale',async()=>{
  await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await panel.getByLabel('Employer',{exact:true}).fill('Synthetic Co');
  await panel.getByLabel('Job title',{exact:true}).fill('Developer');
  await panel.getByLabel('Start date (YYYY or YYYY-MM)',{exact:true}).fill('2024');
  await panel.getByLabel('End date (blank if current)',{exact:true}).fill('2025');
  await panel.getByRole('button',{name:'Confirm career record'}).click();
  await expect(panel.getByText('Month-level dates are needed; year-only dates remain ambiguous.')).toBeVisible();
  await panel.getByLabel('Career section').selectOption('education');
  await panel.getByLabel('Institution',{exact:true}).fill('Synthetic University');
  await panel.getByLabel('Degree',{exact:true}).fill('BSc');
  await panel.getByLabel('Original grade',{exact:true}).fill('8.2');
  await panel.getByRole('button',{name:'Confirm career record'}).click();
  await expect(panel.getByRole('alert')).toContainText('original grade scale');
  await panel.getByLabel('Original grade scale',{exact:true}).fill('10-point CGPA');
  await panel.getByRole('button',{name:'Confirm career record'}).click();
  await expect(panel.locator('.evidence').filter({hasText:'Synthetic University'})).toContainText('10-point CGPA');
});

test('receipts distinguish preparation from user-reported submission and do not submit',async()=>{
  await profile();await inspect();await fill();
  await panel.getByRole('button',{name:'Save preparation receipt'}).click();
  await expect(panel.locator('summary').filter({hasText:'prepared'})).toBeVisible();
  await panel.getByRole('button',{name:'I submitted on the website'}).click();
  await expect(panel.locator('summary').filter({hasText:'user-reported-submitted'})).toBeVisible();
  expect(job.url()).toBe(`${base}/`);await expect(job.locator('#status')).toHaveText('');
});

for(const format of ['pdf','docx'] as const)test(`generates a reviewed ${format.toUpperCase()} derivative, reparses it and preserves the original`,async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:syntheticPdf()});
  await panel.getByRole('button',{name:'Prepare text changes'}).click();
  await panel.locator('summary').filter({hasText:'Block 1'}).click();
  await expect(panel.getByRole('button',{name:'Generate and verify derivative'})).toBeDisabled();
  await panel.getByLabel('I checked this wording and confirm all claims are true').check();
  await panel.getByLabel('Export format').selectOption(format);
  await panel.getByRole('button',{name:'Generate and verify derivative'}).click();
  await expect(panel.getByText('Generated text reparsed successfully and matches the approved text.')).toBeVisible({timeout:20000});
  const download=panel.waitForEvent('download');await panel.getByRole('button',{name:'Download derivative for visual review'}).click();
  const file=await download;await file.saveAs(path.resolve(`test-results/generated-resume.${format}`));
  if(format==='pdf'){
    await expect(panel.getByRole('img',{name:'Generated resume page 1'})).toBeVisible();
    const image=panel.getByRole('img',{name:'Generated resume page 1'});const src=await image.getAttribute('src');
    await writeFile('test-results/generated-resume-preview.png',Buffer.from(src!.split(',')[1]!,'base64'));
    expect(await image.evaluate((img:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(img,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!<100&&pixels[i+3]!>0)dark++;return dark;})).toBeGreaterThan(100);
  }
  await panel.getByLabel('I reviewed every page for missing text, clipping, glyphs and correct facts').check();
  await panel.getByRole('button',{name:'Save reviewed derivative'}).click();
  await panel.getByRole('button',{name:'Select this derivative'}).click();
  await expect(panel.locator('.file-info strong')).toHaveText('original.pdf');
  await expect(panel.getByRole('heading',{name:'Exact file selected for manual upload'}).locator('xpath=following-sibling::p[1]')).toHaveText(`applypilot-reviewed-resume.${format}`);
  const selected=panel.waitForEvent('download');await panel.getByRole('button',{name:'Download selected resume'}).click();expect((await selected).suggestedFilename()).toBe(`applypilot-reviewed-resume.${format}`);
  await panel.getByRole('button',{name:'Use original resume'}).click();
  const original=panel.waitForEvent('download');await panel.getByRole('button',{name:'Download selected resume'}).click();const originalDownload=await original;expect(await readFile((await originalDownload.path())!)).toEqual(syntheticPdf());
});

test('new unsupported metrics are withheld before document export',async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:syntheticPdf()});
  await panel.getByRole('button',{name:'Prepare text changes'}).click();await panel.locator('summary').filter({hasText:'Block 1'}).click();
  await panel.getByLabel('Proposed wording').fill('Alex Rivera improved revenue by 500 percent.');
  await panel.getByLabel('I checked this wording and confirm all claims are true').check();
  await panel.getByRole('button',{name:'Generate and verify derivative'}).click();
  await expect(panel.getByRole('alert')).toContainText('number or date');await expect(panel.getByRole('button',{name:'Save reviewed derivative'})).toHaveCount(0);
});

test('resume evidence score requires exact selected-resume evidence and resets on job changes',async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:syntheticPdf()});
  await panel.getByLabel('Job description',{exact:true}).fill('TypeScript inventory project');await panel.getByRole('button',{name:'Save job description'}).click();
  await panel.getByRole('button',{name:'Extract requirements for review'}).click();await panel.locator('summary').filter({hasText:'TypeScript inventory project'}).click();
  await panel.getByLabel('Resume evidence status').selectOption('supported');await panel.getByLabel('Exact resume excerpt').fill('Invented skill');
  await panel.getByRole('button',{name:'Confirm evidence and calculate'}).click();await expect(panel.getByRole('alert')).toContainText('selected resume');
  await panel.getByLabel('Exact resume excerpt').fill('TypeScript inventory project');await panel.getByRole('button',{name:'Confirm evidence and calculate'}).click();
  await expect(panel.getByRole('heading',{name:'100/100 resume evidence match'})).toBeVisible();
  await panel.getByLabel('Job description',{exact:true}).fill('Different requirement');await panel.getByRole('button',{name:'Save job description'}).click();
  await expect(panel.getByRole('heading',{name:'100/100 resume evidence match'})).toHaveCount(0);
});

test('unassessed requirements show coverage without an invented score',async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'original.pdf',mimeType:'application/pdf',buffer:syntheticPdf()});
  await panel.getByLabel('Job description',{exact:true}).fill('TypeScript inventory project\nProfessional writing');await panel.getByRole('button',{name:'Save job description'}).click();
  await panel.getByRole('button',{name:'Extract requirements for review'}).click();await panel.getByRole('button',{name:'Confirm evidence and calculate'}).click();
  await expect(panel.getByRole('heading',{name:'Insufficient assessed coverage'})).toBeVisible();await expect(panel.getByText('0% weighted coverage',{exact:false})).toBeVisible();
});

test('saved answers reuse only the confirmed employer and exact question',async()=>{
  await job.goto(`${base}/?step=2`);await profile();await inspect();await fill();
  for(const [label,value] of [['Job company','Acme'],['Job role','Engineer'],['Job country','India']])await panel.getByLabel(label!,{exact:true}).fill(value!);
  await panel.getByRole('button',{name:'Confirm this job'}).click();await inspect();
  // Select the fixture's narrative question by its textarea rather than guessing an ATS selector.
  const narrative=panel.locator('.decision').filter({has:panel.locator('textarea')}).first();
  await narrative.locator('textarea').fill('I built a TypeScript inventory project.');
  await narrative.getByLabel('Remember for this confirmed job context').check();await narrative.getByRole('button',{name:'Approve for this page'}).click();await fill();
  await job.locator('textarea').first().fill('');await inspect();await fill();await expect(job.locator('textarea').first()).toHaveValue('I built a TypeScript inventory project.');
  await job.locator('textarea').first().fill('');await panel.getByLabel('Job company',{exact:true}).fill('Other employer');await panel.getByRole('button',{name:'Confirm this job'}).click();await inspect();await fill();await expect(job.locator('textarea').first()).toHaveValue('');
});

test('provider configuration requires consent and switching destinations clears entered keys',async()=>{
  const requests:string[]=[];panel.on('request',request=>{if(request.url().startsWith('https:'))requests.push(request.url());});
  await panel.getByRole('button',{name:'Settings',exact:true}).click();await panel.getByLabel('Model ID',{exact:true}).fill('synthetic-model');await panel.getByLabel('API key',{exact:true}).fill('synthetic-secret');
  await expect(panel.getByRole('button',{name:'Save provider configuration'})).toBeDisabled();await panel.getByLabel('Provider',{exact:true}).selectOption('openai');await expect(panel.getByLabel('API key',{exact:true})).toHaveValue('');await expect(panel.getByRole('button',{name:'Test connection (uses API)'})).toBeDisabled();expect(requests).toEqual([]);
});
test('ending an empty session clears unsaved provider and profile text from the panel',async()=>{
  await panel.getByRole('button',{name:'Profile',exact:true}).click();await panel.getByLabel('Profile text',{exact:true}).fill('Unsaved private fixture text');
  await panel.getByRole('button',{name:'Settings',exact:true}).click();await panel.getByLabel('API key',{exact:true}).fill('unsaved-synthetic-key');
  await panel.getByRole('button',{name:'End session & delete local data'}).click();await expect(panel.getByText('Session ended. Usable local data and keys removed.')).toBeVisible();await expect(panel.getByLabel('API key',{exact:true})).toHaveValue('');
  await panel.getByRole('button',{name:'Profile',exact:true}).click();await expect(panel.getByLabel('Profile text',{exact:true})).toHaveValue('');
});

async function resumeForUpload(){
  await job.goto(`${base}/?step=2`);await panel.getByRole('button',{name:'Resume',exact:true}).click();await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'selected.pdf',mimeType:'application/pdf',buffer:syntheticPdf()});
  await expect(panel.locator('.file-info strong')).toHaveText('selected.pdf');await panel.getByRole('button',{name:'Apply',exact:true}).click();await inspect();
}
test('explicit native resume attachment transfers exact bytes without claiming server acceptance',async()=>{
  await resumeForUpload();await expect(job.locator('#resume')).toHaveJSProperty('value','');
  await panel.getByRole('button',{name:'Attach selected resume to this input'}).click();
  await expect(job.locator('#upload-status')).toHaveText('File received by synthetic fixture');
  await expect(panel.getByText('selected.pdf: attached-unverified. Server processing not verified.')).toBeVisible();
  const bytes=await job.locator('#resume').evaluate(async(el:HTMLInputElement)=>Array.from(new Uint8Array(await el.files![0]!.arrayBuffer())));expect(Buffer.from(bytes)).toEqual(syntheticPdf());
  await expect(panel.getByRole('button',{name:'Attach selected resume to this input'})).toBeDisabled();expect(job.url()).toBe(`${base}/?step=2`);
});
test('existing attachment is preserved and cannot be overwritten',async()=>{
  await resumeForUpload();await job.locator('#resume').setInputFiles({name:'user-original.pdf',mimeType:'application/pdf',buffer:syntheticPdf('Existing user file with original content')});await inspect();
  await expect(panel.getByRole('button',{name:'Attach selected resume to this input'})).toBeDisabled();expect(await job.locator('#resume').evaluate((el:HTMLInputElement)=>el.files![0]!.name)).toBe('user-original.pdf');
});
test('upload format restrictions disable incompatible attachment',async()=>{
  await resumeForUpload();await job.locator('#resume').evaluate(el=>el.setAttribute('accept','.docx'));await inspect();await expect(panel.getByRole('button',{name:'Attach selected resume to this input'})).toBeDisabled();await expect(job.locator('#resume')).toHaveJSProperty('value','');
});
test('a rejected attachment becomes uncertain and is never automatically retried',async()=>{
  await resumeForUpload();await job.locator('#resume').evaluate(el=>el.addEventListener('change',()=>{(el as HTMLInputElement).value='';}));
  await panel.getByRole('button',{name:'Attach selected resume to this input'}).click();await expect(panel.getByText('selected.pdf: uncertain. Server processing not verified.')).toBeVisible();await inspect();await expect(panel.getByRole('button',{name:'Attach selected resume to this input'})).toBeDisabled();
});
test('unsupported PDF glyphs fail explicitly while the original remains available',async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'unicode.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:syntheticDocx('Alex Rivera नमस्ते TypeScript inventory project')});
  await panel.getByRole('button',{name:'Prepare text changes'}).click();await panel.locator('summary').filter({hasText:'Block 1'}).click();await panel.getByLabel('I checked this wording and confirm all claims are true').check();await panel.getByRole('button',{name:'Generate and verify derivative'}).click();await expect(panel.getByRole('alert')).toContainText('cannot render');await expect(panel.locator('.file-info strong')).toHaveText('unicode.docx');
});
test('unbroken content too wide for the PDF template is withheld',async()=>{
  await panel.getByRole('button',{name:'Resume',exact:true}).click();await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'long.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:syntheticDocx('Alex '+ 'unbroken'.repeat(100))});
  await panel.getByRole('button',{name:'Prepare text changes'}).click();await panel.locator('summary').filter({hasText:'Block 1'}).click();await panel.getByLabel('I checked this wording and confirm all claims are true').check();await panel.getByRole('button',{name:'Generate and verify derivative'}).click();await expect(panel.getByRole('alert')).toContainText('too wide');
});
test('reviewing all new views has no automated axe violations',async()=>{
  for(const view of ['Profile','Resume','Settings']){await panel.getByRole('button',{name:view,exact:true}).click();expect((await new AxeBuilder({page:panel}).analyze()).violations).toEqual([]);}
});

test('damaged saved data offers recovery without silently resetting the vault',async()=>{
  await profile();await enableVault();
  await worker.evaluate(async()=>{
    await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('applypilot-session-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');const get=store.get('vault-state');get.onsuccess=()=>{const record=get.result as {data:ArrayBuffer};const bytes=new Uint8Array(record.data);bytes[0]=bytes[0]!^1;store.put({...get.result,data:bytes.buffer});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  });
  await panel.reload();await expect(panel.getByRole('alert')).toContainText('No records were reset');
  await expect(panel.getByRole('button',{name:'Export encrypted backup'})).toBeVisible();
  const exported=panel.waitForEvent('download');await panel.getByRole('button',{name:'Export encrypted backup'}).click();expect((await exported).suggestedFilename()).toBe('applypilot-encrypted-backup.json');
  await panel.getByText('Delete all local data',{exact:true}).click();await panel.getByLabel('Type DELETE',{exact:true}).fill('DELETE');await panel.getByRole('button',{name:'Delete all ApplyPilot data'}).click();await expect(panel.getByRole('button',{name:'Profile',exact:true})).toBeVisible();
});

test('long generated resume paginates and each preview contains readable text',async()=>{
  const paragraphs=['Alex Rivera','alex@example.test','Experience',...Array.from({length:12},(_,i)=>`Project ${i+1}. `+'Built and tested accessible TypeScript tools with the team. '.repeat(12)),'Education','Synthetic University BSc 2024'];
  await panel.getByRole('button',{name:'Resume',exact:true}).click();await panel.getByLabel('Choose PDF or DOCX').setInputFiles({name:'long-resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:syntheticDocx(paragraphs.join('\n'))});await panel.getByRole('button',{name:'Prepare text changes'}).click();
  const blocks=panel.locator('details').filter({has:panel.locator('summary').filter({hasText:/^Block /})});
  for(let i=0;i<await blocks.count();i++){await blocks.nth(i).locator('summary').click();await blocks.nth(i).getByLabel('I checked this wording and confirm all claims are true').check();await blocks.nth(i).locator('summary').click();}
  await panel.getByRole('button',{name:'Generate and verify derivative'}).click();await expect(panel.getByText('Generated text reparsed successfully and matches the approved text.')).toBeVisible({timeout:20000});
  const pages=panel.getByRole('img',{name:/Generated resume page/});expect(await pages.count()).toBeGreaterThan(1);
  for(let i=0;i<await pages.count();i++){const src=await pages.nth(i).getAttribute('src');await writeFile(`test-results/long-resume-page-${i+1}.png`,Buffer.from(src!.split(',')[1]!,'base64'));}
  const downloaded=panel.waitForEvent('download');await panel.getByRole('button',{name:'Download derivative for visual review'}).click();await(await downloaded).saveAs(path.resolve('test-results/long-resume.pdf'));
});

async function profile() {
  await panel.getByRole('button',{ name:'Profile', exact:true }).click();
  await panel.getByLabel('First name',{ exact:true }).fill('Alex');
  await panel.getByLabel('Last name',{ exact:true }).fill('Rivera');
  await panel.getByLabel('Email',{ exact:true }).fill('alex@example.test');
  await panel.getByLabel('Phone',{ exact:true }).fill('+1 555 0100');
  await panel.getByLabel('Country',{ exact:true }).fill('India');
  await panel.getByLabel('City',{ exact:true }).fill('Bengaluru');
  await panel.getByRole('button',{ name:'Confirm and save profile' }).click();
  await expect(panel.getByRole('button',{ name:'Confirm and save profile' })).toBeEnabled();
  await panel.getByRole('button',{ name:'Apply', exact:true }).click();
}
async function inspect() {
  await job.bringToFront();
  const button=panel.getByRole('button',{ name:/Inspect current (page|step)/ });
  await button.click();
  await expect(panel.getByRole('button',{ name:'Help me apply' })).toBeVisible();
  await expect(panel.getByRole('button',{ name:'Help me apply' })).toBeEnabled();
}
async function fill() {
  await panel.getByRole('button',{ name:'Help me apply' }).click();
  await expect(panel.getByRole('button',{ name:'Help me apply' })).toBeEnabled({ timeout:20000 });
}

test('installation, inspection without mutation, native and dependent writes, and no navigation', async () => {
  const errors:string[]=[]; panel.on('pageerror',e=>errors.push(e.message));
  await profile(); await inspect();
  await expect(job.locator('#first')).toHaveValue('');
  await fill();
  await expect(job.locator('#first')).toHaveValue('Alex');
  await expect(job.locator('#last')).toHaveValue('Rivera');
  await expect(job.locator('#email')).toHaveValue('alex@example.test');
  await expect(job.locator('#country')).toHaveValue('in');
  await expect(job.locator('#city')).toHaveValue('Bengaluru');
  await expect(job.locator('#trap')).toHaveValue('');
  await expect(job.locator('#hidden')).toHaveValue('');
  await expect(job.locator('#password')).toHaveValue('');
  await expect(job.locator('#otp')).toHaveValue('');
  expect(job.url()).toBe(`${base}/`);
  await expect(panel.locator('.metrics > div').filter({ hasText:'verified writes' }).locator('strong')).toHaveText('6');
  expect(errors).toEqual([]);
  await panel.evaluate(()=>window.scrollTo(0,0));
  await panel.screenshot({ path:'test-results/applypilot-application.png' });
});

test('preserves pre-existing values and safely undoes an unchanged verified field', async () => {
  await job.goto(`${base}/?scenario=existing`); await profile(); await inspect(); await fill();
  await expect(job.locator('#first')).toHaveValue('User original');
  await panel.getByRole('listitem').filter({ hasText:'Last name' }).getByRole('button',{ name:'Undo' }).click();
  await expect(job.locator('#last')).toHaveValue('');
  await job.locator('#email').fill('newer@example.test');
  await panel.getByRole('listitem').filter({ hasText:'Email' }).getByRole('button',{ name:'Undo' }).click();
  await expect(panel.getByRole('alert')).toContainText('newer edit was preserved');
  await expect(job.locator('#email')).toHaveValue('newer@example.test');
});

for (const scenario of ['reject','user-edit','rerender','validation']) {
  test(`pauses when ${scenario} prevents a verified write`, async () => {
    await job.goto(`${base}/?scenario=${scenario}`); await profile(); await inspect(); await fill();
    await expect(panel.getByText('This field could not be verified. Check it on the website, then inspect again.')).toBeVisible();
    expect(job.url()).toContain(scenario);
    if(scenario==='user-edit') await expect(job.locator('#first')).toHaveValue('User correction');
  });
}

test('duplicate labels abstain and hostile job content cannot grant authority', async () => {
  await job.goto(`${base}/?scenario=duplicate`); await profile(); await inspect(); await fill();
  await expect(job.locator('#first')).toHaveValue('');
  await expect(job.locator('#duplicate')).toHaveValue('');
  await job.goto(`${base}/?scenario=malicious`); await inspect(); await fill();
  expect(await job.evaluate(()=> (window as unknown as { submissions:number }).submissions)).toBe(0);
  await expect(job.locator('#first')).toHaveValue('Alex');
});

test('manual multipage flow fills scoped answers and never activates a disguised terminal control', async () => {
  await profile(); await inspect(); await fill();
  await job.getByRole('button',{ name:'Continue', exact:true }).click();
  await inspect();
  await panel.getByLabel('Answer for Why does your experience fit this role?').fill('I built a TypeScript inventory project.');
  await panel.locator('article').filter({ has: panel.getByRole('heading',{ name:'Why does your experience fit this role? *' }) }).getByRole('button',{ name:'Approve for this page' }).click();
  await expect(panel.getByRole('button',{ name:'Help me apply' })).toBeEnabled();
  await panel.getByLabel('Answer for Will you require sponsorship?').selectOption('no');
  await panel.locator('article').filter({ has: panel.getByRole('heading',{ name:'Will you require sponsorship? *' }) }).getByRole('button',{ name:'Approve for this page' }).click();
  await fill();
  await expect(job.locator('#narrative')).toHaveValue('I built a TypeScript inventory project.');
  await expect(job.locator('#sponsorship')).toHaveValue('no');
  await job.locator('#resume').setInputFiles({ name:'synthetic.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4 synthetic fixture upload only') });
  await expect(job.locator('#upload-status')).toHaveText('File received by synthetic fixture');
  await job.getByRole('button',{ name:'Continue to review' }).click();
  await inspect(); await fill();
  await expect(job.locator('#attest')).not.toBeChecked();
  expect(await job.evaluate(()=> (window as unknown as { submissions:number }).submissions)).toBe(0);
});

test('pause, panel reopen and wrong-tab binding require fresh inspection', async () => {
  await profile(); await inspect();
  await panel.getByRole('button',{ name:'Help me apply' }).click();
  await panel.getByRole('button',{ name:'Pause', exact:true }).click();
  await expect(panel.getByText('Paused. Existing entries are preserved. Inspect again to resume.')).toBeVisible();
  await panel.close();
  panel=await context.newPage(); await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`); await job.bringToFront();
  await expect(panel.getByText('Product Engineer',{ exact:true })).toBeVisible();
  await panel.getByRole('button',{ name:'Profile',exact:true }).click(); await expect(panel.getByLabel('First name',{ exact:true })).toHaveValue('Alex');
  await panel.getByRole('button',{ name:'Apply',exact:true }).click();
  const other=await context.newPage(); await other.goto(`${base}/?scenario=existing`); await other.bringToFront();
  await panel.getByRole('button',{ name:'Help me apply' }).click();
  await expect(panel.getByRole('alert')).toContainText('target tab or page has changed');
  await expect(other.locator('#last')).toHaveValue(''); await other.close(); await job.bringToFront();
});

test('unsupported controls produce handoffs and core panel passes axe', async () => {
  await job.goto(`${base}/?scenario=unsupported`); await profile(); await inspect();
  await expect(panel.getByText('A custom dropdown needs manual selection.')).toBeVisible();
  const results=await new AxeBuilder({ page:panel }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('native setters update real React controlled state and survive rerender', async () => {
  await job.goto(`${base}/?scenario=controlled`);
  await expect(job.getByRole('heading',{ name:'React controlled form' })).toBeVisible();
  await profile(); await inspect(); await fill();
  await expect(job.locator('#react-state')).toHaveText('Alex / alex@example.test');
  await job.getByRole('button',{ name:'Rerender 0' }).click();
  await expect(job.locator('#controlled-first')).toHaveValue('Alex');
  await expect(job.locator('#controlled-email')).toHaveValue('alex@example.test');
});

for (const format of ['pdf','docx']) {
  test(`parses a local ${format.toUpperCase()} with bundled workers and reviews import without overwriting`,async()=>{
    await profile();
    await panel.getByRole('button',{ name:'Resume',exact:true }).click();
    const network:string[]=[];panel.on('request',req=>{if(/^https?:/.test(req.url()))network.push(req.url());});
    await panel.getByLabel('Choose PDF or DOCX').setInputFiles({ name:`synthetic.${format}`,mimeType:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:format==='pdf'?syntheticPdf():syntheticDocx() });
    await expect(panel.locator('.file-info strong')).toHaveText(`synthetic.${format}`,{ timeout:15000 });
    await panel.getByText('Review extracted text',{ exact:true }).click();
    await expect(panel.locator('pre')).toContainText('TypeScript inventory project');
    expect(network).toEqual([]);
    await panel.getByRole('button',{ name:'Profile',exact:true }).click();
    await expect(panel.getByLabel('Email',{ exact:true })).toHaveValue('alex@example.test');
    await expect(panel.getByRole('heading',{ name:'Review imported details' })).toBeVisible();
    await panel.getByRole('button',{ name:'Confirm imported value',exact:true }).click();
    await expect(panel.getByRole('heading',{ name:'Review imported details' })).toHaveCount(0);
  });
}

test('corrupt or image-only documents fail explicitly without a false imported state',async()=>{
  await panel.getByRole('button',{ name:'Resume',exact:true }).click();
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({ name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('This is not a PDF document') });
  await expect(panel.getByRole('alert')).toContainText('File signature does not match');
  await panel.getByLabel('Choose PDF or DOCX').setInputFiles({ name:'empty.pdf',mimeType:'application/pdf',buffer:syntheticPdf('') });
  await expect(panel.getByRole('alert')).toContainText('No usable resume text');
});

test('stale options invalidate approved answers before a write',async()=>{
  await job.goto(`${base}/?step=2`); await inspect();
  await panel.getByLabel('Answer for Will you require sponsorship?').selectOption('no');
  await panel.locator('article').filter({ has:panel.getByRole('heading',{ name:'Will you require sponsorship? *' }) }).getByRole('button',{ name:'Approve for this page' }).click();
  await job.locator('#sponsorship option[value="no"]').evaluate(el=>{ el.textContent='No, I cannot work here'; });
  await fill();
  await expect(job.locator('#sponsorship')).toHaveValue('');
});

test('section context prevents another person or legal status receiving contact facts',async()=>{
  await job.goto(`${base}/?scenario=context`);await profile();await inspect();await fill();
  await expect(job.locator('#other-name')).toHaveValue('');
  await expect(job.locator('#legal-country')).toHaveValue('');
  await expect(panel.getByRole('heading',{name:'Emergency contact — First name'})).toBeVisible();
  await expect(panel.getByRole('heading',{name:'Citizenship — Country'})).toBeVisible();
});

test('page content scripts cannot read trusted session keys or authorize UI commands',async()=>{
  await profile(); await inspect();
  const result = await worker.evaluate(async()=>{
    const [tab]=await chrome.tabs.query({ active:true,lastFocusedWindow:true });
    const [result]=await chrome.scripting.executeScript({target:{tabId:tab!.id!},func:async()=>{
      let exposed=false;
      try { const data=await chrome.storage.session.get(null);exposed=!!data.encryptionKey; }catch{/* denied as expected */}
      const result=await chrome.runtime.sendMessage({schema:1,requestId:crypto.randomUUID(),expectedRevision:0,command:{type:'END'}});
      return { exposed,ok:result.ok,error:result.error };
    }});
    return result!.result;
  });
  expect(result?.exposed).toBe(false);expect(result?.ok).toBe(false);expect(result?.error).toContain('Only the ApplyPilot panel');
  await panel.getByRole('button',{ name:'Profile',exact:true }).click();await expect(panel.getByLabel('First name',{exact:true})).toHaveValue('Alex');
});

test('service-worker termination retains the profile and requires reconciliation',async()=>{
  await profile(); await inspect();
  const devtools=await context.newCDPSession(panel);await devtools.send('ServiceWorker.enable');
  await panel.getByRole('button',{name:'Help me apply'}).click();
  await expect(job.locator('#first')).toHaveValue('Alex');
  await devtools.send('ServiceWorker.stopAllWorkers');
  await expect(panel.getByRole('button',{ name:'Help me apply' })).toBeEnabled({ timeout:15000 });
  await panel.getByRole('button',{ name:'Profile',exact:true }).click();await expect(panel.getByLabel('First name',{exact:true})).toHaveValue('Alex');
  await panel.getByRole('button',{ name:'Apply',exact:true }).click();await inspect();await fill();
  await expect(job.locator('#first')).toHaveValue('Alex');
  await expect(job.locator('#last')).toHaveValue('Rivera');
  await devtools.detach();
  worker=context.serviceWorkers().find(w=>w.url().includes(extensionId)) ?? await context.waitForEvent('serviceworker');
});

test('browser restart clears session secrets and cannot decrypt prior profile records',async()=>{
  await profile(); await inspect();
  await context.close();
  await launch();
  job=await context.newPage();await job.goto(base);
  panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading',{name:'Start with an open job page'})).toBeVisible();
  await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(panel.getByLabel('First name',{exact:true})).toHaveValue('');
  await expect(panel.getByLabel('Email',{exact:true})).toHaveValue('');
});

test('extension reload loses session-only data while worker termination alone does not',async()=>{
  await profile();
  const oldWorker=worker;
  await worker.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),20);});
  await expect.poll(()=>context.serviceWorkers().includes(oldWorker)).toBe(false);
  panel=await context.newPage();
  // Unpacked extension pages are temporarily blocked while Chrome reloads the manifest.
  try { await expect.poll(async()=>{
    try { await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`,{timeout:2000});return true; }
    catch { return false; }
  },{timeout:10000,intervals:[100,250,500,1000]}).toBe(true); }
  catch(error) {
    await panel.goto('chrome://extensions');
    console.log('Reload diagnostic:',await panel.locator('extensions-item').allTextContents());
    await panel.screenshot({path:'test-results/reload-diagnostic.png'});
    throw error;
  }
  worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await expect(panel.getByRole('heading',{name:'Start with an open job page'})).toBeVisible();
  await panel.getByRole('button',{name:'Profile',exact:true}).click();
  await expect(panel.getByLabel('First name',{exact:true})).toHaveValue('');
});
