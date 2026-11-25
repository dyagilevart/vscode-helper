import * as vscode from 'vscode';

export interface LumosConfig {
  baseUrl: string;
  taskMetaClass: string;
  branchPattern: string;
}

export function getConfig(): LumosConfig {
  const cfg = vscode.workspace.getConfiguration('lumos');
  const baseUrl = (cfg.get<string>('baseUrl') ?? '').trim().replace(/\/+$/, '');
  return {
    baseUrl,
    taskMetaClass: (cfg.get<string>('taskMetaClass') ?? 'GMtask').trim() || 'GMtask',
    branchPattern: (cfg.get<string>('branchPattern') ?? 'ACRM-\\d+').trim() || 'ACRM-\\d+',
  };
}

export function operatorTaskUrl(baseUrl: string, uuid: string): string {
  return `${baseUrl}/sd/operator/#uuid:${uuid}`;
}

export function restBase(baseUrl: string): string {
  return `${baseUrl}/sd/services/rest`;
}
