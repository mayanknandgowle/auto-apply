import type { State, UiCommand } from '../core/model';
import type { AiTask } from '../providers/gemini';
export type BackupPreview = { hash: string; name: string; contactFacts: number; careerEntries: number; resume: string; answers: number; receipts: number };
export type Reply = { ok: boolean; state: State; error?: string; task?: AiTask; backup?: string; preview?: BackupPreview; artifact?:NonNullable<State['resume']> };
export type PanelProps = { state: State; busy: boolean; raw: (command: UiCommand) => Promise<Reply>; perform: (fn: () => Promise<unknown>) => Promise<void> };
export function download(name: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
