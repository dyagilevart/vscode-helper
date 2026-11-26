import * as path from 'node:path';
import * as vscode from 'vscode';

type GitRepository = {
  rootUri: vscode.Uri;
  state: {
    HEAD?: { name?: string };
    onDidChange: vscode.Event<void>;
  };
};

type GitAPI = {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  onDidCloseRepository: vscode.Event<GitRepository>;
};

export async function getGitAPI(): Promise<GitAPI | undefined> {
  const extension = vscode.extensions.getExtension('vscode.git');
  if (!extension) {
    return undefined;
  }
  if (!extension.isActive) {
    await extension.activate();
  }
  return extension.exports?.getAPI?.(1) as GitAPI | undefined;
}

export async function getCurrentGitBranch(): Promise<string | undefined> {
  const git = await getGitAPI();
  if (!git || git.repositories.length === 0) {
    return undefined;
  }

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const repo =
    (folder &&
      git.repositories.find((item) => {
        const root = item.rootUri.fsPath;
        return folder === root || folder.startsWith(root + path.sep);
      })) ||
    git.repositories[0];

  return repo.state.HEAD?.name;
}

/** Git often opens a moment after Extension Host start — wait briefly for HEAD. */
export async function waitForGitBranch(options?: {
  attempts?: number;
  delayMs?: number;
}): Promise<string | undefined> {
  const attempts = options?.attempts ?? 12;
  const delayMs = options?.delayMs ?? 250;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const branch = await getCurrentGitBranch();
    if (branch) {
      return branch;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return undefined;
}

/**
 * Fires only when the relevant HEAD branch name changes —
 * Git's onDidChange is very noisy during startup.
 */
export async function onGitBranchNameChange(listener: () => void): Promise<vscode.Disposable> {
  const git = await getGitAPI();
  if (!git) {
    return { dispose: () => undefined };
  }

  const disposables: vscode.Disposable[] = [];
  const attached = new Set<GitRepository>();
  const lastHead = new WeakMap<GitRepository, string | undefined>();

  const currentWatchedHead = (): string | undefined => {
    // Mirror getCurrentGitBranch selection without async.
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const repo =
      (folder &&
        git.repositories.find((item) => {
          const root = item.rootUri.fsPath;
          return folder === root || folder.startsWith(root + path.sep);
        })) ||
      git.repositories[0];
    return repo?.state.HEAD?.name;
  };

  let lastEmitted = currentWatchedHead();

  const maybeEmit = () => {
    const head = currentWatchedHead();
    if (head === lastEmitted) {
      return;
    }
    lastEmitted = head;
    listener();
  };

  const attach = (repo: GitRepository) => {
    if (attached.has(repo)) {
      return;
    }
    attached.add(repo);
    lastHead.set(repo, repo.state.HEAD?.name);
    disposables.push(
      repo.state.onDidChange(() => {
        const name = repo.state.HEAD?.name;
        if (lastHead.get(repo) === name) {
          return;
        }
        lastHead.set(repo, name);
        maybeEmit();
      })
    );
  };

  for (const repo of git.repositories) {
    attach(repo);
  }

  disposables.push(
    git.onDidOpenRepository((repo) => {
      attach(repo);
      maybeEmit();
    })
  );
  disposables.push(
    git.onDidCloseRepository((repo) => {
      attached.delete(repo);
      maybeEmit();
    })
  );

  return vscode.Disposable.from(...disposables);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
