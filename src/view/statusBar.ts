import * as vscode from 'vscode';

export class LumosStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private blinkTimer: NodeJS.Timeout | undefined;
  private blinkOn = true;
  private warningTaskKey: string | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'lumos.focus';
    this.item.tooltip = 'Открыть свиток задачи Lumos';
    this.setIdle();
    this.item.show();
  }

  setIdle(): void {
    this.stopBlink();
    this.item.backgroundColor = undefined;
    this.item.text = '✨ Lumos';
    this.item.tooltip = 'Открыть свиток задачи Lumos';
  }

  setTask(taskKey: string): void {
    this.stopBlink();
    this.item.backgroundColor = undefined;
    this.item.text = `✨ ${taskKey}`;
    this.item.tooltip = 'Открыть свиток задачи Lumos';
  }

  setSearching(taskKey?: string): void {
    this.stopBlink();
    this.item.backgroundColor = undefined;
    this.item.text = taskKey ? `$(sync~spin) ${taskKey}` : '$(sync~spin) Lumos';
  }

  /** Active alert: not a SUB-TASK — blink until fixed. */
  setSubTaskWarning(taskKey: string, detail: string): void {
    this.warningTaskKey = taskKey;
    this.item.tooltip = detail;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.text = `$(alert) ${taskKey} · не SUB-TASK`;
    this.startBlink();
  }

  dispose(): void {
    this.stopBlink();
    this.item.dispose();
  }

  private startBlink(): void {
    this.stopBlink();
    this.blinkOn = true;
    this.blinkTimer = setInterval(() => {
      if (!this.warningTaskKey) {
        return;
      }
      this.blinkOn = !this.blinkOn;
      this.item.text = this.blinkOn
        ? `$(alert) ${this.warningTaskKey} · не SUB-TASK`
        : `$(circle-slash) ${this.warningTaskKey} · проверьте тип`;
      this.item.backgroundColor = this.blinkOn
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : new vscode.ThemeColor('statusBarItem.warningBackground');
    }, 700);
  }

  private stopBlink(): void {
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = undefined;
    }
    this.warningTaskKey = undefined;
    this.blinkOn = true;
  }
}
