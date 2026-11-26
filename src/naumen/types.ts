export interface NaumenTask {
  uuid: string;
  title: string;
  state?: string;
  description?: string;
  issueType?: string;
  raw: Record<string, unknown>;
}

export type SubTaskWarning = {
  issueType?: string;
  message: string;
};

export type ViewState =
  | { kind: 'loading'; message?: string }
  | { kind: 'needConfig'; message: string }
  | { kind: 'needAuth'; message: string }
  | { kind: 'noBranch'; message: string }
  | { kind: 'noTaskKey'; branch: string; message: string }
  | { kind: 'notFound'; taskKey: string; message: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'task';
      taskKey: string;
      task: NaumenTask;
      url: string;
      subTaskWarning?: SubTaskWarning;
    };
