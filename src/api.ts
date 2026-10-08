type Stage = 'login' | 'checkin' | 'token' | 'config';

interface ErrorDetails {
  stage: Stage;
  kind: 'http' | 'network' | 'timeout' | 'invalid_response' | 'business' | 'config';
  attempt?: number;
  maxAttempts?: number;
  httpStatus?: number;
  apiCode?: number;
  durationMs?: number;
  contentType?: string;
  upstreamRequestId?: string;
}

export interface ApiResponse {
  code: number;
  msg?: string;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly details: ErrorDetails,
    readonly retryable = false,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redact(message: string, sensitiveValues: readonly string[]): string {
  // 长值先替换，避免密码等短值恰好是另一个敏感值的子串。
  let result = message;
  for (const value of [...sensitiveValues].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(value).join('[REDACTED]');
  }
  return result.slice(0, 500);
}

export function describeError(error: unknown): Record<string, unknown> {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof ApiError ? error.details : {}),
  };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * 请求超时覆盖读取响应体。只重试临时故障，不重试业务失败。
 * maxAttempts 默认 1；登录可以重试，签到 POST 保持单次发送。
 */
export async function requestApi(
  stage: 'login' | 'checkin',
  url: string,
  init: RequestInit,
  options: { maxAttempts?: number; sensitiveValues?: readonly string[] } = {}
): Promise<ApiResponse> {
  const maxAttempts = options.maxAttempts ?? 1;
  const sensitiveValues = options.sensitiveValues ?? [];
  const label = stage === 'login' ? '登录' : '签到';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response | undefined;
    let failure: ApiError;

    const details = (kind: ErrorDetails['kind']): ErrorDetails => ({
      stage,
      kind,
      attempt,
      maxAttempts,
      durationMs: Date.now() - startedAt,
      ...(response ? {
        httpStatus: response.status,
        contentType: response.headers.get('content-type') ?? '',
        upstreamRequestId: response.headers.get('cf-ray') ?? response.headers.get('x-request-id') ?? '',
      } : {}),
    });

    try {
      response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        // HTML 错误页和 JSON 解析异常可能包含敏感信息，不输出原始响应体。
      }
      const apiCode = isObject(data) && typeof data.code === 'number' ? data.code : undefined;
      const message = isObject(data)
        ? (typeof data.msg === 'string' ? data.msg : typeof data.message === 'string' ? data.message : '')
        : '';

      if (!response.ok) {
        throw new ApiError(
          redact(`${label}请求失败 (HTTP ${response.status})${message ? `: ${message}` : ''}`, sensitiveValues),
          { ...details('http'), apiCode },
          retryableStatus(response.status),
          retryAfterMs(response.headers.get('retry-after'))
        );
      }

      if (!isObject(data) || apiCode === undefined || !Number.isFinite(apiCode)) {
        throw new ApiError(
          `${label}接口返回无效响应（预期含 code 的 JSON 对象）`,
          details('invalid_response')
        );
      }

      // 官网登录、签到页面均以 code === 1 判断成功。
      if (apiCode !== 1) {
        throw new ApiError(
          redact(`${label}失败: ${message || '未知错误'} (code: ${apiCode})`, sensitiveValues),
          { ...details('business'), apiCode }
        );
      }

      console.log('接口响应:', JSON.stringify({ ...details('http'), apiCode }));
      return data as ApiResponse;
    } catch (error) {
      failure = error instanceof ApiError ? error : new ApiError(
        controller.signal.aborted
          ? `${label}请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`
          : redact(`${label}网络请求失败: ${error instanceof Error ? error.message : String(error)}`, sensitiveValues),
        details(controller.signal.aborted ? 'timeout' : 'network'),
        response?.ok !== false || retryableStatus(response.status),
        response ? retryAfterMs(response.headers.get('retry-after')) : undefined
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!failure.retryable || attempt === maxAttempts) throw failure;

    // 不在服务端要求更长等待时提前重试，避免加重限流。
    if (failure.retryAfterMs !== undefined && failure.retryAfterMs > MAX_RETRY_DELAY_MS) throw failure;
    const delayMs = Math.max(
      2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000),
      failure.retryAfterMs ?? 0
    );
    console.warn('接口重试:', JSON.stringify({ ...describeError(failure), delayMs }));
    await sleep(delayMs);
  }

  throw new Error('请求尝试次数必须大于 0');
}
