# 浙江FC会员自动签到脚本

这是一个基于 Cloudflare Workers 的自动签到脚本，每天定时执行浙江FC会员签到。

## 功能特性

- ✅ 每天自动执行签到
- ✅ **自动登录获取 token**（无需手动设置 token）
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

### 2. 配置登录信息

脚本支持两种方式获取 token：

#### 方式一：自动登录（推荐）✨

使用用户名和密码自动登录获取 token，无需手动获取和更新 token。

使用 Wrangler CLI 设置环境变量：

```bash
# 设置手机号
npx wrangler secret put PHONE
# 然后输入你的登录手机号（例如：15637697693）

# 设置密码（原始密码，脚本会自动进行 MD5 哈希）
npx wrangler secret put PASSWORD
# 然后输入你的登录密码（原始密码，不是 MD5 哈希后的）
```

或者在 Cloudflare Dashboard 中设置：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 选择你的 Worker
4. 进入 Settings > Variables
5. 添加环境变量：
   - `PHONE`: 你的登录手机号（例如：15637697693）
   - `PASSWORD`: 你的登录密码（原始密码，脚本会自动进行 MD5 哈希）

**注意**：
- 密码会自动进行 MD5 哈希处理，你只需要输入原始密码即可
- 登录 API 已配置为实际的接口地址，无需修改
- 如果登录失败，请检查手机号和密码是否正确

#### 方式二：手动设置 Token（备选）

如果你不想使用自动登录，也可以手动设置 TOKEN：

```bash
npx wrangler secret put TOKEN
# 然后输入你的 token 值
```

如果同时设置了 TOKEN 和 USERNAME/PASSWORD，脚本会优先使用 TOKEN。

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

## 技术说明

### 登录 API 配置

登录接口已配置为：
- **URL**: `https://www.zhejiangfc1998.com/api/home/Login/doLogin`
- **请求格式**: `{email: "", phone: "手机号", pwd: "MD5哈希后的密码"}`
- **响应格式**: `{code: 1, msg: "登陆成功", data: {token: "..."}}`

### MD5 哈希

脚本使用 Node.js crypto 模块进行密码 MD5 哈希，需要在 `wrangler.toml` 中启用 `nodejs_compat` 兼容标志（已配置）。

### 环境变量

- `PHONE`: 登录手机号（必填，如果使用自动登录）
- `PASSWORD`: 登录密码，原始密码（必填，如果使用自动登录）
- `TOKEN`: 可选的 token（如果设置了则直接使用，跳过自动登录）

## 获取 Token（手动方式，如不使用自动登录）

如果使用手动设置 TOKEN 的方式：

1. 登录 [浙江FC官网](https://www.zhejiangfc1998.com/)
2. 打开浏览器开发者工具（F12）
3. 进入签到页面：https://www.zhejiangfc1998.com/center/sign
4. 在 Network 标签中找到 `getRedNews` 请求
5. 复制请求头中的 `token` 值

## 注意事项

1. **自动登录**：使用自动登录功能时，每次签到前都会自动登录获取最新 token，无需担心 token 过期问题
2. **密码处理**：密码会自动进行 MD5 哈希，你只需要输入原始密码即可
3. **时区设置**：Cloudflare Workers 使用 UTC 时间，请根据你的需求调整 cron 时间
4. **免费额度**：Cloudflare Workers 免费版每天有 100,000 次请求额度，对于每日签到完全够用
5. **错误处理**：脚本包含基本的错误处理，但建议定期检查日志确保正常运行
6. **安全性**：手机号和密码存储在 Cloudflare Workers 的环境变量中，使用加密存储，相对安全
7. **Node.js 兼容性**：脚本使用了 Node.js crypto 模块，需要在 `wrangler.toml` 中启用 `nodejs_compat`（已配置）

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
