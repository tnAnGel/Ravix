# 配置

[← 返回目录](README.md) · [English](../en/configuration.md) · [Русский](../ru/configuration.md)

---

Ravix 从两个位置读取配置：

| 文件 | 作用 |
| --- | --- |
| `/etc/ravix/ravix.env` | **运行时设置与生成的凭据。** 由安装程序写入，systemd 单元通过 `EnvironmentFile=` 加载。这是你在服务器上实际编辑的文件。 |
| `backend/src/main/resources/application.properties` | **编译进构建产物的默认值。** 每一项都读取带回退值的环境变量，因此通常应覆盖而非直接修改。 |

修改任一文件后：

```bash
sudo systemctl restart ravix
```

## 环境变量

### 网络

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RAVIX_HTTP_PORT` | `8080` | 后端 HTTP 端口。Nginx 将 `/api/` 代理到这里。 |
| `RAVIX_HTTP_HOST` | `127.0.0.1` | 绑定地址。**请保持在回环地址** — 面板设计为置于 Nginx 之后。仅在你有意直接暴露 API 时才设为 `0.0.0.0`。 |
| `RAVIX_PANEL_PORT` | `9162` | Nginx 对外提供面板的 HTTPS 端口。刻意不用 443，以便 webmail 或网站可以共存。 |

### 数据库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RAVIX_DB_URL` | `jdbc:postgresql://localhost:54322/postgres` | 安装程序会改写为 5432 端口上的 `ravix` 数据库。 |
| `RAVIX_DB_USER` | `postgres` | 安装程序设为 `ravix`。 |
| `RAVIX_DB_PASSWORD` | *(空)* | 安装程序会生成随机密码。空值仅对本地 trust 认证的开发数据库有意义。 |

Ravix 将所有数据放在专用的 `ravix` schema 中。Flyway 在启动时执行
`db/migration` 下的迁移（`quarkus.flyway.migrate-at-start=true`），Hibernate 只
*校验*结果 — 也就是说，schema 由迁移脚本掌管，而非实体类。

### 管理员账户

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RAVIX_ADMIN_EMAIL` | `admin@example.com` | **仅在不存在任何管理员时**创建。安装程序设为 `admin@localhost`。 |
| `RAVIX_ADMIN_PASSWORD` | *(留空 → 自动生成)* | 留空时 Ravix 会生成 20 位随机密码，并在启动时**只打印一次**。安装程序会显式设置它。 |

> 这里刻意**不提供默认密码**：默认密码就等于公开密码。如果你手动部署或在容器中
> 部署且没有 env 文件，请留意启动日志 —— 生成的密码只出现在那里。错过了？
> 执行 `sudo ravixctl reset-admin <邮箱> <密码>`。

忘记密码？`sudo ravixctl reset-admin <邮箱> <密码>`。

### 路径

| 变量 | 默认值 |
| --- | --- |
| `RAVIX_PATH_CONFIG` | `/etc/ravix` |
| `RAVIX_PATH_DATA` | `/var/lib/ravix` |
| `RAVIX_DMARC_INBOX` | `/var/lib/ravix/dmarc/inbox` |
| `RAVIX_FBL_INBOX` | `/var/lib/ravix/fbl/inbox` |

放入 DMARC 与 FBL 投放目录的文件会被自动摄取 — 参见
[DNS 与送达率](dns-deliverability.md)。

### 日志来源

Ravix 读取这些文件用于**日志**页面。若你的发行版路径不同，请相应调整。

| 变量 | 默认值 |
| --- | --- |
| `RAVIX_LOG_POSTFIX` | `/var/log/mail.log` |
| `RAVIX_LOG_DOVECOT` | `/var/log/mail.log` |
| `RAVIX_LOG_RSPAMD` | `/var/log/rspamd/rspamd.log` |
| `RAVIX_LOG_NGINX` | `/var/log/nginx/access.log` |
| `RAVIX_LOG_RAVIX` | `/var/log/ravix/ravix.log` |

### 邮件栈配置输出目标

Ravix 生成的配置写往何处。仅当你的邮件栈位于非标准路径时才需修改。

| 变量 | 默认值 |
| --- | --- |
| `RAVIX_POSTFIX_DIR` | `/etc/postfix/ravix` |
| `RAVIX_DOVECOT_USERFILE` | `/etc/dovecot/ravix-users` |
| `RAVIX_DKIM_DIR` | `/etc/opendkim` |
| `RAVIX_RSPAMD_DIR` | `/etc/rspamd/local.d` |
| `RAVIX_VMAIL_BASE` | `/var/vmail` |
| `RAVIX_VMAIL_UID` | `5000` |
| `RAVIX_VMAIL_GID` | `5000` |

Ravix 写入自己的 `ravix/` 子目录和 `local.d/` 覆盖文件，而不是替换主配置文件，
因此手写的设置能在应用配置后保留下来。参见[邮件栈](mail-stack.md)。

### 仅安装时使用的变量

这些只影响安装过程，运行时不会读取。

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `RAVIX_DOMAIN` | – | 面板主机名。设置后会申请 Let's Encrypt 证书。 |
| `RAVIX_TLS_EMAIL` | – | Let's Encrypt 联系邮箱。 |
| `RAVIX_FIREWALL` | `1` | 配置 UFW 与 fail2ban。设为 `0` 可跳过。 |
| `RAVIX_INSTALL_MODE` | `auto` | `auto` / `release` / `source`。 |
| `RAVIX_VERSION` | `latest` | 要安装的发布标签。 |
| `RAVIX_REPO` | GitHub 仓库地址 | 源仓库（分支仓库或 Gitea 镜像）。 |
| `RAVIX_BRANCH` | `main` | 源码构建所用分支。 |
| `RAVIX_RELEASE_TOKEN` | – | 用于私有发布产物的令牌。 |
| `RAVIX_REINSTALL` | `0` | 仅源码安装程序：覆盖已有安装。 |

### 认证与 CORS

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RAVIX_AUTH_MAX_FAILURES` | `5` | 窗口内针对同一**用户名**的失败次数上限，超出即锁定。 |
| `RAVIX_AUTH_MAX_FAILURES_PER_IP` | `20` | 针对同一 **IP** 的失败次数上限。刻意设得更高：管理员常共用一个办公室 IP，阈值过紧会让一个人打错密码就锁住所有人。 |
| `RAVIX_AUTH_WINDOW_SECONDS` | `300` | 统计失败次数的滑动窗口。 |
| `RAVIX_AUTH_LOCKOUT_SECONDS` | `900` | 锁定持续时长。返回 `429` 并带 `Retry-After`。 |
| `RAVIX_CORS_ORIGINS` | Vite 开发服务器 | 允许**跨域**调用 API 的额外来源。同源始终放行，因此常规安装无需配置。 |
| `RAVIX_QUEUE_MAX_ITEMS` | `500` | 单次请求返回的队列条目上限。汇总计数仍覆盖整个队列。 |

## 加固默认配置

对于常见部署形态 —— 同源面板、Cookie 会话、登录限流、无内置管理员密码 ——
默认值已经是安全的。剩下的主要是降低噪音。请在
`/etc/ravix/application.properties` 中覆盖，Quarkus 启动时会从工作目录读取该文件：

```properties
# 降低生产环境的后端日志噪音
quarkus.log.category."sh.ravix".level=INFO
```

如果你从与 API 不同的主机提供前端，那么——也仅在此时：

```bash
RAVIX_CORS_ORIGINS=https://panel.example.com
```

其余已知弱点见[安全](security.md)。

## 端口

| 端口 | 服务 | 暴露范围 |
| --- | --- | --- |
| `9162` | Ravix 面板（经 Nginx 的 HTTPS） | **限制为你自己的 IP。** |
| `8080` | 后端 API | 仅回环。 |
| `5432` | PostgreSQL | 仅回环。 |
| `80`、`443` | Nginx / ACME | 公开。 |
| `25` | SMTP | 公开 — 收信与 ACME 依赖它。 |
| `465`、`587` | 提交（Submission） | 公开。 |
| `993`、`995`、`143`、`110` | IMAP / POP3 | 公开。 |

当 `RAVIX_FIREWALL=1` 时安装程序会在 UFW 中开放上述全部端口。面板端口**无需**
对全网开放 — 收窄它是性价比最高的一项加固措施。

## 验证变更

```bash
sudo systemctl restart ravix
sudo ravixctl doctor      # 服务、API、数据库、nginx
sudo ravixctl logs 100
```
