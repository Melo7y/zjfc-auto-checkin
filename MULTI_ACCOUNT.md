# 多账户配置指南

## 方案一：创建多个 Worker（推荐）⭐

为每个账户创建独立的 Worker，每个 Worker 有独立的环境变量和配置。

### 步骤 1: 复制项目或创建新 Worker

#### 方式 A: 在同一项目中创建多个 Worker

修改 `wrangler.toml`，使用环境配置：

```toml
name = "zhejiangfc-checkin"
main = "src/index.ts"
compatibility_date = "2024-11-06"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 0 * * *"]

# 账户1配置
[env.account1]
name = "zhejiangfc-checkin-account1"

# 账户2配置
[env.account2]
name = "zhejiangfc-checkin-account2"

# 账户3配置
[env.account3]
name = "zhejiangfc-checkin-account3"
```

#### 方式 B: 创建多个独立的 Worker（更推荐）

为每个账户创建独立的 Worker：

```bash
# 账户1
npx wrangler deploy --name zhejiangfc-checkin-account1

# 账户2
npx wrangler deploy --name zhejiangfc-checkin-account2

# 账户3
npx wrangler deploy --name zhejiangfc-checkin-account3
```

### 步骤 2: 为每个 Worker 设置独立的环境变量

```bash
# 账户1的环境变量
npx wrangler secret put PHONE --name zhejiangfc-checkin-account1
npx wrangler secret put PASSWORD --name zhejiangfc-checkin-account1

# 账户2的环境变量
npx wrangler secret put PHONE --name zhejiangfc-checkin-account2
npx wrangler secret put PASSWORD --name zhejiangfc-checkin-account2

# 账户3的环境变量
npx wrangler secret put PHONE --name zhejiangfc-checkin-account3
npx wrangler secret put PASSWORD --name zhejiangfc-checkin-account3
```

### 步骤 3: 部署每个 Worker

```bash
# 部署账户1
npx wrangler deploy --name zhejiangfc-checkin-account1

# 部署账户2
npx wrangler deploy --name zhejiangfc-checkin-account2

# 部署账户3
npx wrangler deploy --name zhejiangfc-checkin-account3
```

**优点**：
- ✅ 简单直接，每个账户独立
- ✅ 互不影响，一个账户出问题不影响其他
- ✅ 可以单独管理每个账户的配置
- ✅ 可以设置不同的执行时间

**缺点**：
- ❌ 需要部署多个 Worker
- ❌ 代码重复（但可以共享代码）

---

## 方案二：使用 Worker Environments（中等复杂度）

使用一个 Worker，但创建多个环境（environments），每个环境有独立的环境变量。

### 步骤 1: 修改 wrangler.toml

```toml
name = "zhejiangfc-checkin"
main = "src/index.ts"
compatibility_date = "2024-11-06"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 0 * * *"]

# 账户1环境
[env.account1]
name = "zhejiangfc-checkin-account1"

[env.account1.triggers]
crons = ["0 0 * * *"]

# 账户2环境
[env.account2]
name = "zhejiangfc-checkin-account2"

[env.account2.triggers]
crons = ["0 0 * * *"]

# 账户3环境
[env.account3]
name = "zhejiangfc-checkin-account3"

[env.account3.triggers]
crons = ["0 0 * * *"]
```

### 步骤 2: 为每个环境设置环境变量

```bash
# 账户1
npx wrangler secret put PHONE --env account1
npx wrangler secret put PASSWORD --env account1

# 账户2
npx wrangler secret put PHONE --env account2
npx wrangler secret put PASSWORD --env account2

# 账户3
npx wrangler secret put PHONE --env account3
npx wrangler secret put PASSWORD --env account3
```

### 步骤 3: 部署每个环境

```bash
# 部署账户1
npx wrangler deploy --env account1

# 部署账户2
npx wrangler deploy --env account2

# 部署账户3
npx wrangler deploy --env account3
```

**优点**：
- ✅ 共享同一份代码
- ✅ 每个环境独立配置
- ✅ 便于统一管理

**缺点**：
- ❌ 配置稍复杂
- ❌ 需要记住环境名称

---

## 方案三：修改代码支持多账户（最灵活）

修改代码，支持在一个 Worker 中处理多个账户。

### 步骤 1: 修改代码支持账户列表

创建 `src/index-multi.ts`（多账户版本）：

```typescript
interface Account {
  phone: string;
  password: string;
}

interface Env {
  ACCOUNTS: string; // JSON 格式的账户列表
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleMultipleCheckins(env));
  },
  
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET') {
      try {
        const results = await handleMultipleCheckins(env);
        return new Response(JSON.stringify({
          success: true,
          message: '批量签到完成',
          results: results,
          timestamp: new Date().toISOString(),
        }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          message: '批量签到失败',
          error: error instanceof Error ? error.message : String(error),
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }
    return new Response('Method not allowed', { status: 405 });
  },
};

async function handleMultipleCheckins(env: Env): Promise<any[]> {
  const accounts: Account[] = JSON.parse(env.ACCOUNTS);
  const results = [];
  
  for (const account of accounts) {
    try {
      console.log(`开始处理账户: ${account.phone}`);
      const token = await performLogin(account.phone, account.password);
      const result = await performCheckin(token);
      results.push({
        phone: account.phone,
        success: true,
        data: result,
      });
      console.log(`账户 ${account.phone} 签到成功`);
    } catch (error) {
      console.error(`账户 ${account.phone} 签到失败:`, error);
      results.push({
        phone: account.phone,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  
  return results;
}

// ... 其他函数保持不变
```

### 步骤 2: 设置环境变量

```bash
# 设置账户列表（JSON 格式）
npx wrangler secret put ACCOUNTS
# 输入内容（一行）：
# [{"phone":"13800138000","password":"password1"},{"phone":"13800138001","password":"password2"}]
```

**优点**：
- ✅ 一个 Worker 管理所有账户
- ✅ 统一执行时间
- ✅ 便于批量管理

**缺点**：
- ❌ 需要修改代码
- ❌ 一个账户失败可能影响其他账户的处理
- ❌ 环境变量存储敏感信息（虽然加密）

---

## 推荐方案对比

| 方案 | 复杂度 | 隔离性 | 管理难度 | 推荐度 |
|------|--------|--------|----------|--------|
| 方案一：多个 Worker | ⭐ 简单 | ⭐⭐⭐ 最好 | ⭐ 简单 | ⭐⭐⭐⭐⭐ |
| 方案二：Environments | ⭐⭐ 中等 | ⭐⭐ 中等 | ⭐⭐ 中等 | ⭐⭐⭐⭐ |
| 方案三：代码多账户 | ⭐⭐⭐ 复杂 | ⭐ 较差 | ⭐⭐⭐ 复杂 | ⭐⭐⭐ |

## 推荐使用方案一

**原因**：
1. 最简单直接
2. 每个账户完全独立，互不影响
3. 可以设置不同的执行时间
4. 便于单独调试和管理
5. Cloudflare Workers 免费版支持多个 Worker

## 快速开始（方案一）

```bash
# 1. 为账户1创建 Worker
npx wrangler deploy --name zhejiangfc-checkin-account1

# 2. 设置账户1的环境变量
npx wrangler secret put PHONE --name zhejiangfc-checkin-account1
npx wrangler secret put PASSWORD --name zhejiangfc-checkin-account1

# 3. 为账户2创建 Worker
npx wrangler deploy --name zhejiangfc-checkin-account2

# 4. 设置账户2的环境变量
npx wrangler secret put PHONE --name zhejiangfc-checkin-account2
npx wrangler secret put PASSWORD --name zhejiangfc-checkin-account2

# 重复以上步骤为其他账户创建 Worker
```

## 管理多个 Worker

### 查看所有 Worker

```bash
npx wrangler deployments list
```

### 更新代码（所有 Worker 共享代码）

修改代码后，需要重新部署每个 Worker：

```bash
npx wrangler deploy --name zhejiangfc-checkin-account1
npx wrangler deploy --name zhejiangfc-checkin-account2
# ...
```

### 查看特定 Worker 的日志

```bash
npx wrangler tail --name zhejiangfc-checkin-account1
```

### 删除 Worker

```bash
npx wrangler delete zhejiangfc-checkin-account1
```

## 注意事项

1. **免费额度**：Cloudflare Workers 免费版支持多个 Worker，每个 Worker 每天 100,000 次请求
2. **命名规范**：建议使用统一的命名规范，如 `zhejiangfc-checkin-account1`、`zhejiangfc-checkin-account2`
3. **代码同步**：如果修改了代码，需要重新部署所有 Worker
4. **环境变量**：每个 Worker 的环境变量是独立的，需要单独设置
