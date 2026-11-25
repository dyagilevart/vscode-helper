import * as vscode from 'vscode';
import { CredentialsStore } from './auth/credentials';
import { getConfig, operatorTaskUrl } from './config';
import { getCurrentGitBranch, onGitHeadChange } from './helper/git';
import { extractTaskKey } from './helper/taskKey';
import { AuthRequiredError, NaumenClient } from './naumen/client';
import { TaskViewProvider } from './view/taskViewProvider';

let refreshInFlight: Promise<void> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const credentials = new CredentialsStore(context.secrets);
  const provider = new TaskViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TaskViewProvider.viewType, provider)
  );

  const refresh = () => {
    refreshInFlight = (refreshInFlight ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => refreshTaskCard(provider, credentials));
    return refreshInFlight;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.signIn', async () => {
      const ok = await credentials.promptAndStore();
      if (!ok) {
        return;
      }
      const config = getConfig();
      if (!config.baseUrl) {
        vscode.window.showWarningMessage('Сначала укажите lumos.baseUrl в настройках.');
        return;
      }
      try {
        const client = new NaumenClient(config.baseUrl, credentials, config.taskMetaClass);
        await client.login();
        vscode.window.showInformationMessage('Lumos: вход выполнен');
        await refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Lumos: не удалось войти — ${errorMessage(error)}`);
        await refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.signOut', async () => {
      await credentials.clear();
      vscode.window.showInformationMessage('Lumos: данные входа удалены');
      await refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.refresh', () => refresh())
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('lumos')) {
        void refresh();
      }
    })
  );

  void onGitHeadChange(() => {
    void refresh();
  }).then((disposable) => context.subscriptions.push(disposable));

  void refresh();
}

export function deactivate() {}

async function refreshTaskCard(
  provider: TaskViewProvider,
  credentials: CredentialsStore
): Promise<void> {
  provider.setState({ kind: 'loading', message: 'Ищем задачу…' });

  const config = getConfig();
  if (!config.baseUrl) {
    provider.setState({
      kind: 'needConfig',
      message: 'Укажите lumos.baseUrl — адрес Project Ruler (без /sd).',
    });
    return;
  }

  if (!(await credentials.hasCredentials())) {
    provider.setState({
      kind: 'needAuth',
      message: 'Войдите логином и паролем Project Ruler, чтобы загрузить карточку задачи.',
    });
    return;
  }

  const branch = await getCurrentGitBranch();
  if (!branch) {
    provider.setState({
      kind: 'noBranch',
      message: 'Git-ветка не найдена. Откройте репозиторий с веткой feature/ACRM-…',
    });
    return;
  }

  const taskKey = extractTaskKey(branch, config.branchPattern);
  if (!taskKey) {
    provider.setState({
      kind: 'noTaskKey',
      branch,
      message: `В ветке «${branch}» не найден номер задачи (${config.branchPattern}).`,
    });
    return;
  }

  try {
    const client = new NaumenClient(config.baseUrl, credentials, config.taskMetaClass);
    const task = await client.findTaskByKey(taskKey);
    if (!task) {
      provider.setState({
        kind: 'notFound',
        taskKey,
        message: `Задача ${taskKey} не найдена в Project Ruler.`,
      });
      return;
    }

    provider.setState({
      kind: 'task',
      taskKey,
      task,
      url: operatorTaskUrl(config.baseUrl, task.uuid),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      provider.setState({
        kind: 'needAuth',
        message: 'Сессия истекла или доступ запрещён. Войдите снова.',
      });
      return;
    }
    provider.setState({
      kind: 'error',
      message: errorMessage(error),
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
