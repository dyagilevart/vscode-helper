import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: http.IncomingHttpHeaders;
  text(): Promise<string>;
}

/**
 * Plain Node HTTP(S) request — more predictable in VS Code Extension Host
 * than global fetch (proxy / undici "fetch failed" with empty cause).
 */
export function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: 'manual' | 'follow';
  } = {}
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`Некорректный URL: ${url}`));
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.body && !headers['Content-Length']) {
      headers['Content-Length'] = Buffer.byteLength(options.body).toString();
    }

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        // Avoid hanging forever on dead VPN hosts
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: res.headers,
            text: async () => buffer.toString('utf8'),
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Таймаут запроса (15с): ${method} ${sanitizeUrl(url)}`));
    });

    req.on('error', (error) => {
      reject(wrapNetworkError(error, method, url));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export function getSetCookies(headers: http.IncomingHttpHeaders): string[] {
  const raw = headers['set-cookie'];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function wrapNetworkError(error: unknown, method: string, url: string): Error {
  const err = error as NodeJS.ErrnoException & { cause?: unknown };
  const code = err.code ? ` [${err.code}]` : '';
  const cause =
    err.cause && typeof err.cause === 'object' && 'code' in (err.cause as object)
      ? ` (${String((err.cause as NodeJS.ErrnoException).code)})`
      : '';

  const hint = hintFor(err.code ?? (err.cause as NodeJS.ErrnoException | undefined)?.code);
  return new Error(
    `Сеть${code}${cause}: не удалось выполнить ${method} ${sanitizeUrl(url)}.${hint ? ` ${hint}` : ''}`
  );
}

function hintFor(code: string | undefined): string {
  switch (code) {
    case 'ECONNREFUSED':
      return 'Сервер не запущен или неверный порт (для mock: npm run mock:naumen → :8787).';
    case 'ENOTFOUND':
      return 'Хост не найден — проверьте lumos.baseUrl.';
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      return 'Проблема SSL-сертификата (корпоративный MITM / self-signed).';
    case 'ETIMEDOUT':
    case 'ESOCKETTIMEDOUT':
      return 'Нет ответа — нужен VPN или другой baseUrl.';
    default:
      return 'Проверьте lumos.baseUrl и доступность Project Ruler / mock.';
  }
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('accessKey');
    return parsed.toString();
  } catch {
    return url;
  }
}
