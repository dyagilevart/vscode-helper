#!/usr/bin/env node
/**
 * Local stand-in for Naumen Project Ruler REST used by Lumos.
 *
 * Start:  npm run mock:naumen
 * Base:   http://127.0.0.1:8787
 *
 * Extension settings:
 *   lumos.baseUrl = http://127.0.0.1:8787
 * Sign In: any login/password, or Access Key "test"
 * Git branch example: feature/ACRM-234123
 */

import http from 'node:http';
import { URL } from 'node:url';

const HOST = process.env.LUMOS_MOCK_HOST ?? '127.0.0.1';
const PORT = Number(process.env.LUMOS_MOCK_PORT ?? 8787);
const ACCESS_KEY = process.env.LUMOS_MOCK_ACCESS_KEY ?? 'test';

/** @type {Record<string, { uuid: string, title: string, state: string, description: string, taskType: { UUID: string, title: string } }>} */
const TASKS = {
  'ACRM-234123': {
    uuid: 'GMtask$100500',
    title: 'Релизные процессы Agile "ACRM-234123 Ошибка авторизации"',
    state: 'В работе',
    description: 'Mock SUB-TASK — нормальный сценарий.',
    taskType: { UUID: 'PMibtask$51604', title: 'Agile - Develop (SUB-TASK)' },
  },
  'ACRM-100001': {
    uuid: 'GMtask$100001',
    title: 'Бэклог команды "ACRM-100001 Починить копирование ссылки"',
    state: 'На ревью',
    description: 'Mock мастер-задача — должна мигать предупреждением.',
    taskType: { UUID: 'PMibtask$1', title: 'Agile - Story' },
  },
};

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Lumos mock Naumen PR listening on http://${HOST}:${PORT}`);
  console.log(`  lumos.baseUrl = http://${HOST}:${PORT}`);
  console.log(`  Access Key    = ${ACCESS_KEY}`);
  console.log(`  Tasks         = ${Object.keys(TASKS).join(', ')}`);
});

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  log(req.method ?? 'GET', path);

  if (req.method === 'POST' && path === '/sd/j_security_check') {
    const body = await readBody(req);
    const params = new URLSearchParams(body);
    if (!params.get('j_username') || !params.get('j_password')) {
      send(res, 401, 'missing credentials');
      return;
    }
    res.writeHead(302, {
      Location: '/sd/operator/',
      'Set-Cookie': 'JSESSIONID=lumos-mock-session; Path=/; HttpOnly',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && path === '/sd/services/login') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Set-Cookie': 'JSESSIONID=lumos-mock-session; Path=/; HttpOnly',
    });
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && path.startsWith('/sd/services/rest/')) {
    if (!isAuthorized(req, url)) {
      send(res, 401, 'unauthorized');
      return;
    }

    const restPath = path.slice('/sd/services/rest/'.length);

    if (restPath.startsWith('search/GMtask/')) {
      const raw = restPath.slice('search/GMtask/'.length);
      const query = parseJsonAttr(raw);
      const titleQuery = String(query.title ?? '');
      const task = findByTitleQuery(titleQuery);
      if (!task) {
        sendJson(res, []);
        return;
      }
      // Mimic a search hit: UUID list, then client may call get
      sendJson(res, [task.uuid]);
      return;
    }

    if (restPath.startsWith('get/')) {
      const uuidPart = restPath.slice('get/'.length).split('?')[0];
      const uuid = decodeURIComponent(uuidPart);

      if (uuid.startsWith('employee$')) {
        sendJson(res, { UUID: uuid, title: 'Mock Employee' });
        return;
      }

      const task = Object.values(TASKS).find((item) => item.uuid === uuid);
      if (!task) {
        send(res, 404, `unknown ${uuid}`);
        return;
      }
      sendJson(res, {
        UUID: task.uuid,
        title: task.title,
        state: task.state,
        description: task.description,
        shortDescr: task.title,
        status: task.state,
        PMpsbTasktype: task.taskType,
      });
      return;
    }

    send(res, 404, `unknown rest path: ${restPath}`);
    return;
  }

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    sendJson(res, {
      ok: true,
      service: 'lumos-mock-naumen',
      tasks: Object.keys(TASKS),
    });
    return;
  }

  send(res, 404, `no route for ${req.method} ${path}`);
}

/**
 * @param {http.IncomingMessage} req
 * @param {URL} url
 */
function isAuthorized(req, url) {
  const accessKey = url.searchParams.get('accessKey');
  if (accessKey === ACCESS_KEY) {
    return true;
  }

  const cookie = req.headers.cookie ?? '';
  if (cookie.includes('JSESSIONID=lumos-mock-session')) {
    return true;
  }

  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Basic ')) {
    return true;
  }

  return false;
}

/**
 * @param {string} titleQuery
 */
function findByTitleQuery(titleQuery) {
  const needle = titleQuery.trim().toUpperCase();
  if (!needle) {
    return undefined;
  }
  return (
    TASKS[needle] ??
    Object.values(TASKS).find((task) => task.title.toUpperCase().includes(needle))
  );
}

/**
 * @param {string} raw
 */
function parseJsonAttr(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return {};
    }
  }
}

/**
 * @param {http.IncomingMessage} req
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {http.ServerResponse} res
 * @param {unknown} payload
 */
function sendJson(res, payload) {
  send(res, 200, JSON.stringify(payload), 'application/json; charset=utf-8');
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string | object} body
 * @param {string} [contentType]
 */
function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

/**
 * @param {string} method
 * @param {string} path
 */
function log(method, path) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] ${method} ${path}`);
}
