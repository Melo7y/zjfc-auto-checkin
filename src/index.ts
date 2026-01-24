/**
 * 浙江FC会员自动签到脚本
 * 每天定时执行签到请求
 */

interface Env {
  TOKEN: string; // 从环境变量中获取的 token
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
        const result = await performCheckin(env.TOKEN);
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
    if (!env.TOKEN) {
      console.error('TOKEN 环境变量未设置');
      return;
    }

    const result = await performCheckin(env.TOKEN);
    console.log('签到成功:', JSON.stringify(result));
  } catch (error) {
    console.error('签到失败:', error);
    // 可以在这里添加错误通知逻辑，比如发送到监控服务
  }
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
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}
