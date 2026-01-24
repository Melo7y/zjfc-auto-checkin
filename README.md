# 浙江FC会员自动签到脚本

这是一个基于 Cloudflare Workers 的自动签到脚本，每天定时执行浙江FC会员签到。支持自动登录获取 token，无需手动维护 token。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

## ✨ 功能特性

- ✅ **自动登录**：每次签到前自动登录获取最新 token，无需担心 token 过期
- ✅ **定时执行**：支持 Cron 定时任务，每天自动签到
- ✅ **手动触发**：支持通过 HTTP 请求手动触发签到测试
- ✅ **密码加密**：自动对密码进行 MD5 哈希处理
- ✅ **TypeScript**：使用 TypeScript 编写，类型安全
- ✅ **免费部署**：部署在 Cloudflare Workers，免费额度充足

## 📁 项目结构

```
zhejiangfc-checkin/
├── src/
│   └── index.ts          # 主程序文件
├── package.json          # 项目依赖配置
├── wrangler.toml         # Cloudflare Workers 配置
├── tsconfig.json         # TypeScript 配置
├── .gitignore           # Git 忽略文件
└── README.md             # 项目说明文档
```

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- Cloudflare 账号（[免费注册](https://dash.cloudflare.com/sign-up)）

### 5分钟快速部署

```bash
# 1. 安装依赖
npm install

# 2. 登录 Cloudflare（首次需要）
npx wrangler login

# 3. 设置环境变量
npx wrangler secret put PHONE    # 输入你的手机号
npx wrangler secret put PASSWORD # 输入你的原始密码

# 4. 部署
npm run deploy
```

完成！脚本已部署到 Cloudflare Workers，每天会自动执行签到。

## 📖 详细部署步骤

### 步骤 1: 安装依赖

```bash
npm install
```

### 步骤 2: 登录 Cloudflare

首次使用需要授权 Wrangler 访问你的 Cloudflare 账号：

```bash
npx wrangler login
```

这会打开浏览器，点击授权即可。

### 步骤 3: 配置环境变量

#### 方式一：自动登录（推荐）✨

使用手机号和密码自动登录，脚本会自动获取 token：

```bash
# 设置手机号
npx wrangler secret put PHONE
# 输入提示后，输入你的手机号（例如：15637697693）

# 设置密码
npx wrangler secret put PASSWORD
# 输入提示后，输入你的原始密码（脚本会自动进行 MD5 哈希）
```

**注意**：
- 密码输入时不会显示（安全特性）
- 输入原始密码即可，脚本会自动进行 MD5 哈希处理
- 这些密钥会加密存储在 Cloudflare 中

#### 方式二：手动设置 Token（备选）

如果你不想使用自动登录，也可以手动设置 TOKEN：

```bash
npx wrangler secret put TOKEN
# 输入你的 token 值
```

如果同时设置了 TOKEN 和 PHONE/PASSWORD，脚本会优先使用 TOKEN。

### 步骤 4: 配置定时任务（可选）

编辑 `wrangler.toml` 文件，修改 cron 表达式：

```toml
# 默认：每天 UTC 0:00（北京时间 8:00）
# 代码会自动添加 0-3 分钟的随机延迟，实际执行时间在 8:00-8:03 之间随机
[triggers]
crons = ["0 0 * * *"]
```

**常用时间配置**：

| Cron 表达式 | 说明 | 北京时间 |
|------------|------|---------|
| `0 0 * * *` | 每天 0:00 | 每天 8:00-8:03（随机） |
| `0 8 * * *` | 每天 8:00 | 每天 16:00-16:03（随机） |
| `0 0 * * 1` | 每周一 0:00 | 每周一 8:00-8:03（随机） |

**时区说明**：Cloudflare Workers 使用 UTC 时间，北京时间 = UTC + 8

**随机延迟**：
- 默认在 cron 时间后随机延迟 0-3 分钟执行（8:00-8:03 之间随机）
- 可通过环境变量自定义延迟范围：
  ```bash
  npx wrangler secret put RANDOM_DELAY_MIN  # 最小延迟（分钟），默认 0
  npx wrangler secret put RANDOM_DELAY_MAX  # 最大延迟（分钟），默认 3
  ```
- 例如：设置 `RANDOM_DELAY_MIN=5` 和 `RANDOM_DELAY_MAX=15`，则会在 8:05-8:15 之间随机执行

### 步骤 5: 本地测试（推荐）

在部署前先本地测试：

```bash
npm run dev
```

**创建本地环境变量文件** `.dev.vars`：

```
PHONE=你的手机号
PASSWORD=你的密码
```

然后在浏览器访问 `http://localhost:8787` 测试。

### 步骤 6: 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后，你会看到 Worker URL，例如：
```
https://zhejiangfc-checkin.your-subdomain.workers.dev
```

## 🎯 使用方法

### 自动签到

部署后，脚本会根据 `wrangler.toml` 中配置的 cron 表达式自动执行。

### 手动触发

访问你的 Worker URL 来手动触发签到：

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

### 查看日志

```bash
npx wrangler tail
```

这会实时显示 Worker 的执行日志，包括登录和签到的详细信息。

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 必填 | 示例 |
|--------|------|------|------|
| `PHONE` | 登录手机号 | 是（自动登录时） | `15637697693` |
| `PASSWORD` | 登录密码（原始密码） | 是（自动登录时） | `yourpassword` |
| `TOKEN` | 手动设置的 token | 否 | `eyJ1c2VySWQ...` |
| `RANDOM_DELAY_MIN` | 随机延迟最小值（分钟） | 否 | `0`（默认） |
| `RANDOM_DELAY_MAX` | 随机延迟最大值（分钟） | 否 | `3`（默认） |

### 更新环境变量

```bash
# 更新手机号
npx wrangler secret put PHONE

# 更新密码
npx wrangler secret put PASSWORD

# 删除环境变量
npx wrangler secret delete PHONE
```

### 通过 Dashboard 配置

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** > 选择你的 Worker
3. 进入 **Settings** > **Variables**
4. 添加或修改环境变量

**注意**：Dashboard 中的环境变量是明文存储的，使用 `wrangler secret put` 更安全（加密存储）。

## 🔧 技术说明

### 登录 API

- **URL**: `https://www.zhejiangfc1998.com/api/home/Login/doLogin`
- **请求格式**: `{email: "", phone: "手机号", pwd: "MD5哈希后的密码"}`
- **响应格式**: `{code: 1, msg: "登陆成功", data: {token: "..."}}`

### 签到 API

- **URL**: `https://www.zhejiangfc1998.com/api/home/User/getRedNews`
- **方法**: POST
- **Headers**: `token: "..."`

### MD5 哈希

脚本使用 Node.js crypto 模块进行密码 MD5 哈希，需要在 `wrangler.toml` 中启用 `nodejs_compat` 兼容标志（已配置）。

### Node.js 兼容性

项目使用了 Node.js crypto 模块，需要在 `wrangler.toml` 中配置：

```toml
compatibility_flags = ["nodejs_compat"]
```

## 📝 开发

### 本地开发

```bash
npm run dev
```

访问 `http://localhost:8787` 进行测试。

### 查看日志

```bash
# 实时日志
npx wrangler tail

# 格式化日志
npx wrangler tail --format pretty
```

### 更新代码

修改代码后：

```bash
npm run deploy
```

## ❓ 常见问题

### Q: 部署失败，提示 "Authentication error"

**解决方案**：
```bash
npx wrangler login
```
重新登录 Cloudflare。

### Q: 提示 "Cannot find module 'node:crypto'"

**解决方案**：
确保 `wrangler.toml` 中有：
```toml
compatibility_flags = ["nodejs_compat"]
```

### Q: 本地测试失败，提示环境变量未设置

**解决方案**：
创建 `.dev.vars` 文件：
```
PHONE=你的手机号
PASSWORD=你的密码
```

### Q: 登录失败，提示 "登录失败: xxx"

**可能原因**：
1. 手机号或密码错误
2. 账号被锁定
3. API 接口变更

**解决方案**：
1. 检查手机号和密码是否正确
2. 尝试在浏览器中手动登录确认账号正常
3. 查看日志获取详细错误信息：`npx wrangler tail`

### Q: 定时任务没有执行

**检查步骤**：
1. 确认 cron 配置正确：`cat wrangler.toml | grep cron`
2. 在 Dashboard 中检查：Workers & Pages > 你的 Worker > Triggers
3. 查看日志：`npx wrangler tail`
4. 注意时区：Cloudflare 使用 UTC 时间

### Q: 免费额度够用吗？

**Cloudflare Workers 免费版限制**：
- 每天 100,000 次请求
- 每次请求 CPU 时间限制：10ms（免费版）

**对于签到脚本**：
- 每天执行 1-2 次（登录 + 签到）
- 完全在免费额度内

## 📄 许可证

MIT

## 🙏 致谢

感谢 Cloudflare Workers 提供的免费服务。
