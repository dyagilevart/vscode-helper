import * as vscode from 'vscode';
import { ViewState } from '../naumen/types';

export class TaskViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'lumos.webview';

  private view?: vscode.WebviewView;
  private state: ViewState = { kind: 'loading', message: 'Загрузка…' };

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    this.render();

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.command === 'signIn') {
        void vscode.commands.executeCommand('lumos.signIn');
      }
      if (message?.command === 'openSettings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'lumos.baseUrl');
      }
      if (message?.command === 'refresh') {
        void vscode.commands.executeCommand('lumos.refresh');
      }
      if (message?.command === 'openUrl' && typeof message.url === 'string') {
        void vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
    });
  }

  setState(state: ViewState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.html(this.state);
  }

  private html(state: ViewState): string {
    const body = (() => {
      switch (state.kind) {
        case 'loading':
          return `<p class="muted">${escapeHtml(state.message ?? 'Загрузка…')}</p>`;
        case 'needConfig':
          return `
            <p>${escapeHtml(state.message)}</p>
            <button data-cmd="openSettings">Открыть настройки</button>`;
        case 'needAuth':
          return `
            <p>${escapeHtml(state.message)}</p>
            <button data-cmd="signIn">Войти</button>`;
        case 'noBranch':
        case 'noTaskKey':
        case 'notFound':
        case 'error':
          return `
            <p>${escapeHtml(state.message)}</p>
            <button data-cmd="refresh">Обновить</button>`;
        case 'task':
          return `
            <div class="key">${escapeHtml(state.taskKey)}</div>
            <h2 class="title">${escapeHtml(state.task.title)}</h2>
            ${state.task.state ? `<div class="meta"><span class="label">Статус</span>${escapeHtml(state.task.state)}</div>` : ''}
            <div class="meta"><span class="label">UUID</span><code>${escapeHtml(state.task.uuid)}</code></div>
            <div class="actions">
              <button data-cmd="openUrl" data-url="${escapeAttr(state.url)}">Открыть в Project Ruler</button>
              <button class="secondary" data-cmd="refresh">Обновить</button>
            </div>`;
      }
    })();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --btn: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn2: var(--vscode-button-secondaryBackground);
      --btn2-fg: var(--vscode-button-secondaryForeground);
      --card: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      --border: var(--vscode-widget-border, transparent);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      padding: 12px;
      margin: 0;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    .key {
      font-size: 12px;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .title {
      font-size: 14px;
      line-height: 1.35;
      margin: 0 0 12px;
      font-weight: 600;
    }
    .meta {
      font-size: 12px;
      margin: 0 0 8px;
      word-break: break-word;
    }
    .label {
      display: block;
      color: var(--muted);
      margin-bottom: 2px;
    }
    .muted { color: var(--muted); }
    .actions { display: grid; gap: 8px; margin-top: 14px; }
    button {
      background: var(--btn);
      color: var(--btn-fg);
      border: none;
      border-radius: 4px;
      padding: 8px 10px;
      cursor: pointer;
      width: 100%;
    }
    button.secondary {
      background: var(--btn2);
      color: var(--btn2-fg);
    }
    code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="card">${body}</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-cmd]');
      if (!target) return;
      const command = target.getAttribute('data-cmd');
      const url = target.getAttribute('data-url');
      vscode.postMessage({ command, url });
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
