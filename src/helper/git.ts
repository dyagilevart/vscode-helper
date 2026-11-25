import * as vscode from 'vscode';

type GitAPI = {
  repositories: Array<{
    state: {
      HEAD?: { name?: string };
      onDidChange: vscode.Event<void>;
    };
  }>;
  onDidOpenRepository: vscode.Event<unknown>;
  onDidCloseRepository: vscode.Event<unknown>;
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
  return git.repositories[0].state.HEAD?.name;
}

export async function onGitHeadChange(listener: () => void): Promise<vscode.Disposable> {
  const git = await getGitAPI();
  if (!git) {
    return { dispose: () => undefined };
  }

  const disposables: vscode.Disposable[] = [];

  const attach = (repo: GitAPI['repositories'][number]) => {
    disposables.push(repo.state.onDidChange(listener));
  };

  for (const repo of git.repositories) {
    attach(repo);
  }

  disposables.push(git.onDidOpenRepository(() => listener()));
  disposables.push(git.onDidCloseRepository(() => listener()));

  return vscode.Disposable.from(...disposables);
}
