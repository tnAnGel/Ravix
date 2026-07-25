# 安全

[← 返回目录](README.md) · [English](../en/security.md) · [Русский](../ru/security.md)

---

> 若要**报告**漏洞，请参见 [SECURITY.md](../../SECURITY.md)。本页讲的是如何安全地
> 运行 Ravix。

## 威胁模型

Ravix 是一个在邮件主机上拥有 root 权限的控制平面。这意味着：

- **面板访问权等同于 root 权限。** 后端以 `User=root` 运行，因为它需要安装软件包、
  写入 `/etc/postfix` 并重载服务。一个管理员会话等同于一个 root shell。
- **邮件端口必须公开。** 25 端口必须接受来自任何地方的连接，否则你收不到邮件。
  但面板并非如此。
- **面板端口无需公开。** 这种不对称性正是加固时最值得利用的一点。

## 已经加固的部分

| 方面 | 行为 |
| --- | --- |
| **会话** | 使用 `HttpOnly` 且 `SameSite=Strict` 的 Cookie。JavaScript 无法读取，因此 XSS 无法窃取会话；`SameSite=Strict` 起到了 CSRF 防护的作用。面板通过 HTTPS 提供时会附加 `Secure` 标志。API 密钥与脚本仍可使用 Bearer 令牌。 |
| **登录限流** | 5 分钟内同一用户名失败 5 次、或同一 IP 失败 20 次即锁定 15 分钟，返回 `429` 与 `Retry-After`。在校验密码之前即已判定。可通过 `RAVIX_AUTH_MAX_FAILURES`、`RAVIX_AUTH_MAX_FAILURES_PER_IP`、`RAVIX_AUTH_WINDOW_SECONDS`、`RAVIX_AUTH_LOCKOUT_SECONDS` 调整。 |
| **CORS** | 同源始终放行；其他来源必须列入 `RAVIX_CORS_ORIGINS`（默认仅 Vite 开发服务器）。不再使用通配符。 |
| **首次管理员** | 不再内置默认密码。若未设置 `RAVIX_ADMIN_PASSWORD`，启动时生成 20 位随机密码并只打印一次。 |
| **结果集大小** | 审计上限 200（最大 500），邮件通过 `offset`/`limit` 分页，日志按来源读取有限行数，队列上限为 `RAVIX_QUEUE_MAX_ITEMS`（500）。 |

## 仍然存在的弱点

公开记录，并未隐瞒：

| 方面 | 现状 | 后果 |
| --- | --- | --- |
| **进程权限** | `User=root` | 面板中的 RCE 即等于邮件主机上的 root 权限。这是架构层面的问题 —— 后端需要安装软件包并写入 `/etc/postfix`。计划中的方案是引入职责狭窄的特权辅助程序配合 `sudoers`。**请把面板访问权视同 root 权限。** |
| **配置下发** | 无试运行、差异比对与回滚 | 一次错误的应用可能中断邮件投递。请先备份 `/etc/postfix`。 |
| **恢复流程** | 备份创建可用，恢复尚未完成 | 不要把 Ravix 备份当作唯一副本。 |
| **数据库默认密码** | 默认为空 | 仅影响使用 trust 认证的本地开发数据库；`install.sh` 会生成真实密码。 |

## 加固清单

在把公网 DNS 名称指向面板之前，请逐项完成。

### 网络

- [ ] **限制面板端口。** `9162` 应当只对你的 IP 开放，而不是整个互联网：
      ```bash
      sudo ufw delete allow 9162/tcp
      sudo ufw allow from 203.0.113.5 to any port 9162 proto tcp
      ```
      更好的做法是根本不暴露它，改用 VPN 或 SSH 隧道访问：
      ```bash
      ssh -L 9162:127.0.0.1:9162 you@mail.example.com
      ```
- [ ] **让 API 保持在回环地址。** `RAVIX_HTTP_HOST=127.0.0.1` 是默认值；
      保持不变，这样后端只能通过 Nginx 访问。
- [ ] **通过 HTTPS 提供面板。** 安装时设置 `RAVIX_DOMAIN=panel.example.com`
      即可签发证书。会话 Cookie 只有在 HTTPS 下才会带上 `Secure` 标志。
- [ ] **让面板主机名与邮件主机名分开**，使两者的证书和虚拟主机相互独立。

### 应用

- [ ] **除非拆分来源，否则无需改动 CORS。** 同源已被放行，这就是常规部署方式。
      只有当你从另一台主机提供前端时，才需要显式指定：
      ```bash
      RAVIX_CORS_ORIGINS=https://panel.example.com
      ```
- [ ] **首次登录即修改密码**，并在 **设置 → 安全** 中启用 TOTP 两步验证。
- [ ] **每人一个管理员账户。** 共用账号会让审计日志失去意义。
- [ ] **使用够用的最小权限角色** — 参见[多租户](multi-tenant.md)。
- [ ] **轮换任何曾出现在**聊天记录、工单或截图中的 API 密钥。`rvx_live_…`
      密钥创建后无法找回，只能替换。
- [ ] **定期查看审计日志。** 所有变更类操作都会被记录。

### 主机

- [ ] **保持 fail2ban 启用**（`RAVIX_FIREWALL=1` 时安装程序会配置）。
      它覆盖 SSH、SMTP 和 IMAP；面板登录有自己的限流机制。
- [ ] **及时安装安全更新**，Ravix 与 Postfix/Dovecot/Rspamd 都要更新。
- [ ] **将 PostgreSQL 限制在回环地址。** 它没有理由对外监听。
- [ ] **保护 env 文件** —— `/etc/ravix/ravix.env` 中存有数据库密码和初始管理员密码：
      ```bash
      sudo chmod 600 /etc/ravix/ravix.env
      ```

### 邮件

- [ ] **不要运行开放中继。** Ravix 生成的 Postfix 配置不会造成开放中继；
      任何手工改动之后请验证：
      ```bash
      sudo postconf -n | grep -E 'mynetworks|relay_domains|smtpd_relay_restrictions'
      ```
- [ ] **提交端口（465/587）必须要求认证**，并同时启用 TLS。
- [ ] **使用强邮箱密码。** 被入侵的邮箱会变成垃圾邮件中继，几小时内你的 IP 就会
      进入黑名单。
- [ ] **关注队列与 RBL 页面。** 队列突然激增通常是账户被入侵的第一个信号。

### 备份

- [ ] **每次应用配置前先备份** — `sudo ravixctl backup`。
- [ ] **把备份拷贝到主机之外。** 只存在于被保护机器上的备份不算备份。
- [ ] **测试一次恢复流程**，在真正需要之前。0.1 的恢复流程尚未完成。

## 如果某个邮箱被入侵

1. 在面板中禁用该邮箱或修改其密码，然后执行 `sudo ravixctl apply`。
2. 清除队列中的恶意邮件：
   ```bash
   sudo postqueue -p | grep -c '^[A-F0-9]'
   sudo postsuper -d ALL          # 会删除整个队列，包括合法邮件
   ```
3. 查看 **RBL** 页面，按需开始申请解封。
4. 检查审计日志和 `/var/log/mail.log`，了解该账户还做了什么。
5. 轮换该账户可能触及的所有 API 密钥。

## 一个合理的部署方案

以今天的标准运行生产邮件服务器：

- 面板仅可通过 VPN 或 SSH 隧道访问。
- 使用真实证书的 HTTPS，CORS 收窄到该来源。
- 每个管理员账户都启用两步验证，每人一个账户。
- 备份每晚拷贝到主机之外，且恢复流程已验证。
- 启用 fail2ban，安全更新自动化。
- 对队列深度和 RBL 列入情况设置告警。

请把面板当作 root shell 来对待，因为它就是。
