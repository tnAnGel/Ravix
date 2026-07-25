# 邮件栈

[← 返回目录](README.md) · [English](../en/mail-stack.md) · [Русский](../ru/mail-stack.md)

---

安装 Ravix 只安装了*面板*。邮件服务器本身需要随后在面板的
**平台 → 软件** 中安装。

## Ravix 管理的组件

| 组件 | 软件包 | 作用 |
| --- | --- | --- |
| **Postfix** | `postfix` | SMTP / 邮件传输代理 |
| **Dovecot** | `dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-sieve` | IMAP、POP3、LMTP 投递、Sieve 过滤 |
| **Rspamd** | `rspamd` | 垃圾邮件过滤与打分 |
| **Redis** | `redis` | Rspamd 的缓存后端 |
| **OpenDKIM** | `opendkim` | DKIM 签名 milter |
| **Certbot** | `certbot` | Let's Encrypt ACME 客户端 |
| **Nginx** | `nginx` | 反向代理、webmail |
| **PostgreSQL** | `postgresql` | 面板数据库 |
| **fail2ban** | `fail2ban` | SSH / SMTP / IMAP 的暴力破解防护 |
| **Radicale** | `radicale` | 日历与联系人（CalDAV / CardDAV） |

每一项都会显示已安装版本、服务状态以及是否有可用更新。Ravix 通过 `apt` 安装，
因此软件包来自你所用发行版的仓库。

## 推荐顺序

1. **安装组件** — 至少安装 Postfix、Dovecot、Rspamd、Redis 和 OpenDKIM。
   只有在需要日历时才安装 Radicale。
2. **添加第一个域名**（**域名**页面），并发布 Ravix 生成的 DNS 记录。
   参见 [DNS 与送达率](dns-deliverability.md)。
3. **为域名生成 DKIM 密钥**并发布对应 DNS 记录。
4. **创建邮箱**（**邮箱**页面）。
5. **应用配置** — **平台 → 应用**。
6. **验证** — 收发各一封邮件，然后查看**日志**与**队列**。

在你点击「应用」之前，面板中输入的任何内容都不会到达 Postfix 或 Dovecot。

## 「应用」会生成什么

`ProvisioningService` 将数据库渲染为配置文件，并重载受影响的服务。

| 目标文件 | 内容 |
| --- | --- |
| `/etc/postfix/ravix/virtual_domains` | 所有启用的域名。 |
| `/etc/postfix/ravix/virtual_mailboxes` | 邮箱 → Maildir 路径映射。 |
| `/etc/postfix/ravix/virtual_aliases` | 别名 → 目标地址映射。 |
| `/etc/dovecot/ravix-users` | 带 BCrypt 哈希的 `passwd-file` 条目。 |
| `/etc/opendkim/` | 密钥表、签名表、可信主机、生成的私钥。 |
| `/etc/rspamd/local.d/` | 评分阈值、放行/拦截列表、DKIM 设置。 |

对应的 Postfix 配置项：

```text
virtual_mailbox_domains = hash:/etc/postfix/ravix/virtual_domains
virtual_mailbox_maps    = hash:/etc/postfix/ravix/virtual_mailboxes
virtual_alias_maps      = hash:/etc/postfix/ravix/virtual_aliases
virtual_mailbox_base    = /var/vmail
virtual_transport       = lmtp:unix:private/dovecot-lmtp
```

Ravix 会对 hash 映射表执行 `postmap`，并按需重载 Postfix、Dovecot、OpenDKIM 与
Rspamd。

> **这些文件是自动生成的。** 手工编辑毫无意义 — 下一次应用就会覆盖。请改在面板中
> 修改数据。位于 `/etc/postfix/ravix/`、`/etc/rspamd/local.d/` 和
> `/etc/dovecot/ravix-users` *之外*的设置不会被触碰。

## 邮件存储

邮件以 Maildir 格式存放在 `/var/vmail` 下，属主为 `vmail` 用户（默认 uid/gid 为
`5000`）。投递路径为 Postfix → Dovecot LMTP → Maildir，因此邮箱格式与配额核算由
Dovecot 掌管。

可通过 `RAVIX_VMAIL_BASE`、`RAVIX_VMAIL_UID` 和 `RAVIX_VMAIL_GID` 覆盖基础路径与
属主 — 参见[配置](configuration.md)。

## Sieve 过滤器与签名

按邮箱设置的过滤器（**邮箱 → 过滤器**）由 `SieveService` 编译为 Sieve 脚本，
并由 Dovecot 在投递时应用。签名存放在数据库中，由面板的写信窗口插入，而非由 MTA
处理 — 通过外部 IMAP 客户端发出的邮件不会带上签名。

## TLS 证书

**证书**页面通过 Certbot 管理 Let's Encrypt：签发、查看有效期与续期。Postfix 与
Dovecot 会指向生成的 `/etc/letsencrypt/live/<主机名>/` 下的文件。

邮件证书请使用你的**邮件主机名**（例如 `mail.example.com`）—— 它必须与 MX 记录
指向的主机名一致，否则对方服务器若校验 TLS 就会失败。面板自身的证书是独立的。

## 如何安全地应用配置

目前还没有试运行（dry-run）、差异比对和回滚 —— 应用会立即写入并重载。在这些功能
到位之前：

```bash
sudo ravixctl backup                 # 应用之前
sudo cp -a /etc/postfix /root/postfix.bak
sudo ravixctl apply                  # 或点击面板按钮
sudo ravixctl doctor
sudo ravixctl logs 200
```

若应用后 Postfix 拒绝启动，`postfix check` 会指出出问题的行；恢复你的备份，
并提交 [issue](https://github.com/tnAnGel/Ravix/issues)。

## 队列

**队列**页面是 Postfix 队列的封装：查看延迟和保留的邮件及其原因，对单条邮件执行
重试、保留或删除，并按状态查看汇总。若队列持续增长且伴随 25 端口的
`Connection timed out`，几乎可以肯定是你的服务商封锁了出站 SMTP — 参见
[故障排查](troubleshooting.md#邮件发不出去)。
