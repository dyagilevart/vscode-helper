import * as vscode from 'vscode';

export interface LumosConfig {
  baseUrl: string;
  taskMetaClass: string;
  branchPattern: string;
}

export function getConfig(): LumosConfig {
  const cfg = vscode.workspace.getConfiguration('lumos');
  const baseUrl = normalizeBaseUrl(cfg.get<string>('baseUrl') ?? '');
  return {
    baseUrl,
    taskMetaClass: (cfg.get<string>('taskMetaClass') ?? 'GMtask').trim() || 'GMtask',
    branchPattern: (cfg.get<string>('branchPattern') ?? 'ACRM-\\d+').trim() || 'ACRM-\\d+',
  };
}

/** Strip trailing slash and accidental `/sd` suffix from settings. */
export function normalizeBaseUrl(value: string): string {
  let baseUrl = value.trim().replace(/\/+$/, '');
  if (baseUrl.toLowerCase().endsWith('/sd')) {
    baseUrl = baseUrl.slice(0, -3).replace(/\/+$/, '');
  }
  return baseUrl;
}

export function operatorTaskUrl(baseUrl: string, uuid: string): string {
  return `${baseUrl}/sd/operator/#uuid:${uuid}`;
}

export function restBase(baseUrl: string): string {
  return `${baseUrl}/sd/services/rest`;
}
