export interface Meeting {
  id: string; title: string; recordedAt: string; durationS: number | null; status: string;
  progress: number; error: string | null; transcribeSeconds: number | null; chunkCount: number;
  createdAt: string; updatedAt: string; summaryStatus: string; summaryError: string | null;
}
export interface Segment { seq: number; startMs: number; endMs: number; text: string }
export interface SummaryItem { text: string; sources: number[] }
export interface ActionItem { task: string; responsible: string | null; dueDate: string | null; sources: number[] }
export interface SummaryDocument { overview: string; topics: SummaryItem[]; decisions: SummaryItem[]; actions: ActionItem[] }
export interface MeetingDetail {
  meeting: Meeting; segments: Segment[];
  summary: { document: SummaryDocument; model: string; generatedAt: string } | null;
}
export interface Settings { ollamaModel: string; cpuThreads: number; contextTokens: number; autoSummarize: boolean }
export interface State { meetings: Meeting[]; recordingId: string | null; settings: Settings; dataDirectory: string; hasWhisper: boolean; preparing: boolean }
export interface Results {
  state: State; detail: MeetingDetail; start: Meeting; stop: null; process: null; retry: null;
  summary: null; cancel: null; delete: null; playback: string; markdown: string;
  settings: null; prepare: null; cancelPreparation: null; import: number; shutdown: null;
  appendAudio: null; abortRecording: null;
}
export interface Params {
  state: undefined; detail: { id: string }; start: { title: string }; stop: undefined;
  process: { id: string }; retry: { id: string }; summary: { id: string }; cancel: { id: string };
  delete: { id: string }; playback: { id: string }; markdown: { id: string; summary: boolean };
  settings: Settings; prepare: { summary: boolean; ollamaModel: string }; cancelPreparation: undefined;
  import: { path: string }; shutdown: undefined;
  appendAudio: { id: string; seq: number; data: ArrayBuffer };
  abortRecording: { id: string; error: string };
}
export type Method = keyof Results;
export type CoreEvent = { event: 'changed' } | { event: 'preparation'; message: string } | { event: 'fatal'; message: string };
export interface DesktopAPI {
  call<K extends Method>(method: K, params: Params[K]): Promise<Results[K]>;
  subscribe(listener: (event: CoreEvent) => void): () => void;
  playback(id: string): Promise<string>;
  importDatabase(): Promise<number | null>;
  exportMarkdown(id: string, summary: boolean): Promise<boolean>;
  copyMarkdown(id: string, summary: boolean): Promise<void>;
  installOllama(): Promise<void>;
  onCaptureStop(listener: () => Promise<void>): () => void;
}
declare global { interface Window { neenemi: DesktopAPI } }
