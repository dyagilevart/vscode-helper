import * as vscode from 'vscode';

const LOGIN_KEY = 'lumos.login';
const PASSWORD_KEY = 'lumos.password';
const ACCESS_KEY = 'lumos.accessKey';
const SESSION_COOKIE_KEY = 'lumos.sessionCookie';

export class CredentialsStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getLogin(): Promise<string | undefined> {
    return this.secrets.get(LOGIN_KEY);
  }

  async getPassword(): Promise<string | undefined> {
    return this.secrets.get(PASSWORD_KEY);
  }

  async getAccessKey(): Promise<string | undefined> {
    return this.secrets.get(ACCESS_KEY);
  }

  async getSessionCookie(): Promise<string | undefined> {
    return this.secrets.get(SESSION_COOKIE_KEY);
  }

  async setSessionCookie(cookie: string | undefined): Promise<void> {
    if (!cookie) {
      await this.secrets.delete(SESSION_COOKIE_KEY);
      return;
    }
    await this.secrets.store(SESSION_COOKIE_KEY, cookie);
  }

  async hasCredentials(): Promise<boolean> {
    if (await this.getAccessKey()) {
      return true;
    }
    const [login, password] = await Promise.all([this.getLogin(), this.getPassword()]);
    return Boolean(login && password);
  }

  async promptAndStore(): Promise<boolean> {
    const mode = await vscode.window.showQuickPick(
      [
        { label: 'Логин и пароль', description: 'Обычный вход в Project Ruler', mode: 'password' as const },
        { label: 'Access Key', description: 'Если уже есть ключ REST API', mode: 'accessKey' as const },
      ],
      {
        title: 'Lumos — способ входа',
        ignoreFocusOut: true,
      }
    );
    if (!mode) {
      return false;
    }

    if (mode.mode === 'accessKey') {
      const accessKey = await vscode.window.showInputBox({
        title: 'Lumos — Access Key',
        prompt: 'Вставьте accessKey для REST API',
        password: true,
        ignoreFocusOut: true,
      });
      if (!accessKey) {
        return false;
      }
      await this.secrets.store(ACCESS_KEY, accessKey.trim());
      await this.secrets.delete(LOGIN_KEY);
      await this.secrets.delete(PASSWORD_KEY);
      await this.setSessionCookie(undefined);
      return true;
    }

    const existingLogin = await this.getLogin();
    const login = await vscode.window.showInputBox({
      title: 'Lumos — вход в Project Ruler',
      prompt: 'Логин',
      value: existingLogin,
      ignoreFocusOut: true,
    });
    if (!login) {
      return false;
    }

    const password = await vscode.window.showInputBox({
      title: 'Lumos — вход в Project Ruler',
      prompt: 'Пароль',
      password: true,
      ignoreFocusOut: true,
    });
    if (!password) {
      return false;
    }

    await this.secrets.store(LOGIN_KEY, login.trim());
    await this.secrets.store(PASSWORD_KEY, password);
    await this.secrets.delete(ACCESS_KEY);
    await this.setSessionCookie(undefined);
    return true;
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.secrets.delete(LOGIN_KEY),
      this.secrets.delete(PASSWORD_KEY),
      this.secrets.delete(ACCESS_KEY),
      this.secrets.delete(SESSION_COOKIE_KEY),
    ]);
  }
}
