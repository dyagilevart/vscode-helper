import { restBase } from '../config';
import { CredentialsStore } from '../auth/credentials';
import { getSetCookies, httpRequest } from './http';
import { NaumenTask } from './types';

export class NaumenClient {
  constructor(
    private readonly baseUrl: string,
    private readonly credentials: CredentialsStore,
    private readonly taskMetaClass: string
  ) {}

  async ensureSession(): Promise<void> {
    if (await this.credentials.getAccessKey()) {
      return;
    }
    const existing = await this.credentials.getSessionCookie();
    if (existing) {
      return;
    }
    await this.login();
  }

  async login(): Promise<void> {
    if (await this.credentials.getAccessKey()) {
      return;
    }

    const login = await this.credentials.getLogin();
    const password = await this.credentials.getPassword();
    if (!login || !password) {
      throw new AuthRequiredError('Нужен логин и пароль Project Ruler');
    }

    const cookie = await this.loginViaForm(login, password);
    if (!cookie) {
      throw new Error(
        'Не удалось войти по логину/паролю. Для локального mock попробуйте Access Key «test», либо проверьте lumos.baseUrl = http://127.0.0.1:8787.'
      );
    }
    await this.credentials.setSessionCookie(cookie);
  }

  async findTaskByKey(taskKey: string): Promise<NaumenTask | undefined> {
    await this.ensureSession();

    try {
      return await this.searchTask(taskKey);
    } catch (error) {
      if (await this.credentials.getAccessKey()) {
        throw error;
      }
      if (error instanceof AuthRequiredError || isUnauthorized(error)) {
        await this.credentials.setSessionCookie(undefined);
        await this.login();
        return this.searchTask(taskKey);
      }
      throw error;
    }
  }

  private async searchTask(taskKey: string): Promise<NaumenTask | undefined> {
    const attrs = encodeURIComponent(JSON.stringify({ title: taskKey }));
    const url = `${restBase(this.baseUrl)}/search/${this.taskMetaClass}/${attrs}`;
    const payload = await this.requestJson(url);

    const fromSearch = asTask(payload, this.taskMetaClass);
    // Full object from search — use it. Bare UUID still needs get.
    if (
      fromSearch?.title &&
      fromSearch.title !== fromSearch.uuid &&
      Object.keys(fromSearch.raw).length > 0
    ) {
      return fromSearch;
    }

    const uuid = fromSearch?.uuid ?? pickUuid(payload, this.taskMetaClass);
    if (!uuid) {
      return undefined;
    }

    return this.getTask(uuid);
  }

  private async getTask(uuid: string): Promise<NaumenTask> {
    const attrs = ['title', 'UUID', 'state', 'description', 'shortDescr', 'status'].join(',');
    const url = `${restBase(this.baseUrl)}/get/${encodeURIComponent(uuid)}?attrs=${encodeURIComponent(attrs)}`;
    const payload = await this.requestJson(url);
    return (
      asTask(payload, this.taskMetaClass) ?? {
        uuid,
        title: uuid,
        raw: {},
      }
    );
  }

  private async loginViaForm(login: string, password: string): Promise<string | undefined> {
    const attempts: Array<{ url: string; body: URLSearchParams }> = [
      {
        url: `${this.baseUrl}/sd/j_security_check`,
        body: new URLSearchParams({
          j_username: login,
          j_password: password,
        }),
      },
      {
        url: `${this.baseUrl}/sd/services/login`,
        body: new URLSearchParams({
          login,
          password,
          username: login,
        }),
      },
    ];

    let jar = '';
    let lastNetworkError: unknown;

    for (const attempt of attempts) {
      try {
        const response = await httpRequest(attempt.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(jar ? { Cookie: jar } : {}),
          },
          body: attempt.body.toString(),
          redirect: 'manual',
        });

        jar = mergeCookies(jar, getSetCookies(response.headers));

        if (jar.includes('JSESSIONID') || response.status === 302 || response.ok) {
          const probe = await this.probeSession(jar);
          if (probe) {
            return jar;
          }
        }
      } catch (error) {
        lastNetworkError = error;
      }
    }

    try {
      const basicOk = await this.probeBasic(login, password);
      if (basicOk) {
        return `BASIC ${Buffer.from(`${login}:${password}`).toString('base64')}`;
      }
    } catch (error) {
      lastNetworkError = error;
    }

    if (lastNetworkError) {
      throw lastNetworkError;
    }
    return undefined;
  }

  private async probeSession(cookie: string): Promise<boolean> {
    const response = await httpRequest(`${restBase(this.baseUrl)}/get/employee$1?attrs=UUID`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    return response.status !== 401 && response.status !== 403;
  }

  private async probeBasic(login: string, password: string): Promise<boolean> {
    const response = await httpRequest(`${restBase(this.baseUrl)}/get/employee$1?attrs=UUID`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      },
      redirect: 'manual',
    });
    return response.status !== 401 && response.status !== 403;
  }

  private async requestJson(url: string): Promise<unknown> {
    const accessKey = await this.credentials.getAccessKey();
    const cookie = await this.credentials.getSessionCookie();

    if (!accessKey && !cookie) {
      throw new AuthRequiredError('Нет активной сессии');
    }

    const finalUrl = accessKey ? appendQuery(url, 'accessKey', accessKey) : url;
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
    };

    if (!accessKey && cookie) {
      if (cookie.startsWith('BASIC ')) {
        headers.Authorization = `Basic ${cookie.slice('BASIC '.length)}`;
      } else {
        headers.Cookie = cookie;
      }
    }

    const response = await httpRequest(finalUrl, { headers, redirect: 'manual' });

    if (response.status === 401 || response.status === 403) {
      throw new AuthRequiredError(`HTTP ${response.status}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Naumen HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const text = await response.text();
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      const trimmed = text.trim();
      if (trimmed.includes('$')) {
        if (trimmed.startsWith('[')) {
          return trimmed
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
        }
        return trimmed;
      }
      throw new Error(`Не JSON-ответ от Naumen: ${trimmed.slice(0, 200)}`);
    }
  }
}

export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && /401|403|Unauthorized|AuthRequired/i.test(error.message);
}

function mergeCookies(existing: string, setCookies: string[]): string {
  const map = new Map<string, string>();

  for (const part of existing.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      map.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }

  for (const raw of setCookies) {
    const first = raw.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      map.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }

  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function asTask(payload: unknown, metaClass: string): NaumenTask | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string' && payload.includes('$')) {
    return { uuid: payload, title: payload, raw: {} };
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const task = asTask(item, metaClass);
      if (task) {
        return task;
      }
    }
    return undefined;
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const uuid = pickUuid(record, metaClass);
    if (!uuid && typeof record.title !== 'string') {
      for (const key of ['result', 'objects', 'data', 'items']) {
        if (key in record) {
          const nested = asTask(record[key], metaClass);
          if (nested) {
            return nested;
          }
        }
      }
      return undefined;
    }

    if (!uuid) {
      return undefined;
    }

    return {
      uuid,
      title: String(record.title ?? record.shortDescr ?? uuid),
      state: stringifyAttr(record.state ?? record.status),
      description: stringifyAttr(record.description ?? record.shortDescr),
      raw: record,
    };
  }

  return undefined;
}

function pickUuid(payload: unknown, metaClass: string): string | undefined {
  if (!payload) {
    return undefined;
  }

  if (typeof payload === 'string') {
    return payload.includes('$') ? payload : undefined;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const uuid = pickUuid(item, metaClass);
      if (uuid) {
        return uuid;
      }
    }
    return undefined;
  }

  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const candidate of [record.UUID, record.uuid, record.id]) {
      if (typeof candidate === 'string' && candidate.includes('$')) {
        return candidate;
      }
    }

    if (typeof record.UUID === 'number' || (typeof record.UUID === 'string' && /^\d+$/.test(record.UUID))) {
      return `${metaClass}$${record.UUID}`;
    }

    for (const key of ['result', 'objects', 'data', 'items']) {
      if (key in record) {
        const nested = pickUuid(record[key], metaClass);
        if (nested) {
          return nested;
        }
      }
    }
  }

  return undefined;
}

function stringifyAttr(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.title === 'string') {
      return record.title;
    }
    if (typeof record.name === 'string') {
      return record.name;
    }
    if (typeof record.code === 'string') {
      return record.code;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}
