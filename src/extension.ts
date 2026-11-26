import * as vscode from 'vscode';
import { CredentialsStore } from './auth/credentials';
import { getConfig, operatorTaskUrl } from './config';
import { flavor } from './flavor/messages';
import { getCurrentGitBranch, onGitBranchNameChange, waitForGitBranch } from './helper/git';
import { extractTaskKey } from './helper/taskKey';
import { AuthRequiredError, NaumenClient } from './naumen/client';
import { ViewState } from './naumen/types';
import { LumosStatusBar } from './view/statusBar';
import { TaskViewProvider } from './view/taskViewProvider';

const FETCH_CACHE_MS = 30_000;
const AUTO_DEBOUNCE_MS = 450;

let refreshInFlight: Promise<void> | undefined;
let debounceTimer: NodeJS.Timeout | undefined;
let pendingForce = false;
let lastFetchedKey: string | undefined;
let lastFetchedAt = 0;

export function activate(context: vscode.ExtensionContext) {
  const credentials = new CredentialsStore(context.secrets);
  const provider = new TaskViewProvider(context.extensionUri);
  const statusBar = new LumosStatusBar();

  const runRefresh = (force: boolean) => {
    refreshInFlight = (refreshInFlight ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => refreshTaskCard(provider, credentials, statusBar, { force }));
    return refreshInFlight;
  };

  const scheduleRefresh = (options?: { force?: boolean }) => {
    if (options?.force) {
      pendingForce = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      return runRefresh(true);
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      const force = pendingForce;
      pendingForce = false;
      void runRefresh(force);
    }, AUTO_DEBOUNCE_MS);
  };

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(TaskViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    provider.onDidBecomeVisible(() => {
      // Don't refetch just because the sidebar was focused again.
      if (provider.needsData()) {
        scheduleRefresh();
      }
    }),
    {
      dispose: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
      },
    }
  );

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
        lastFetchedKey = undefined;
        await scheduleRefresh({ force: true });
      } catch (error) {
        vscode.window.showErrorMessage(flavor.signInFailed(errorMessage(error)));
        await scheduleRefresh({ force: true });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.signOut', async () => {
      await credentials.clear();
      lastFetchedKey = undefined;
      vscode.window.showInformationMessage(flavor.signedOut);
      await scheduleRefresh({ force: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('lumos.refresh', () => {
      lastFetchedKey = undefined;
      scheduleRefresh({ force: true });
    })
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
        lastFetchedKey = undefined;
        scheduleRefresh({ force: true });
      }
    })
  );

  void (async () => {
    const disposable = await onGitBranchNameChange(() => {
      scheduleRefresh();
    });
    context.subscriptions.push(disposable);
    // One initial load; wait for Git inside refresh when branch is not ready yet.
    await runRefresh(true);
  })();
}

export function deactivate() {}

async function refreshTaskCard(
  provider: TaskViewProvider,
  credentials: CredentialsStore,
  statusBar: LumosStatusBar,
  options: { force: boolean }
): Promise<void> {
  const previous = provider.currentState;
  const showLoading = options.force || previous.kind === 'loading' || previous.kind === 'noBranch';

  if (showLoading) {
    provider.setState({ kind: 'loading', message: flavor.loading });
    statusBar.setSearching();
  }

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

  let branch = await getCurrentGitBranch();
  if (!branch && (options.force || previous.kind === 'loading' || previous.kind === 'noBranch')) {
    branch = await waitForGitBranch();
  }

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

  if (
    !options.force &&
    taskKey === lastFetchedKey &&
    Date.now() - lastFetchedAt < FETCH_CACHE_MS &&
    isSameTaskCard(previous, taskKey)
  ) {
    statusBar.setTask(taskKey);
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

    lastFetchedKey = taskKey;
    lastFetchedAt = Date.now();
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

function isSameTaskCard(state: ViewState, taskKey: string): boolean {
  return state.kind === 'task' && state.taskKey === taskKey;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
