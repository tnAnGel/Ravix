# 架构

[← 返回目录](README.md) · [English](../en/architecture.md) · [Русский](../ru/architecture.md)

---

## 系统全貌

```text
                    ┌──────────────────────────────────────────┐
   浏览器 ─────────▶│  Nginx  :9162                            │
                    │    /       → /var/www/ravix  (Vite dist) │
                    │    /api/   → 127.0.0.1:8080              │
                    └───────────────────┬──────────────────────┘
                                        │
                             ┌──────────▼───────────┐
                             │  Quarkus 后端        │
                             │  sh.ravix.*          │
                             └──┬────────────────┬──┘
                                │                │
                  ┌─────────────▼──┐    ┌────────▼──────────────────────┐
                  │  PostgreSQL    │    │  Linux 主机                   │
                  │  schema:ravix  │    │  systemd · apt · postmap      │
                  │  由 Flyway 掌管│    │  /etc/postfix · /etc/dovecot  │
                  └────────────────┘    │  DNS · certbot · 日志文件     │
                                        └───────────────────────────────┘
```

Ravix **不是**邮件服务器。它是一个控制平面，掌管运行在同一主机上的邮件服务器的
配置与可观测性。

## 组件

| 层次 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Tailwind、shadcn 风格组件、i18next |
| 后端 | Java 21、Quarkus 3、Hibernate ORM Panache、Flyway |
| 数据库 | PostgreSQL 14+ |
| 受管邮件栈 | Postfix、Dovecot、Rspamd、Redis、OpenDKIM、Certbot、Nginx、Radicale |

## 后端包结构

后端代码全部位于 `sh.ravix` 之下：

| 包 | 职责 |
| --- | --- |
| `auth` | 认证、会话、TOTP 两步验证、BCrypt 哈希、角色校验、审计过滤器、租户上下文。 |
| `entity` | Panache 实体 — 持久化模型。 |
| `dto` | 非实体的响应结构。 |
| `rest` | JAX-RS 资源；每个领域概念一个，全部挂载在 `/api` 下。 |
| `platform` | 一切与外部世界交互的部分：主机配置下发、DNS 查询、DKIM 密钥、证书、队列、营销活动、DMARC/FBL/RBL 扫描器、Cloudflare。 |
| `util` | 少量共享辅助工具（ID 生成）。 |

真正的复杂度集中在 `platform`。`ProvisioningService` 是代码库中最大的单个类，
这是有原因的：它把数据库状态渲染成整套邮件栈配置。

## 请求生命周期

1. Nginx 终结 TLS，并将 `/api/` 代理到 `127.0.0.1:8080`。
2. `AuthFilter` 识别调用者 —— 先看 `ravix_session` Cookie，再看
   `Authorization: Bearer` 请求头 —— 通过 `AuthService` 解析为 `AdminUser`，
   并拒绝所有未认证请求 —— 除了一小份公开路径白名单
   （`/api/auth/login`、`/api/auth/status`、追踪像素、`.well-known`）。
3. `OrgFilterInterceptor` 对带 `@OrgFiltered` 注解的资源施加租户范围限制，
   依据是已解析用户所属的组织 — 参见[多租户](multi-tenant.md)。
4. `AuditFilter` 将变更类请求记入 `audit_log`。
5. 资源方法执行，通常读取 Panache 实体，有时调用 `platform` 中的服务与主机交互。

## 会话与 API 密钥

两类凭据访问同一套 API：

- **会话令牌** — 由 `/api/auth/login` 签发，存于 `auth_session` 表，并以
  `HttpOnly`、`SameSite=Strict` 的 Cookie 形式返回给浏览器；响应体中同样包含该
  令牌，供非浏览器客户端使用。可选地由 TOTP 两步验证保护，并受
  `LoginRateLimiter` 限流。
- **API 密钥** — 形如 `rvx_live_<随机串>`，由 `ApiKeyService` 生成。只存储 BCrypt
  哈希和末四位字符，因此密钥在创建时仅显示一次。用于
  [事务性发信 API](api.md)。

## 状态归属

这条规则解释了大部分设计决策：

> **PostgreSQL 是唯一可信来源。邮件栈的配置文件只是渲染产物。**

域名、邮箱、别名、过滤器和签名都存放在数据库中。当你点击**应用**时，
`ProvisioningService` 将它们渲染为 Postfix 映射表、Dovecot 用户文件、
OpenDKIM 密钥表和 Rspamd 覆盖配置，执行 `postmap`，然后重载相关服务。
手工编辑 `/etc/postfix/ravix/*` 毫无意义 — 下一次应用就会覆盖它。

Ravix 写入专用子目录（`/etc/postfix/ravix/`、`/etc/rspamd/local.d/`、
`/etc/dovecot/ravix-users`），而不是替换发行版的主配置文件，因此这些路径之外
你自己手写的设置能够保留。

## 后端为何以 root 运行

Ravix 需要用 `apt` 安装软件包、写入 `/etc/postfix` 与 `/etc/dovecot`、执行
`postmap`、管理 `systemd` 单元并读取仅 root 可读的日志。因此 0.1 的 systemd
单元使用 `User=root`。

这是当前设计中最大的已知弱点：面板中任何远程代码执行都会立刻成为邮件主机上的
root 权限。计划中的修复方案是引入一个职责狭窄的特权辅助程序配合 `sudoers`
配置，让后端本身能够降权到 `ravix` 用户。在此之前，请把面板访问权视同 root
权限，并据此限制面板端口 — 参见[安全](security.md)。

## 后台任务

| 服务 | 职责 |
| --- | --- |
| `DomainChecker` | 按域名执行实时 MX / SPF / DKIM / DMARC / PTR 查询。 |
| `DmarcScanner` | 摄取投放到 DMARC 目录的聚合报告。 |
| `FblScanner` | 摄取 ARF 投诉并维护抑制列表。 |
| `RblScanner` | 对照 DNSBL 检查发信 IP。 |
| `ReputationService` | 滚动 30 天的发信信誉评分。 |
| `CampaignSender` | 带限速和预热上限的营销活动投递。 |
| `QueueService` | 读取并操作 Postfix 队列。 |
| `TaskService` | 跟踪在 UI 中展示的长时后台作业。 |

DNS 查询使用 JDK 内置的提供者（`com.sun.jndi.dns.DnsContextFactory`），这正是
设置 `quarkus.naming.enable-jndi=true` 的原因 —— Quarkus 默认禁用 JNDI，若不开启，
所有 DNS 检查都会静默返回空结果。

## 前端

一个常规的 Vite SPA。值得注意的几点：

- **国际化。** 俄语为默认语言，英语完整覆盖；选择保存在 `localStorage` 中。
  `src/i18n/ru.ts` 与 `src/i18n/en.ts` 必须保持同步 — 键值漂移会导致测试失败。
- **认证。** 会话是一个 `HttpOnly` Cookie，由浏览器自动附带，任何脚本 ——
  无论是我们的还是被注入的 —— 都无法读取。`localStorage` 中只保留一个布尔的
  「已登录」提示，用于决定初始路由；服务器仍是权威，过期的提示至多让首个请求
  返回 401 并跳转到 `/login`。
- **Webmail。** `WebmailPage.tsx` 通过 DOMPurify 渲染邮件正文。目前邮件存放在
  PostgreSQL 中，而非通过 IMAP 浏览。

## 测试

| 测试集 | 命令 | 覆盖内容 |
| --- | --- | --- |
| 后端单元测试 | `cd backend && mvn test` | MIME 解析、邮件组装、证书、配置渲染、ID 生成。 |
| 后端集成测试 | `cd backend && mvn verify` | 认证流程、授权、租户过滤 — 基于 Testcontainers 启动的真实 PostgreSQL（需要 Docker）。 |
| 前端测试 | `npm test` | 工具函数、i18n 键值对齐、组件回归。 |

CI 在每次推送和 Pull Request 时运行以上全部三项。
