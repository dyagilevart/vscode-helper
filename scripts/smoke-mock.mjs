#!/usr/bin/env node
/**
 * Smoke-test the same HTTP flow Lumos uses against the local mock.
 */

const BASE = process.env.LUMOS_MOCK_BASE ?? 'http://127.0.0.1:8787';
const TASK_KEY = process.env.LUMOS_SMOKE_TASK ?? 'ACRM-234123';

async function main() {
  console.log(`Smoke against ${BASE}`);

  const login = await fetch(`${BASE}/sd/j_security_check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ j_username: 'hermione', j_password: 'books' }),
    redirect: 'manual',
  });
  const cookie = cookieFrom(login);
  assert(cookie.includes('JSESSIONID'), `login cookie missing, status=${login.status}`);
  console.log('✓ login → JSESSIONID');

  const probe = await fetch(`${BASE}/sd/services/rest/get/employee$1?attrs=UUID`, {
    headers: { Cookie: cookie },
  });
  assert(probe.ok, `probe failed: ${probe.status}`);
  console.log('✓ session probe');

  const attrs = encodeURIComponent(JSON.stringify({ title: TASK_KEY }));
  const search = await fetch(`${BASE}/sd/services/rest/search/GMtask/${attrs}`, {
    headers: { Cookie: cookie },
  });
  assert(search.ok, `search failed: ${search.status}`);
  const found = await search.json();
  const uuid = Array.isArray(found) ? found[0] : found;
  assert(typeof uuid === 'string' && uuid.includes('GMtask$'), `bad search payload: ${JSON.stringify(found)}`);
  console.log(`✓ search ${TASK_KEY} → ${uuid}`);

  const detail = await fetch(
    `${BASE}/sd/services/rest/get/${encodeURIComponent(uuid)}?attrs=${encodeURIComponent(
      'title,UUID,state,description,shortDescr,status'
    )}`,
    { headers: { Cookie: cookie } }
  );
  assert(detail.ok, `get failed: ${detail.status}`);
  const task = await detail.json();
  assert(String(task.title).includes(TASK_KEY), `title missing key: ${task.title}`);
  console.log(`✓ get → ${task.title}`);

  const withKey = await fetch(
    `${BASE}/sd/services/rest/search/GMtask/${attrs}?accessKey=test`
  );
  assert(withKey.ok, `accessKey search failed: ${withKey.status}`);
  console.log('✓ accessKey auth');

  console.log('Smoke OK');
}

function cookieFrom(response) {
  const headers = response.headers;
  if (typeof headers.getSetCookie === 'function') {
    return headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  }
  return headers.get('set-cookie')?.split(';')[0] ?? '';
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error('Smoke FAILED:', error.message);
  process.exit(1);
});
