const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const worker = require('../.test-build/index.js').default;

const env = { PHONE: '13800138000', PASSWORD: 'test-password' };
const passwordHash = createHash('md5').update(env.PASSWORD).digest('hex');
const token = Buffer.from(JSON.stringify({ userId: 42, timestamp: 1, signature: 'test' })).toString('base64');
const login = () => json({ code: 1, data: { token } });
const checkin = () => json({ code: 1, msg: '签到成功', data: { points: 1 } });
const request = () => new Request('https://worker.example.com/');
const event = { cron: '0 0 * * *', scheduledTime: 1 };

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function setup(t) {
  const logs = [];
  for (const level of ['log', 'warn', 'error']) {
    t.mock.method(console, level, (...args) => logs.push({ level, args }));
  }
  t.mock.method(Math, 'random', () => 0);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return logs;
}

async function flush() {
  // 排空 fetch / Response.text() 的异步步骤，让假时钟只推进等待时间。
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function errors(logs) {
  return logs.filter(log => log.level === 'error').map(log => JSON.parse(log.args[1]));
}

function scheduled(env) {
  let pending;
  const ctx = { waitUntil(promise) { pending = promise; promise.catch(() => {}); } };
  return { start: worker.scheduled(event, env, ctx), pending: () => pending };
}

test('自动登录和签到发送正确的密码哈希、Token 和 user_id', async t => {
  const logs = setup(t);
  const calls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? login() : checkin();
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.match(calls[0].url, /Login\/doLogin$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: '', phone: env.PHONE, pwd: passwordHash });
  assert.match(calls[1].url, /signin\/continuous$/);
  assert.equal(calls[1].init.headers.token, token);
  assert.deepEqual(JSON.parse(calls[1].init.body), { user_id: 42 });
  for (const secret of [env.PHONE, env.PASSWORD, passwordHash, token]) {
    assert.equal(JSON.stringify(logs).includes(secret), false);
  }
});

test('已有 TOKEN 时直接签到', async t => {
  setup(t);
  const fetch = t.mock.method(global, 'fetch', async url => {
    assert.match(url, /signin\/continuous$/);
    return checkin();
  });
  const response = await worker.fetch(request(), { ...env, TOKEN: token });
  assert.equal(response.status, 200);
  assert.equal(fetch.mock.callCount(), 1);
});

test('登录收到 502 后退避重试，日志保留状态和请求标识但不含 HTML 响应体', async t => {
  const logs = setup(t);
  let loginCalls = 0;
  let checkinCalls = 0;
  t.mock.method(global, 'fetch', async url => {
    if (url.includes('doLogin')) {
      loginCalls++;
      return loginCalls === 1 ? new Response(`<html>${token}</html>`, {
        status: 502, headers: { 'content-type': 'text/html', 'cf-ray': 'example-ray' },
      }) : login();
    }
    checkinCalls++;
    return checkin();
  });
  const pending = worker.fetch(request(), env);
  await flush();
  assert.equal(loginCalls, 1);
  t.mock.timers.tick(1999);
  await flush();
  assert.equal(loginCalls, 1);
  t.mock.timers.tick(1);
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(loginCalls, 2);
  assert.equal(checkinCalls, 1);
  const retry = JSON.parse(logs.find(log => log.level === 'warn').args[1]);
  assert.equal(retry.stage, 'login');
  assert.equal(retry.httpStatus, 502);
  assert.equal(retry.upstreamRequestId, 'example-ray');
  assert.equal(retry.attempt, 1);
  assert.equal(retry.maxAttempts, 3);
  assert.equal(JSON.stringify(logs).includes(token), false);
});

test('持续网络故障最多尝试三次，最终错误包含可读消息', async t => {
  const logs = setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => { throw new TypeError('fetch failed'); });
  const pending = worker.fetch(request(), env);
  await flush();
  t.mock.timers.tick(2000);
  await flush();
  t.mock.timers.tick(4000);
  const response = await pending;
  const result = await response.json();
  assert.equal(response.status, 500);
  assert.equal(result.success, false);
  assert.match(result.error, /fetch failed/);
  assert.equal(fetch.mock.callCount(), 3);
  assert.equal(errors(logs)[0].kind, 'network');
  assert.equal(errors(logs)[0].attempt, 3);
});

test('登录请求 20 秒超时后取消请求并重试', async t => {
  const logs = setup(t);
  let calls = 0;
  let firstSignal;
  t.mock.method(global, 'fetch', (url, init) => {
    calls++;
    if (calls === 1) {
      firstSignal = init.signal;
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return Promise.resolve(url.includes('doLogin') ? login() : checkin());
  });
  const pending = worker.fetch(request(), env);
  t.mock.timers.tick(19999);
  await flush();
  assert.equal(firstSignal.aborted, false);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(firstSignal.aborted, true);
  t.mock.timers.tick(2000);
  assert.equal((await pending).status, 200);
  const retry = JSON.parse(logs.find(log => log.level === 'warn').args[1]);
  assert.equal(retry.kind, 'timeout');
});

test('超时也覆盖已收到响应头但响应体卡住的情况', async t => {
  setup(t);
  let calls = 0;
  t.mock.method(global, 'fetch', async (url, init) => {
    calls++;
    if (calls === 1) {
      return new Response(new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
      }));
    }
    return url.includes('doLogin') ? login() : checkin();
  });
  const pending = worker.fetch(request(), env);
  await flush();
  t.mock.timers.tick(20000);
  await flush();
  t.mock.timers.tick(2000);
  assert.equal((await pending).status, 200);
  assert.equal(calls, 3);
});

test('429 重试遵守 Retry-After', async t => {
  setup(t);
  let calls = 0;
  t.mock.method(global, 'fetch', async url => {
    calls++;
    return calls === 1 ? json({ msg: '请求过于频繁' }, 429, { 'retry-after': '8' })
      : url.includes('doLogin') ? login() : checkin();
  });
  const pending = worker.fetch(request(), env);
  await flush();
  t.mock.timers.tick(7999);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal((await pending).status, 200);
  assert.equal(calls, 3);
});

test('服务要求等待超过 30 秒时报告限流，不提前发送重试', async t => {
  const logs = setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => json({ msg: '限流' }, 429, { 'retry-after': '120' }));
  assert.equal((await worker.fetch(request(), env)).status, 500);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(errors(logs)[0].httpStatus, 429);
});

test('登录密码等业务错误立即失败，不反复登录', async t => {
  const logs = setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => json({ code: 0, msg: '密码错误' }));
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /密码错误/);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(errors(logs)[0].kind, 'business');
  assert.equal(errors(logs)[0].apiCode, 0);
});

test('403 不重试，错误日志及手动响应遮蔽上游消息中的敏感值', async t => {
  const logs = setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => json({
    msg: `${env.PHONE} ${env.PASSWORD} ${passwordHash}`,
    data: { token },
  }, 403));
  const response = await worker.fetch(request(), env);
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(errors(logs)[0].httpStatus, 403);
  assert.match(body, /REDACTED/);
  for (const secret of [env.PHONE, env.PASSWORD, passwordHash, token]) {
    assert.equal((body + JSON.stringify(logs)).includes(secret), false);
  }
});

test('登录成功但 Token 缺失或类型不正确时停止签到', async t => {
  for (const data of [null, {}, { token: 123 }, { token: ' ' }]) {
    await t.test(JSON.stringify(data), async t => {
      const logs = setup(t);
      const fetch = t.mock.method(global, 'fetch', async () => json({ code: 1, data }));
      assert.equal((await worker.fetch(request(), env)).status, 500);
      assert.equal(fetch.mock.callCount(), 1);
      assert.equal(errors(logs)[0].stage, 'login');
      assert.equal(errors(logs)[0].kind, 'invalid_response');
    });
  }
});

test('签到只有 code 1 成功，业务错误和异常响应不能显示为成功', async t => {
  for (const body of [{ code: 0, msg: '签到失败' }, { code: 200 }, {}, null, '<html>error</html>']) {
    await t.test(JSON.stringify(body), async t => {
      const logs = setup(t);
      const fetch = t.mock.method(global, 'fetch', async () => typeof body === 'string' ? new Response(body) : json(body));
      const response = await worker.fetch(request(), { TOKEN: token });
      assert.equal(response.status, 500);
      assert.equal((await response.json()).success, false);
      assert.equal(fetch.mock.callCount(), 1);
      assert.equal(errors(logs)[0].stage, 'checkin');
    });
  }
});

test('签到请求网络失败后不重复发送有副作用的 POST', async t => {
  setup(t);
  const fetch = t.mock.method(global, 'fetch', async url => {
    if (url.includes('doLogin')) return login();
    throw new TypeError('connection reset');
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 500);
  assert.equal(fetch.mock.callCount(), 2);
});

test('无效 Token 或 userId 不发送签到请求且不泄露 Token', async t => {
  for (const value of ['invalid-token', Buffer.from('{"userId":"42"}').toString('base64'), Buffer.from('{"userId":0}').toString('base64')]) {
    await t.test(value, async t => {
      const logs = setup(t);
      const fetch = t.mock.method(global, 'fetch', async () => checkin());
      const response = await worker.fetch(request(), { TOKEN: value });
      assert.equal(response.status, 500);
      assert.equal(fetch.mock.callCount(), 0);
      assert.equal(errors(logs)[0].stage, 'token');
      assert.equal(JSON.stringify(logs).includes(value), false);
    });
  }
});

test('立即执行的 Cron 通过 waitUntil 向平台传播失败', async t => {
  const logs = setup(t);
  t.mock.method(global, 'fetch', async () => json({ code: 0, msg: '密码错误' }));
  const run = scheduled({ ...env, RANDOM_DELAY_MIN: '0', RANDOM_DELAY_MAX: '0' });
  await run.start;
  await assert.rejects(run.pending(), /密码错误/);
  assert.equal(errors(logs)[0].message.includes('密码错误'), true);
});

test('随机延迟后的 Cron 也传播签到失败', async t => {
  setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => json({ code: 0, msg: '签到失败' }));
  const run = scheduled({ TOKEN: token, RANDOM_DELAY_MIN: '1', RANDOM_DELAY_MAX: '1' });
  await run.start;
  t.mock.timers.tick(59999);
  await flush();
  assert.equal(fetch.mock.callCount(), 0);
  t.mock.timers.tick(1);
  await assert.rejects(run.pending(), /签到失败/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('将过长随机延迟限制为 10 分钟，保留请求执行时间', async t => {
  setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => checkin());
  const run = scheduled({ TOKEN: token, RANDOM_DELAY_MIN: '15', RANDOM_DELAY_MAX: '15' });
  await run.start;
  t.mock.timers.tick(600000);
  await run.pending();
  assert.equal(fetch.mock.callCount(), 1);
});

test('无效随机延迟配置明确报告错误', async t => {
  const logs = setup(t);
  const fetch = t.mock.method(global, 'fetch', async () => checkin());
  const run = scheduled({ TOKEN: token, RANDOM_DELAY_MIN: 'invalid' });
  await run.start;
  await assert.rejects(run.pending(), /随机延迟/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(errors(logs)[0].stage, 'config');
});
