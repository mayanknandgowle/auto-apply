import { z } from 'zod';
export const ResumeEdit = z.object({ id:z.string().uuid(), before:z.string().max(60000), after:z.string().max(60000), approved:z.boolean(), evidenceIds:z.array(z.string().uuid()).max(40) }).strict();
export type ResumeEdit = z.infer<typeof ResumeEdit>;
export const normalizeDocumentText = (text:string) => text.normalize('NFC').replace(/\s+/g,' ').trim();
export function proposeEdits(text:string):ResumeEdit[] {
  return text.split(/\n+/).filter(line=>line.trim()).slice(0,200).map(before=>({id:crypto.randomUUID(),before,after:before.trim().replace(/[\t ]+/g,' '),approved:false,evidenceIds:[]}));
}
export function approvedText(original:string, edits:ResumeEdit[], evidence:{id:string;text:string}[]) {
  if (normalizeDocumentText(edits.map(e=>e.before).join('\n'))!==normalizeDocumentText(original)) throw new Error('The original text changed or some blocks are missing. Prepare the review again.');
  const parts=edits.map(edit=>{
    if(!edit.approved)throw new Error('Review and approve every block before generating a derivative.');
    if(!edit.after.trim())throw new Error('Empty blocks are unsupported. Keep the original or review in an external editor.');
    const sources=edit.evidenceIds.map(id=>{const source=evidence.find(e=>e.id===id);if(!source)throw new Error('A supporting fact changed. Review again.');return source.text;});
    const supported=[edit.before,...sources].join('\n');
    const supportedNumbers=new Set(supported.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g)??[]);
    for(const number of edit.after.match(/\d+(?:[.,]\d+)*(?:%|\+)?/g)??[]) if(!supportedNumbers.has(number))throw new Error('A number or date has no cited source. Keep the original value or cite confirmed evidence.');
    const words=(text:string)=>text.toLowerCase().match(/[\p{L}\p{N}+#]+/gu)??[];
    const originalWords=new Set(words(edit.before));
    if(words(edit.after).some(word=>!originalWords.has(word))&&!sources.length)throw new Error('New wording needs confirmed supporting evidence. Cite a fact and review the claim, or keep the original wording.');
    return edit.after.trim();
  });
  const text=parts.join('\n\n');
  if(/\[(?:insert|add|your|metric|company)[^\]]*\]/i.test(text))throw new Error('Resolve unfinished placeholders before exporting.');
  if(text.length>60000||text.length<20)throw new Error('Approved text must contain 20–60,000 characters.');
  return text;
}
