# REST API

[← 返回目录](README.md) · [English](../en/api.md) · [Русский](../ru/api.md)

---

面板所做的一切都是 `/api` 下的 REST 调用。同一套 API 也可供你自己的工具使用。

**交互式文档**由运行中的后端生成：

| | 地址 |
| --- | --- |
| Swagger UI | `https://panel.example.com/api/swagger` |
| OpenAPI schema | `https://panel.example.com/api/openapi` |

OpenAPI schema 具有权威性 —— 本页只提供导览。

## 认证

两类凭据访问同一批接口。

### 会话令牌

```bash
curl -sX POST https://panel.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin@example.com","password":"…","code":"123456"}'
```

`code` 是 TOTP 验证码，仅在启用两步验证时需要。响应中会返回一个令牌，
后续每次请求都需带上它：

```bash
curl https://panel.example.com/api/domains \
  -H "Authorization: Bearer $TOKEN"
```

会话保存在 `auth_session` 表中，通过 `/api/auth/logout` 结束。会话是给面板用的；
自动化请使用 API 密钥。

### API 密钥

在 **设置 → API 密钥** 中创建。密钥形如 `rvx_live_<随机串>`，且**只显示一次** ——
系统只存储 BCrypt 哈希和末四位字符，事后无法找回。

```bash
curl https://panel.example.com/api/domains \
  -H "Authorization: Bearer rvx_live_…"
```

任何曾出现在聊天记录、工单或截图中的密钥，都应立即轮换。

### 公开接口

以下无需凭据：`/api/auth/login`、`/api/auth/status`、追踪像素与点击接口，
以及 `/.well-known/*`。其余接口在没有有效令牌时返回 `401`。

## 发送事务性邮件

多数人最需要的接口。使用 API 密钥认证：

```bash
curl -sX POST https://panel.example.com/api/send \
  -H "Authorization: Bearer rvx_live_…" \
  -H 'Content-Type: application/json' \
  -d '{
        "from":    "noreply@example.com",
        "to":      "recipient@example.org",
        "subject": "您的收据",
        "html":    "<p>感谢您的订购。</p>",
        "text":    "感谢您的订购。"
      }'
```

请在提供 `html` 的同时提供 `text`。缺少纯文本备选版本的邮件，在所有会检查这一点的
垃圾邮件过滤器中得分都更差。

发信域名必须已存在于 Ravix 中并配置了 DKIM，否则邮件将以未签名状态发出 —— 参见
[DNS 与送达率](dns-deliverability.md)。在接入生产环境之前，请在 Swagger UI 中
核对确切的请求与响应结构。

## 资源清单

以下路径均相对于 `/api`。

### 身份与访问

| 资源 | 接口 |
| --- | --- |
| 认证 | `/auth/login`、`/auth/logout`、`/auth/status`、`/auth/me`、`/auth/password`、`/auth/2fa/*` |
| 管理员 | `/admin-users` |
| API 密钥 | `/api-keys` |
| 组织 | `/organizations` |
| 审计日志 | `/audit` |

### 邮件对象

| 资源 | 接口 |
| --- | --- |
| 域名 | `/domains`、`/domains/{id}`、`/domains/{id}/recheck` |
| 邮箱 | `/mailboxes`、`/mailboxes/{id}`，配额 / 启停 / 密码等操作 |
| 别名 | `/aliases` |
| 过滤器 | `/mail-filters` |
| 签名 | `/mail-signatures` |
| Webmail | `/mailboxes/{id}/folders`、`/mailboxes/{id}/messages`、`/messages/{id}` 操作 |

### 送达率

| 资源 | 接口 |
| --- | --- |
| DMARC | `/dmarc/*` |
| TLS 安全 | `/tls-security/*` |
| RBL | `/rbl/*` |
| 信誉 | `/reputation`、`/reputation/warmup`、`/reputation/complaints` |
| 收件箱送达 | `/inbox-placement/*` |
| 邮件就绪度 | `/mail-readiness` |
| 送达率参考数据 | `/deliverability` |

### 运维

| 资源 | 接口 |
| --- | --- |
| 仪表盘 | `/dashboard` |
| 队列 | `/queue`、`/queue/summary`，重试 / 保留 / 删除操作 |
| 日志 | `/logs` |
| 备份 | `/backups` |
| 系统 | `/system` |
| 平台 | `/platform/components`、`/platform/apply`、`/platform/config` |
| 证书 | `/certificates`，续期操作 |
| Doctor | `/doctor` |
| 任务 | `/tasks` |
| 设置 | `/settings` |
| 服务 / 事件 | `/services`、`/events` |

### 营销活动

| 资源 | 接口 |
| --- | --- |
| 活动 | `/campaigns`、`/campaigns/{id}`，操作与收件人 |
| 模板 | `/templates` |
| 分群 | `/segments` |
| 追踪 | `/tracking/*` |

### 集成

| 资源 | 接口 |
| --- | --- |
| Cloudflare | `/cloudflare/*` — 令牌管理与 DNS 记录推送 |
| 服务商 | `/providers` |
| 中继 | `/relay` |
| Radicale | `/radicale` |

## 多租户

带 `@OrgFiltered` 注解的资源会由 `OrgFilterInterceptor` 限定在调用者所属组织范围内。
超级管理员可见全部内容。参见[多租户](multi-tenant.md)。

## 自动化之前需要知道的

- **结果集有上限，但并非完整分页。** `/messages` 接受 `offset`/`limit`（默认 50），
  `/audit` 接受 `limit`（默认 200，最大 500）。`/logs` 与 `/queue` 返回按时间倒序的
  有限切片，而非游标分页 —— 不要假设可以遍历整个队列。
- **`/auth/login` 有频率限制。** 五分钟内同一用户名失败 5 次、或同一 IP 失败 20 次，
  将锁定 15 分钟，返回 `429` 与 `Retry-After`。请遵守该响应头，不要盲目重试。
  成功登录会清空计数。
- **自动化请优先使用 API 密钥**而非密码登录：密钥不经过 `/auth/login`，
  因此不受登录限流影响。
- **CORS 放行同源以及配置列表中的来源。** 若你从其他来源的浏览器调用 API，
  请将其加入 `RAVIX_CORS_ORIGINS`；参见[安全](security.md)。
- **这是 0.1 预发布版本。** 接口结构可能在版本之间变化。请锁定版本，
  并在升级任何依赖该 API 的组件前阅读发布说明。
