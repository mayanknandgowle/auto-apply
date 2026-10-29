import type { Control } from '../core/model';
export function resumeUploadControl(control:Control) {
  return control.kind==='file' && /^(?:upload |attach |your |upload your |attach your )?(?:resume|cv|résumé)(?:\s*[/|]\s*(?:resume|cv|résumé))?\s*[*]?$/i.test(control.label.trim()) && !control.file?.multiple;
}
export function acceptsFile(accept:string,name:string,mime:string) {
  if(!accept.trim())return true;
  return accept.toLowerCase().split(',').map(s=>s.trim()).some(rule=>rule==='*/*'||rule===mime.toLowerCase()||(rule.startsWith('.')&&name.toLowerCase().endsWith(rule))||(rule.endsWith('/*')&&mime.toLowerCase().startsWith(rule.slice(0,-1))));
}
