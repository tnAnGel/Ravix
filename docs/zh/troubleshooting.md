# 故障排查

[← 返回目录](README.md) · [English](../en/troubleshooting.md) · [Русский](../ru/troubleshooting.md)

---

## 从这里开始

```bash
sudo ravixctl doctor          # 服务、API、数据库、nginx
sudo ravixctl logs 200        # 面板日志
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

`doctor` 告诉你*哪一层*出了问题；日志告诉你为什么。

---

## 面板无法访问

**1. 后端在运行吗？**

```bash
sudo systemctl status ravix
sudo journalctl -u ravix -n 100 --no-pager
```

常见原因：

| 日志中的现象 | 原因 |
| --- | --- |
| 连接 PostgreSQL 时 `Connection refused` | PostgreSQL 未运行：`sudo systemctl start postgresql`。 |
| `password authentication failed` | `/etc/ravix/ravix.env` 中的 `RAVIX_DB_PASSWORD` 与数据库角色不再匹配。 |
| `Flyway ... validate failed` | 数据库结构与迁移脚本产生偏离，通常是手工改动导致。 |
| `Address already in use` | 8080 端口被占用：`sudo ss -lptn 'sport = :8080'`。 |

**2. API 在本地有响应吗？**

```bash
curl -i http://127.0.0.1:8080/api/auth/status
```

如果这里正常但浏览器不行，问题出在 Nginx 或防火墙。

**3. Nginx**

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -50 /var/log/nginx/error.log
```

**4. 防火墙**

```bash
sudo ufw status
```

面板端口默认是 `9162` 而非 443。如果你在加固时——很正确地——把它收窄到了自己的 IP，
而你的 IP 后来变了，那答案就在这里。

---

## 我被锁在外面了

```bash
sudo ravixctl reset-admin admin@example.com '新的强密码'
```

如果是两步验证挡住了你，可直接清除该账户的密钥：

```bash
sudo -u postgres psql -d ravix \
  -c "UPDATE ravix.admin_user SET two_factor_secret = NULL WHERE email = 'admin@example.com';"
```

---

## 邮件发不出去

### 先看队列

```bash
sudo postqueue -p | tail -30
```

延迟原因会指明问题所在。

| 原因 | 含义 | 解决办法 |
| --- | --- | --- |
| 连接 25 端口 `Connection timed out` | **服务商封锁了出站 SMTP。** | 提交支持工单。几乎所有云厂商都默认封锁 25 端口。这是遥遥领先的第一大原因。 |
| `550 ... no PTR` / `does not resolve` | 反向解析缺失或不匹配。 | 在主机服务商处设置 PTR；参见 [DNS](dns-deliverability.md#2-ptr--你自己设不了的那一条)。 |
| `554 ... blocked using ...` | 你被列入了黑名单。 | 查看 **RBL** 页面，解决根因，然后申请解封。 |
| `Relay access denied` | Postfix 不认为自己负责该域名。 | 该域名不在 `virtual_domains` 中 —— 请应用配置。 |
| `SASL authentication failed` | 客户端凭据不正确。 | 在面板中重置邮箱密码并重新应用配置。 |

确认 25 端口确实可用：

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

这里超时就是定论：问题在服务商，而不在你的配置。

### 邮件能发出但进了垃圾箱

请按[送达率检查清单](dns-deliverability.md#实用检查清单)逐项排查。实践中几乎总是
PTR、SPF、DKIM，或是一个未经预热的全新 IP。

---

## 收不到邮件

**1. 外部世界会把邮件路由到你这里吗？**

```bash
dig +short MX example.com
dig +short A mail.example.com
```

MX 必须指向带 A 记录的主机名 —— 不能是 IP，也不能是 CNAME。

**2. 25 端口接受连接吗？**

```bash
nc -zv mail.example.com 25
```

**3. Postfix 认为该域名属于自己吗？**

```bash
sudo postmap -q example.com hash:/etc/postfix/ravix/virtual_domains
```

输出为空说明该域名从未进入生成的配置 —— 请在面板中添加它，然后执行
`sudo ravixctl apply`。

**4. 邮箱在映射表中吗？**

```bash
sudo postmap -q user@example.com hash:/etc/postfix/ravix/virtual_mailboxes
```

**5. 实时观察投递过程**

```bash
sudo tail -f /var/log/mail.log
```

---

## 记录明明存在，面板的 DNS 检查却失败

- **传播延迟。** 记录不会立刻在各处可见。等待你所替换记录的 TTL 过期，
  然后执行 `sudo ravixctl recheck`。
- **解析器不一致。** 将 Ravix 看到的结果与公共解析器对比：
  ```bash
  dig +short TXT example.com @1.1.1.1
  dig +short TXT example.com @8.8.8.8
  ```
- **JNDI 被禁用。** 如果*所有* DNS 检查都返回空而不是失败，说明
  `quarkus.naming.enable-jndi` 处于关闭状态。Ravix 使用 JDK 的 DNS 提供者，
  而 Quarkus 默认禁用 JNDI；随附的 `application.properties` 会重新开启它。
  这个问题多见于自行构建的版本。
- **两条 SPF 记录。** 两条 `v=spf1` TXT 记录是永久性错误，而不会被合并。
  请只保留一条。

---

## 应用配置后邮件栈坏了

```bash
sudo postfix check
sudo systemctl status postfix dovecot rspamd opendkim
```

`postfix check` 会指出出问题的文件和行号。如果你按[邮件栈](mail-stack.md)的建议
做了备份：

```bash
sudo systemctl stop postfix
sudo rm -rf /etc/postfix && sudo cp -a /root/postfix.bak /etc/postfix
sudo systemctl start postfix
```

然后请带上导致失败的生成配置提交
[issue](https://github.com/tnAnGel/Ravix/issues) —— 渲染出错是值得修复的 bug。

---

## 安装失败

**「This installer targets Debian/Ubuntu」** —— 没有 `apt-get`。Ravix 的配置下发层
按设计就是面向 Debian/Ubuntu 的。

**「Run as root (sudo).」** —— 请使用 `sudo`。

**「Checksum verification failed — refusing to install.」** —— 下载的产物与
`SHA256SUMS` 不符。通常是下载被截断，或有代理改写了响应。请重试；若持续出现，
请上报，但不要绕过校验。

**「No installable release found (mode=release).」** —— 没有匹配的已发布版本。
去掉 `RAVIX_INSTALL_MODE=release` 以回退到源码构建，或用 `RAVIX_VERSION`
指定一个已存在的标签。

**Java 21 装不上。** 当 `openjdk-21-jre-headless` 不可用时，安装程序会添加
Adoptium 仓库。在非常规发行版上，请先自行安装 Java 21 JRE，然后重新运行。

**源码构建内存不足。** 在 1 GB 内存的主机上编译 Quarkus 并打包 Vite 相当吃紧。
请增加 swap，或改用发布版路径。

---

## 寻求帮助

请提交 [issue](https://github.com/tnAnGel/Ravix/issues)，并附上：

```bash
sudo ravixctl version
sudo ravixctl doctor
sudo ravixctl logs 200
```

请先清除域名、IP 和 API 密钥 —— issue 是公开的。安全问题请改用
[SECURITY.md](../../SECURITY.md) 中的渠道，切勿提交公开 issue。
