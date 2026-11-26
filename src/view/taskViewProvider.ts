import * as vscode from 'vscode';
import { greetingForHour, phraseOfTheDay } from '../flavor/phrases';
import { ViewState } from '../naumen/types';

export class TaskViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'lumos.webview';

  private view?: vscode.WebviewView;
  private state: ViewState = { kind: 'loading', message: 'Lumos…' };
  private readonly visibleEmitter = new vscode.EventEmitter<void>();

  readonly onDidBecomeVisible = this.visibleEmitter.event;

  get currentState(): ViewState {
    return this.state;
  }

  /** True when the panel still needs data and is not already loading. */
  needsData(): boolean {
    return this.state.kind !== 'task' && this.state.kind !== 'loading';
  }

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    this.render();
    this.visibleEmitter.fire();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.visibleEmitter.fire();
      }
    });

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
      if (message?.command === 'copyKey' && typeof message.taskKey === 'string') {
        void vscode.commands.executeCommand('lumos.copyTaskKey', message.taskKey);
      }
      if (message?.command === 'copyUrl' && typeof message.url === 'string') {
        void vscode.commands.executeCommand('lumos.copyTaskUrl', message.url);
      }
    });
  }

  setState(state: ViewState): void {
    this.state = state;
    this.render();
  }

  async reveal(): Promise<void> {
    await vscode.commands.executeCommand('lumos.webview.focus');
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.html(this.state);
  }

  private html(state: ViewState): string {
    const greeting = greetingForHour();
    const phrase = phraseOfTheDay();
    const lit = state.kind === 'task';

    const body = (() => {
      switch (state.kind) {
        case 'loading':
          return `
            <p class="spell">✨ ${escapeHtml(state.message ?? 'Lumos…')}</p>
            <p class="muted">Набираем свет в коридоре задач</p>`;
        case 'needConfig':
          return `
            <p>${escapeHtml(state.message)}</p>
            <div class="actions">
              <button data-cmd="openSettings">Настроить адрес замка</button>
            </div>`;
        case 'needAuth':
          return `
            <p>${escapeHtml(state.message)}</p>
            <div class="actions">
              <button data-cmd="signIn">Произнести вход</button>
            </div>`;
        case 'noBranch':
        case 'noTaskKey':
        case 'notFound':
        case 'error':
          return `
            <p>${escapeHtml(state.message)}</p>
            <div class="actions">
              <button data-cmd="refresh">Lumos</button>
            </div>`;
        case 'task':
          return `
            <div class="key-row">
              <div class="key">${escapeHtml(state.taskKey)}</div>
              <span class="badge">свиток открыт</span>
            </div>
            <h2 class="title">${escapeHtml(displayTitle(state.task.title, state.taskKey))}</h2>
            ${
              state.task.state
                ? `<div class="meta"><span class="label">Статус</span>${escapeHtml(
                    softenState(state.task.state)
                  )}</div>`
                : ''
            }
            <div class="meta"><span class="label">UUID</span><code>${escapeHtml(state.task.uuid)}</code></div>
            <div class="actions">
              <button data-cmd="openUrl" data-url="${escapeAttr(state.url)}">Открыть портал</button>
              <button class="secondary" data-cmd="copyKey" data-task-key="${escapeAttr(state.taskKey)}">Списать номер</button>
              <button class="secondary" data-cmd="copyUrl" data-url="${escapeAttr(state.url)}">Списать ссылку</button>
              <button class="secondary" data-cmd="refresh">Lumos</button>
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
      --border: var(--vscode-widget-border, color-mix(in srgb, var(--fg) 12%, transparent));
      --glow: color-mix(in srgb, var(--btn) 35%, transparent);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      padding: 12px;
      margin: 0;
      background:
        radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, var(--btn) 10%, transparent), transparent 55%),
        radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--fg) 4%, transparent), transparent 50%);
    }
    .hello {
      font-size: 11px;
      letter-spacing: 0.02em;
      color: var(--muted);
      margin: 0 0 10px;
    }
    .card {
      position: relative;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      overflow: hidden;
      animation: rise 280ms ease-out;
    }
    .card.lit {
      box-shadow: 0 0 0 1px var(--glow), 0 8px 24px color-mix(in srgb, var(--btn) 18%, transparent);
    }
    .card.lit::before {
      content: '';
      position: absolute;
      inset: 0 auto auto 0;
      width: 120%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--btn), transparent);
      animation: shimmer 900ms ease-out;
      opacity: 0.85;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      from { transform: translateX(-40%); opacity: 0; }
      30% { opacity: 0.9; }
      to { transform: translateX(20%); opacity: 0; }
    }
    .key-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .key {
      font-size: 12px;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    .badge {
      font-size: 10px;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 2px 7px;
      white-space: nowrap;
    }
    .title {
      font-size: 14px;
      line-height: 1.35;
      margin: 0 0 12px;
      font-weight: 600;
    }
    .spell {
      margin: 0 0 6px;
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
    .muted { color: var(--muted); margin: 0; }
    .phrase {
      margin: 12px 0 0;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      line-height: 1.4;
      color: var(--muted);
      font-style: italic;
    }
    .actions { display: grid; gap: 8px; margin-top: 14px; }
    button {
      background: var(--btn);
      color: var(--btn-fg);
      border: none;
      border-radius: 6px;
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
  <p class="hello">${escapeHtml(greeting)}</p>
  <div class="card${lit ? ' lit' : ''}">${body}</div>
  <p class="phrase">${escapeHtml(phrase)}</p>
  <script>
    const vscode = acquireVsCodeApi();
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-cmd]');
      if (!target) return;
      const command = target.getAttribute('data-cmd');
      vscode.postMessage({
        command,
        url: target.getAttribute('data-url') || undefined,
        taskKey: target.getAttribute('data-task-key') || undefined,
      });
    });
  </script>
</body>
</html>`;
  }
}

function displayTitle(title: string, taskKey: string): string {
  // Title often looks like: Релизные процессы Agile "ACRM-234123 Ошибка…"
  const quoted = title.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    return quoted[1];
  }
  if (title.toUpperCase().includes(taskKey.toUpperCase())) {
    return title;
  }
  return title;
}

function softenState(state: string): string {
  const value = state.trim();
  const lower = value.toLowerCase();
  if (/done|закрыт|готов|complete|resolved/i.test(lower)) {
    return `${value} · почти патронус`;
  }
  if (/review|ревью|согласов/i.test(lower)) {
    return `${value} · ждёт разрешения`;
  }
  if (/progress|работ|in work|doing|разработ/i.test(lower)) {
    return `${value} · зелье варится`;
  }
  return value;
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
