import { NaumenTask } from './types';

export type SubTaskCheck =
  | { ok: true; issueType: string }
  | { ok: false; issueType?: string; reason: string };

const DEFAULT_ATTR_CANDIDATES = [
  'PMpsbTasktype',
  'jiraIssueType',
  'jiraType',
  'issueType',
  'taskType',
  'type',
  'jira_issue_type',
  'issuetype',
];

export function checkSubTask(
  task: NaumenTask,
  options: {
    attributeNames: string[];
    subTaskPattern: string;
  }
): SubTaskCheck {
  const issueType = resolveIssueType(task.raw, options.attributeNames);
  const pattern = compilePattern(options.subTaskPattern);

  if (!issueType) {
    return {
      ok: false,
      reason:
        'Не удалось прочитать «Тип задачи». Убедитесь, что ветка указывает на Agile - Develop (SUB-TASK), иначе коммиты уйдут в мастер-задачу.',
    };
  }

  if (pattern.test(issueType)) {
    return { ok: true, issueType };
  }

  return {
    ok: false,
    issueType,
    reason: `Тип «${issueType}» — не сабтаск. Работайте только в Agile - Develop (SUB-TASK), иначе коммиты уйдут в мастер-задачу.`,
  };
}

export function resolveIssueType(
  raw: Record<string, unknown>,
  attributeNames: string[]
): string | undefined {
  const keys = [...attributeNames, ...DEFAULT_ATTR_CANDIDATES];
  const seen = new Set<string>();

  for (const key of keys) {
    const normalized = key.trim();
    if (!normalized || seen.has(normalized) || !(normalized in raw)) {
      continue;
    }
    seen.add(normalized);
    const value = stringifyAttr(raw[normalized]);
    if (value) {
      return value;
    }
  }

  // Fallback: any attribute whose string value looks like a Jira issue type.
  for (const value of Object.values(raw)) {
    const text = stringifyAttr(value);
    if (text && /SUB-TASK|sub-task|subtask|Story|Bug|Task|Epic|Develop/i.test(text)) {
      return text;
    }
  }

  return undefined;
}

function compilePattern(source: string): RegExp {
  try {
    return new RegExp(source, 'i');
  } catch {
    return /SUB-TASK/i;
  }
}

function stringifyAttr(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.title === 'string') {
      return record.title;
    }
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.code === 'string') {
      return record.code;
    }
  }
  return undefined;
}
