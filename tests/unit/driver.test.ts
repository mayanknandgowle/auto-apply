// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormDriver } from '../../src/forms/driver';
import type { DriverCommand, Snapshot } from '../../src/core/model';

beforeEach(() => {
  document.body.innerHTML='<main><label>First name<input id="name"></label><label>Country<select id="country"><option value="">Choose</option><option value="in">India</option></select></label><button>Continue</button></main>';
  vi.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(()=>[{ width:100,height:30,right:100,bottom:30 }] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>({ width:100,height:30,right:100,bottom:30 }) as DOMRect);
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
});
async function setup() {
  const driver=new FormDriver(); const snapshot=driver.inspect(); const sessionId=crypto.randomUUID();
  await driver.handle({ type:'BIND',sessionId,generation:1,documentToken:snapshot.documentToken });
  return { driver,snapshot,sessionId };
}
function command(snapshot:Snapshot,sessionId:string): Extract<DriverCommand,{ type:'WRITE' }> {
  const control=snapshot.controls[0]!;
  return { type:'WRITE',actionId:crypto.randomUUID(),sessionId,generation:1,documentToken:snapshot.documentToken,snapshotId:snapshot.snapshotId,controlId:control.id,fingerprint:control.fingerprint,before:'',value:'Alex',expiresAt:Date.now()+2000,undo:false };
}
describe('bounded page driver',()=>{
  it('extracts nested labels without option text', async()=>{
    const { snapshot }=await setup();
    expect(snapshot.controls.map(c=>c.label)).toEqual(['First name','Country']);
    expect(snapshot.controls[1]!.options).toEqual([{ label:'Choose',value:'' },{ label:'India',value:'in' }]);
  });
  it('preserves disqualifying section context instead of mapping another person or legal country to the candidate',async()=>{
    document.body.innerHTML='<main><fieldset><legend>Emergency contact</legend><label>First name<input></label></fieldset><fieldset><legend>Citizenship</legend><label>Country<input></label></fieldset></main>';
    const { snapshot }=await setup();
    expect(snapshot.controls.map(c=>c.label)).toEqual(['Emergency contact — First name','Citizenship — Country']);
  });
  it('rejects stale labels without writing', async()=>{
    const { driver,snapshot,sessionId }=await setup();
    document.getElementById('name')!.setAttribute('aria-label','Emergency contact name');
    await expect(driver.handle(command(snapshot,sessionId))).rejects.toThrow('field changed');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });
  it('preserves newer user edits', async()=>{
    const { driver,snapshot,sessionId }=await setup(); (document.getElementById('name') as HTMLInputElement).value='Newer';
    await expect(driver.handle(command(snapshot,sessionId))).rejects.toThrow('preserved');
  });
  it.each(['expired','wrong-document','wrong-generation','wrong-session','stale-snapshot'])('rejects %s actions',async(reason)=>{
    const { driver,snapshot,sessionId }=await setup(); const action=command(snapshot,sessionId);
    if(reason==='expired') action.expiresAt=Date.now()-1;
    if(reason==='wrong-document') action.documentToken=crypto.randomUUID();
    if(reason==='wrong-generation') action.generation=2;
    if(reason==='wrong-session') action.sessionId=crypto.randomUUID();
    if(reason==='stale-snapshot') action.snapshotId=crypto.randomUUID();
    await expect(driver.handle(action)).rejects.toThrow('expired or the page changed');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });
  it('verifies an action and refuses replay',async()=>{
    const { driver,snapshot,sessionId }=await setup(); const action=command(snapshot,sessionId);
    expect(await driver.handle(action)).toEqual({ verified:true,value:'Alex' });
    await expect(driver.handle(action)).rejects.toThrow('expired');
  });
  it('pause invalidates an already prepared action',async()=>{
    const { driver,snapshot,sessionId }=await setup(); await driver.handle({ type:'PAUSE',generation:2 });
    await expect(driver.handle(command(snapshot,sessionId))).rejects.toThrow('expired');
  });
  it('cannot execute a terminal action under any button name',async()=>{
    const { driver }=await setup(); let clicked=0;
    document.querySelector('button')!.addEventListener('click',()=>clicked++);
    await expect(driver.handle({ type:'CLICK',selector:'button' })).rejects.toThrow();
    await expect(driver.handle({ type:'SUBMIT' })).rejects.toThrow(); expect(clicked).toBe(0);
  });
});
