import * as vscode from 'vscode';
import { CredentialsStore } from './auth/credentials';
import { getConfig, operatorTaskUrl } from './config';
import { flavor } from './flavor/messages';
import { getCurrentGitBranch, onGitHeadChange } from './helper/git';
import { extractTaskKey } from './helper/taskKey';
import { AuthRequiredError, NaumenClient } from './naumen/client';
import { LumosStatusBar } from './view/statusBar';
import { TaskViewProvider } from './view/taskViewProvider';

let refreshInFlight: Promise<void> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const credentials = new CredentialsStore(context.secrets);
  const provider = new TaskViewProvider(context.extensionUri);
  const statusBar = new LumosStatusBar();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(TaskViewProvider.viewType, provider)
  );

  const refresh = () => {
    refreshInFlight = (refreshInFlight ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => refreshTaskCard(provider, credentials, statusBar));
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
        vscode.window.showWarningMessage(flavor.needBaseUrlFirst);
        return;
      }
      try {
        const client = new NaumenClient(config.baseUrl, credentials, config.taskMetaClass);
        await client.login();
        vscode.window.showInformationMessage(flavor.signedIn);
        await refresh();
      } catch (error) {
        vscode.window.showErrorMessage(flavor.signInFailed(errorMessage(error)));
        await refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.signOut', async () => {
      await credentials.clear();
      vscode.window.showInformationMessage(flavor.signedOut);
      await refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.refresh', () => refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.focus', async () => {
      await provider.reveal();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.copyTaskKey', async (taskKey?: string) => {
      const key = typeof taskKey === 'string' ? taskKey : undefined;
      if (!key) {
        return;
      }
      await vscode.env.clipboard.writeText(key);
      vscode.window.setStatusBarMessage(flavor.copiedKey(key), 2000);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.copyTaskUrl', async (url?: string) => {
      if (typeof url !== 'string' || !url) {
        return;
      }
      await vscode.env.clipboard.writeText(url);
      vscode.window.setStatusBarMessage(flavor.copiedUrl, 2000);
    })
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
  credentials: CredentialsStore,
  statusBar: LumosStatusBar
): Promise<void> {
  provider.setState({ kind: 'loading', message: flavor.loading });
  statusBar.setSearching();

  const config = getConfig();
  if (!config.baseUrl) {
    statusBar.setIdle();
    provider.setState({
      kind: 'needConfig',
      message: flavor.needConfig,
    });
    return;
  }

  if (!(await credentials.hasCredentials())) {
    statusBar.setIdle();
    provider.setState({
      kind: 'needAuth',
      message: flavor.needAuth,
    });
    return;
  }

  const branch = await getCurrentGitBranch();
  if (!branch) {
    statusBar.setIdle();
    provider.setState({
      kind: 'noBranch',
      message: flavor.noBranch,
    });
    return;
  }

  const taskKey = extractTaskKey(branch, config.branchPattern);
  if (!taskKey) {
    statusBar.setIdle();
    provider.setState({
      kind: 'noTaskKey',
      branch,
      message: flavor.noTaskKey(branch),
    });
    return;
  }

  statusBar.setSearching(taskKey);

  try {
    const client = new NaumenClient(config.baseUrl, credentials, config.taskMetaClass);
    const task = await client.findTaskByKey(taskKey);
    if (!task) {
      statusBar.setTask(taskKey);
      provider.setState({
        kind: 'notFound',
        taskKey,
        message: flavor.notFound(taskKey),
      });
      return;
    }

    statusBar.setTask(taskKey);
    provider.setState({
      kind: 'task',
      taskKey,
      task,
      url: operatorTaskUrl(config.baseUrl, task.uuid),
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      statusBar.setIdle();
      provider.setState({
        kind: 'needAuth',
        message: flavor.sessionExpired,
      });
      return;
    }
    statusBar.setTask(taskKey);
    provider.setState({
      kind: 'error',
      message: flavor.error(errorMessage(error)),
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
