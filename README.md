# 浙江FC会员自动签到脚本

这是一个基于 Cloudflare Workers 的自动签到脚本，每天定时执行浙江FC会员签到。

## 功能特性

- ✅ 每天自动执行签到
- ✅ 支持手动触发测试
- ✅ 使用 TypeScript 编写
- ✅ 部署在 Cloudflare Workers（免费额度充足）

## 项目结构

```
zhejiangfc-checkin/
├── src/
│   └── index.ts          # 主程序文件
├── package.json          # 项目依赖配置
├── wrangler.toml         # Cloudflare Workers 配置
├── tsconfig.json         # TypeScript 配置
└── README.md             # 项目说明文档
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Token

有两种方式设置 TOKEN 环境变量：

#### 方式一：使用 Wrangler CLI（推荐）

```bash
npx wrangler secret put TOKEN
# 然后输入你的 token 值
```

#### 方式二：在 Cloudflare Dashboard 中设置

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 选择你的 Worker
4. 进入 Settings > Variables
5. 添加环境变量 `TOKEN`，值为你的 token

### 3. 配置定时任务

编辑 `wrangler.toml` 文件中的 `triggers.cron` 来设置执行时间：

```toml
triggers = { cron = ["0 0 * * *"] }  # 每天 UTC 0:00（北京时间 8:00）
```

Cron 格式说明：
- `0 0 * * *` - 每天 UTC 0:00
- `0 8 * * *` - 每天 UTC 8:00（北京时间 16:00）
- `0 0 * * 1` - 每周一 UTC 0:00

**注意**：Cloudflare Workers 使用 UTC 时间，北京时间 = UTC + 8

### 4. 本地测试

```bash
npm run dev
```

然后在浏览器访问 `http://localhost:8787` 来手动触发签到测试。

### 5. 部署到 Cloudflare Workers

```bash
npm run deploy
```

首次部署需要登录 Cloudflare：

```bash
npx wrangler login
```

## 使用方法

### 自动签到

部署后，脚本会根据 `wrangler.toml` 中配置的 cron 表达式自动执行。

### 手动触发

部署后，你可以通过访问 Worker 的 URL 来手动触发签到：

```
https://your-worker-name.your-subdomain.workers.dev
```

返回的 JSON 格式：

```json
{
  "success": true,
  "message": "签到成功",
  "data": { ... },
  "timestamp": "2024-01-24T08:00:00.000Z"
}
```

## 获取 Token

1. 登录 [浙江FC官网](https://www.zhejiangfc1998.com/)
2. 打开浏览器开发者工具（F12）
3. 进入签到页面：https://www.zhejiangfc1998.com/center/sign
4. 在 Network 标签中找到 `getRedNews` 请求
5. 复制请求头中的 `token` 值

## 注意事项

1. **Token 有效期**：Token 可能会过期，如果签到失败，请检查 token 是否仍然有效
2. **时区设置**：Cloudflare Workers 使用 UTC 时间，请根据你的需求调整 cron 时间
3. **免费额度**：Cloudflare Workers 免费版每天有 100,000 次请求额度，对于每日签到完全够用
4. **错误处理**：脚本包含基本的错误处理，但建议定期检查日志确保正常运行

## 开发

### 本地开发

```bash
npm run dev
```

### 查看日志

```bash
npx wrangler tail
```

## 许可证

MIT
