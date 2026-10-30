import { describe,it,expect,vi,afterEach } from 'vitest';
import { providerRequest,providerUrl,runProviderDraft } from '../../src/providers/transport';
import type { AiTask } from '../../src/providers/gemini';
import { approvedText,proposeEdits } from '../../src/documents/edits';
const config={kind:'openai' as const,endpoint:'',model:'synthetic-model'};
afterEach(()=>vi.unstubAllGlobals());
describe('provider protocol boundaries',()=>{
  const task:AiTask={id:crypto.randomUUID(),controlId:'test',generation:1,profileRevision:1,documentToken:crypto.randomUUID(),snapshotId:crypto.randomUUID(),model:config.model,kind:config.kind,endpoint:'',question:'Why this role?',evidence:[],jobText:'Synthetic'};
  it('does not transmit when the key binding changes during permission verification',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    vi.stubGlobal('chrome',{storage:{session:{get:vi.fn().mockResolvedValueOnce({providerKey:'synthetic',providerBinding:JSON.stringify(config)}).mockResolvedValueOnce({providerKey:'new-synthetic',providerBinding:JSON.stringify(config)})}},permissions:{contains:vi.fn().mockResolvedValue(true)}});
    await expect(runProviderDraft(task,new AbortController().signal)).rejects.toThrow('configuration changed');expect(fetcher).not.toHaveBeenCalled();
  });
  it('revoked exact-origin permission and cancellation prevent dispatch',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const contains=vi.fn().mockResolvedValue(false);
    vi.stubGlobal('chrome',{storage:{session:{get:vi.fn().mockResolvedValue({providerKey:'synthetic',providerBinding:JSON.stringify(config)})}},permissions:{contains}});
    await expect(runProviderDraft(task,new AbortController().signal)).rejects.toThrow('revoked');
    expect(contains).toHaveBeenCalledWith({origins:['https://api.openai.com/*']});
    contains.mockResolvedValue(true);const controller=new AbortController();controller.abort();
    await expect(runProviderDraft(task,controller.signal)).rejects.toThrow('cancelled');expect(fetcher).not.toHaveBeenCalled();
  });
  it('OpenAI uses fixed Responses URL, bearer auth, strict JSON, no storage and no redirects',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"answer":"fixture"}'}]}]})));vi.stubGlobal('fetch',fetcher);
    expect(await providerRequest(config,'synthetic-key','fixture',new AbortController().signal)).toEqual({answer:'fixture'});
    const [url,options]=fetcher.mock.calls[0]!;expect(url).toBe('https://api.openai.com/v1/responses');expect(options.headers.Authorization).toBe('Bearer synthetic-key');expect(options.redirect).toBe('error');expect(options.credentials).toBe('omit');
    const body=JSON.parse(options.body);expect(body.store).toBe(false);expect(body.max_output_tokens).toBe(2000);expect(body.text.format.strict).toBe(true);expect(body.tools).toBeUndefined();
  });
  for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}])it(`rejects ${response.status} or refused output`,async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(response))));await expect(providerRequest(config,'key','fixture',new AbortController().signal)).rejects.toThrow();
  });
  it('never follows compatible endpoints from response data or retries errors',async()=>{
    const custom={kind:'compatible' as const,endpoint:'https://api.example.com/v1/chat/completions',model:'provider/model'};
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:429}));vi.stubGlobal('fetch',fetcher);
    await expect(providerRequest(custom,'key','fixture',new AbortController().signal)).rejects.toThrow('quota');expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0]![0]).toBe(custom.endpoint);
  });
  for(const endpoint of ['http://api.example.com/v1/chat/completions','https://localhost/v1/chat/completions','https://127.0.0.1/v1/chat/completions','https://user:pass@api.example.com/v1/chat/completions','https://api.example.com/v1/chat/completions?key=x','https://api.example.com/other','https://api.local/v1/chat/completions'])it(`rejects unsafe custom destination ${endpoint}`,()=>{
    expect(()=>providerUrl({kind:'compatible',endpoint})).toThrow();
  });
  it('compatible provider parses completed JSON only',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"answer":"fixture"}'}}]}))));
    expect(await providerRequest({kind:'compatible',endpoint:'https://api.example.com/v1/chat/completions',model:'test'},'key','fixture',new AbortController().signal)).toEqual({answer:'fixture'});
  });
  it('bounds streamed provider responses',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('x'.repeat(100001))));await expect(providerRequest(config,'key','fixture',new AbortController().signal)).rejects.toThrow('limit');
  });
});
describe('approved resume changes',()=>{
  const original='Alex Rivera\nBuilt a TypeScript tool in 2024.';
  it('requires all blocks and individual approvals',()=>{
    const edits=proposeEdits(original);expect(()=>approvedText(original,edits,[])).toThrow('approve');
    edits.forEach(e=>e.approved=true);expect(approvedText(original,edits,[])).toContain('2024');expect(()=>approvedText(original,edits.slice(1),[])).toThrow('missing');
  });
  it('rejects unsupported numbers and unresolved placeholders',()=>{
    const edits=proposeEdits(original).map(e=>({...e,approved:true}));edits[1]!.after='Built 50 tools in 2024.';
    expect(()=>approvedText(original,edits,[])).toThrow('number or date');
    const id=crypto.randomUUID();edits[1]!.evidenceIds=[id];expect(approvedText(original,edits,[{id,text:'Built 50 tools.'}])).toContain('50');
    edits[1]!.after='Built [insert metric] tools.';expect(()=>approvedText(original,edits,[{id,text:'Built 50 tools.'}])).toThrow('placeholders');
  });
  it('cannot support 20 with 2024 or silently add an uncited skill',()=>{
    const edits=proposeEdits(original).map(e=>({...e,approved:true}));
    edits[1]!.after='Built 20 tools.';expect(()=>approvedText(original,edits,[])).toThrow('number or date');
    edits[1]!.after='Built a Rust tool in 2024.';expect(()=>approvedText(original,edits,[])).toThrow('supporting evidence');
  });
});
