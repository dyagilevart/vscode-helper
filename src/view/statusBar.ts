import * as vscode from 'vscode';

export class LumosStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'lumos.focus';
    this.item.tooltip = 'Открыть свиток задачи Lumos';
    this.setIdle();
    this.item.show();
  }

  setIdle(): void {
    this.item.text = '✨ Lumos';
  }

  setTask(taskKey: string): void {
    this.item.text = `✨ ${taskKey}`;
  }

  setSearching(taskKey?: string): void {
    this.item.text = taskKey ? `$(sync~spin) ${taskKey}` : '$(sync~spin) Lumos';
  }

  dispose(): void {
    this.item.dispose();
  }
}
