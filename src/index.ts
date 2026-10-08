/**
 * 浙江FC会员自动签到脚本
 * 每天定时执行签到请求
 * 支持自动登录获取 token
 */

import { ApiError, ApiResponse, describeError, isObject, requestApi, sleep } from './api';

interface Env {
  TOKEN?: string; // 可选的 token（如果设置了则直接使用，否则自动登录）
  PHONE?: string; // 登录手机号
  PASSWORD?: string; // 登录密码（原始密码，会自动进行 MD5 哈希）
  RANDOM_DELAY_MIN?: string; // 随机延迟最小值（分钟），默认 0
  RANDOM_DELAY_MAX?: string; // 随机延迟最大值（分钟），默认 3
}

interface TokenPayload {
  userId: number;
  timestamp: number;
  signature: string;
}

export default {
  /**
   * 定时任务处理器
   * 当 cron 触发时执行
   * 支持随机延迟执行，避免固定时间触发
   * 最多延迟 10 分钟，为请求超时和登录重试留出执行时间
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        const delayMinutes = getRandomDelay(env);
        console.log('定时签到开始:', JSON.stringify({
          cron: event.cron,
          scheduledTime: event.scheduledTime,
          delayMinutes,
        }));
        if (delayMinutes > 0) await sleep(delayMinutes * 60 * 1000);
        await handleCheckin(env);
      } catch (error) {
        // 显式序列化 message，避免日志只保留 Error 的调用栈。
        console.error('签到失败:', JSON.stringify(describeError(error)));
        // 将失败传给 waitUntil，让 Cron Past Events 记录真实结果。
        throw error;
      }
    })());
  },

  /**
   * HTTP 请求处理器（用于手动触发测试）
   * 可以通过 GET 请求手动触发签到
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    // 如果是 GET 请求，执行签到并返回结果
    if (request.method === 'GET') {
      try {
        const result = await handleCheckin(env);
        return new Response(
          JSON.stringify({
            success: true,
            message: '签到成功',
            data: result,
            timestamp: new Date().toISOString(),
          }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      } catch (error) {
        console.error('签到失败:', JSON.stringify(describeError(error)));
        return new Response(
          JSON.stringify({
            success: false,
            message: '签到失败',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      }
    }

    return new Response('Method not allowed', { status: 405 });
  },
};

/**
 * 获取随机延迟时间（分钟）
 * 默认范围：0-3 分钟（8:00-8:03 之间执行）
 * 可通过环境变量 RANDOM_DELAY_MIN 和 RANDOM_DELAY_MAX 自定义
 */
function getRandomDelay(env: Env): number {
  const parseDelay = (value: string | undefined, fallback: number): number => {
    const delay = value ? Number(value) : fallback;
    if (!Number.isInteger(delay) || delay < 0) {
      throw new ApiError('随机延迟必须是非负整数（分钟）', { stage: 'config', kind: 'config' });
    }
    if (delay > 10) console.warn('随机延迟超过 10 分钟，已限制为 10 分钟');
    return Math.min(delay, 10);
  };
  const min = parseDelay(env.RANDOM_DELAY_MIN, 0);
  const max = parseDelay(env.RANDOM_DELAY_MAX, 3);
  
  // 确保 min <= max
  const actualMin = Math.min(min, max);
  const actualMax = Math.max(min, max);
  
  // 生成随机整数（分钟）
  const delayMinutes = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
  
  return delayMinutes;
}

/**
 * 处理签到逻辑
 */
async function handleCheckin(env: Env): Promise<ApiResponse> {
  const token = await getToken(env);
  const result = await performCheckin(token);
  console.log('签到成功:', JSON.stringify({ code: result.code }));
  return result;
}

/**
 * 获取 token
 * 优先使用环境变量中的 TOKEN，如果没有则自动登录获取
 */
async function getToken(env: Env): Promise<string> {
  // 如果环境变量中已有 token，直接使用
  if (env.TOKEN) {
    return env.TOKEN;
  }

  // 否则自动登录获取 token
  if (!env.PHONE || !env.PASSWORD) {
    throw new ApiError('请设置 PHONE 和 PASSWORD 环境变量，或设置 TOKEN 环境变量', {
      stage: 'config', kind: 'config',
    });
  }

  console.log('开始自动登录...');
  const token = await performLogin(env.PHONE, env.PASSWORD);
  console.log('登录成功，已获取 token');
  return token;
}

/**
 * 计算字符串的 MD5 哈希值
 * 使用 Node.js crypto 模块（需要启用 nodejs_compat）
 */
function md5(text: string): string {
  // @ts-ignore - node:crypto 在 nodejs_compat 模式下可用，但类型定义可能不完整
  const nodeCrypto: any = require('node:crypto');
  return nodeCrypto.createHash('md5').update(text).digest('hex');
}

/**
 * 执行登录请求
 */
async function performLogin(phone: string, password: string): Promise<string> {
  const loginUrl = 'https://www.zhejiangfc1998.com/api/home/Login/doLogin';

  // 密码需要进行 MD5 哈希
  const passwordHash = md5(password);

  // 请求体格式：{email: "", phone: "手机号", pwd: "MD5哈希后的密码"}
  const loginData = {
    email: '',
    phone: phone,
    pwd: passwordHash,
  };

  const data = await requestApi('login', loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.zhejiangfc1998.com/user/login',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(loginData),
  }, { maxAttempts: 3, sensitiveValues: [phone, password, passwordHash] });

  // 从 data.data.token 获取 token
  if (!isObject(data.data) || typeof data.data.token !== 'string' || !data.data.token.trim()) {
    throw new ApiError('登录成功但未找到有效 token', {
      stage: 'login', kind: 'invalid_response', apiCode: data.code,
    });
  }

  return data.data.token;
}

/**
 * 从 token 中解析 user_id
 */
function getUserIdFromToken(token: string): number {
  try {
    // token 是 base64 编码的 JSON
    const decoded = atob(token);
    const payload: TokenPayload = JSON.parse(decoded);
    if (!Number.isSafeInteger(payload?.userId) || payload.userId <= 0) {
      throw new Error('Invalid userId');
    }
    return payload.userId;
  } catch {
    throw new ApiError('无法从 token 中解析有效 user_id', { stage: 'token', kind: 'invalid_response' });
  }
}

/**
 * 执行签到请求
 */
async function performCheckin(token: string): Promise<ApiResponse> {
  const url = 'https://www.zhejiangfc1998.com/api/home/signin/continuous';

  // 从 token 中解析 user_id
  const userId = getUserIdFromToken(token);

  // 请求体格式：{user_id: 用户ID}
  const checkinData = {
    user_id: userId,
  };

  return requestApi('checkin', url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'token': token,
      'Referer': 'https://www.zhejiangfc1998.com/center/sign',
      'Origin': 'https://www.zhejiangfc1998.com',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(checkinData),
  }, { sensitiveValues: [token] });
}
