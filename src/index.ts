/**
 * 浙江FC会员自动签到脚本
 * 每天定时执行签到请求
 * 支持自动登录获取 token
 */

interface Env {
  TOKEN?: string; // 可选的 token（如果设置了则直接使用，否则自动登录）
  PHONE?: string; // 登录手机号
  PASSWORD?: string; // 登录密码（原始密码，会自动进行 MD5 哈希）
}

interface LoginResponse {
  code: number;
  msg: string;
  data: {
    token: string;
    [key: string]: any;
  };
}

export default {
  /**
   * 定时任务处理器
   * 当 cron 触发时执行
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleCheckin(env));
  },

  /**
   * HTTP 请求处理器（用于手动触发测试）
   * 可以通过 GET 请求手动触发签到
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    // 如果是 GET 请求，执行签到并返回结果
    if (request.method === 'GET') {
      try {
        // 获取 token（优先使用环境变量，否则自动登录）
        const token = await getToken(env);
        const result = await performCheckin(token);
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
 * 处理签到逻辑
 */
async function handleCheckin(env: Env): Promise<void> {
  try {
    // 获取 token（优先使用环境变量，否则自动登录）
    const token = await getToken(env);
    const result = await performCheckin(token);
    console.log('签到成功:', JSON.stringify(result));
  } catch (error) {
    console.error('签到失败:', error);
    // 可以在这里添加错误通知逻辑，比如发送到监控服务
  }
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
    throw new Error('请设置 PHONE 和 PASSWORD 环境变量，或设置 TOKEN 环境变量');
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

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://www.zhejiangfc1998.com/user/login',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(loginData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`登录请求失败! status: ${response.status}, response: ${errorText}`);
  }

  const data: LoginResponse = await response.json();

  // 检查登录是否成功（code === 1 表示成功）
  if (data.code !== 1) {
    throw new Error(`登录失败: ${data.msg || '未知错误'}`);
  }

  // 从 data.data.token 获取 token
  if (!data.data?.token) {
    console.error('登录响应:', JSON.stringify(data));
    throw new Error('登录成功但未找到 token');
  }

  return data.data.token;
}

/**
 * 执行签到请求
 */
async function performCheckin(token: string): Promise<any> {
  const url = 'https://www.zhejiangfc1998.com/api/home/User/getRedNews';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'token': token,
      'Referer': 'https://www.zhejiangfc1998.com/center/sign',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`签到请求失败! status: ${response.status}, response: ${errorText}`);
  }

  const data = await response.json();
  
  // 如果返回错误码，抛出错误
  if (data.code && data.code !== 200 && data.code !== 0) {
    throw new Error(`签到失败: ${data.msg || data.message || '未知错误'}`);
  }

  return data;
}
