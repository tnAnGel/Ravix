# 安装

[← 返回目录](README.md) · [English](../en/installation.md) · [Русский](../ru/installation.md)

---

## 系统要求

| | 最低配置 | 推荐的小型 VPS |
| --- | ---: | ---: |
| CPU | 1 vCPU | 2 vCPU |
| 内存 | 2 GB | 4 GB |
| 磁盘 | 10 GB SSD | 80+ GB SSD |

磁盘占用主要来自邮箱存储和备份，而非 Ravix 本身。

**操作系统。** 主要目标是 Debian 12 (bookworm)；Ubuntu 22.04/24.04 LTS 基于同样的
`apt` + `systemd` 模型，同样可用。支持 `amd64` 与 `arm64`。若没有 `apt-get`，
安装程序会拒绝运行。

**开始之前：**

- **一台全新主机。** Ravix 会改写 Nginx、PostgreSQL 与邮件栈的配置。请勿将其安装在
  你在意的既有邮件服务器或 Web 应用旁边。
- **root 权限。** 安装程序和面板本身都需要。
- **出站 25 端口必须开放。** 几乎所有云厂商（AWS、GCP、Azure、Oracle、DigitalOcean、
  Hetzner）默认封锁该端口，需提交工单开通。否则你能收信，但永远发不出去。
- **拥有 PTR 记录的静态 IP。** 没有反向解析的 IP 发出的邮件，几乎会被所有大型服务商
  拒收或投入垃圾箱。
- **可编辑的 DNS**，覆盖你打算托管的每一个域名。

## 快速安装

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

或从克隆的仓库安装：

```bash
git clone https://github.com/tnAnGel/Ravix.git
cd Ravix
sudo ./install.sh
```

指定域名，让面板立即获得 Let's Encrypt 证书：

```bash
RAVIX_DOMAIN=panel.example.com RAVIX_TLS_EMAIL=you@example.com sudo ./install.sh
```

安装完成后会打印面板地址和生成的管理员凭据。**请记下密码** — 它只显示一次，
同时也保存在 `/etc/ravix/ravix.env` 中。

## 安装程序做了什么

1. 安装运行时软件包：PostgreSQL、Nginx、Java 21 JRE（若 `openjdk-21-jre-headless`
   不可用，则回退到 Adoptium Temurin 仓库），以及 `curl`、`openssl`、`tar`。
2. 创建 `ravix` 系统用户和下文的目录结构。
3. 创建名为 `ravix` 的 PostgreSQL 角色与数据库，密码随机生成并写入
   `/etc/ravix/ravix.env`。
4. 下载最新发布版的预构建后端与前端产物，**对照 `SHA256SUMS` 校验**，
   校验不通过则拒绝安装。
5. 写入 systemd 单元并启动 `ravix` 服务。
6. 将 Nginx 配置为反向代理：`/` 提供静态前端，`/api/` 代理到后端。
7. 若设置了 `RAVIX_DOMAIN`，通过 Certbot 申请证书。
8. 若 `RAVIX_FIREWALL=1`（默认），在 UFW 中开放邮件与面板端口并启用 fail2ban。

至此 Ravix 本身已安装完成。**邮件栈尚未安装** — Postfix、Dovecot、Rspamd 和
OpenDKIM 需随后在面板的 **平台 → 软件** 中安装。参见[邮件栈](mail-stack.md)。

## 安装模式

`install.sh` 是快速路径：下载 CI 一次性构建好的产物，冷安装约 30–60 秒，
而源码构建需要约 5–8 分钟。若没有已发布的版本 —— 或你明确要求 —— 它会透明地
回退到通过 `install-from-source.sh` 进行源码构建。

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `RAVIX_INSTALL_MODE` | `auto` | `auto` — 有发布版则用，否则用源码。`release` — 找不到发布版即失败。`source` — 始终源码构建。 |
| `RAVIX_VERSION` | `latest` | 要安装的发布标签，例如 `v0.1.0`。 |
| `RAVIX_RELEASE_TOKEN` | – | 访问令牌，仅在从**私有**分支仓库拉取产物时需要。 |
| `RAVIX_REPO` | GitHub 仓库地址 | 源仓库。可指向分支仓库或自托管的 Gitea 镜像；安装程序会根据主机自动判断使用哪套 API。 |
| `RAVIX_BRANCH` | `main` | 源码构建所用分支。 |

```bash
# 强制源码构建
RAVIX_INSTALL_MODE=source sudo ./install.sh

# 锁定具体版本
RAVIX_VERSION=v0.1.0 sudo ./install.sh
```

源码构建会额外安装 Maven、JDK 和 Node.js，并在主机上编译 Quarkus 与打包 Vite —
请预留约 2 GB 额外磁盘和数分钟时间。

可在安装时覆盖的端口、凭据与路径，详见[配置](configuration.md)。

## 安装后的目录结构

| 路径 | 用途 |
| --- | --- |
| `/opt/ravix` | 后端运行时（`quarkus-app/`）。 |
| `/opt/ravix/src` | 源码检出目录 — 仅源码模式下存在；`ravixctl update` 依赖它。 |
| `/var/www/ravix` | 由 Nginx 提供的前端静态文件。 |
| `/etc/ravix/ravix.env` | 运行时配置与生成的凭据。 |
| `/var/lib/ravix` | 数据、DMARC/FBL 投放目录、备份。 |
| `/var/log/ravix` | 应用日志。 |
| `/usr/local/bin/ravixctl` | [命令行工具](cli.md)。 |

## 首次登录

1. 打开安装程序输出的面板地址 — `https://panel.example.com/`
   或 `https://<ip>:9162/`。
2. 使用生成的凭据登录。
3. **立即修改密码**，并在 **设置 → 安全** 中启用两步验证。
4. 完成[加固清单](security.md#加固清单)。
5. 安装邮件栈：[邮件栈](mail-stack.md)。

面板默认监听 `9162` 端口而非 443，以免与同一主机上的 webmail 或网站虚拟主机冲突。

## 升级

从发布版升级：

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

重新运行安装程序会替换后端与前端，保留数据库和 `/etc/ravix/ravix.env`，
并在下次启动时由 Flyway 迁移数据库结构。

从源码检出升级：

```bash
sudo ravixctl update    # git pull、重新构建、部署、重启
```

如果构建失败，`ravixctl update` 会在改动正在运行的安装之前中止 —
参见 [CLI](cli.md#update)。

请务必先备份：

```bash
sudo ravixctl backup
```

## 卸载

Ravix 没有提供卸载脚本，这是有意为之：面板与正在运行的邮件栈共享同一主机，
因此卸载需手动进行。

```bash
sudo systemctl disable --now ravix
sudo rm -f /etc/systemd/system/ravix.service && sudo systemctl daemon-reload
sudo rm -rf /opt/ravix /var/www/ravix /var/log/ravix
sudo rm -f /etc/nginx/sites-enabled/ravix /etc/nginx/sites-available/ravix
sudo systemctl reload nginx
sudo -u postgres dropdb ravix && sudo -u postgres dropuser ravix
sudo rm -f /usr/local/bin/ravixctl
```

`/var/lib/ravix` 中存放着备份与投放目录 — 删除前请先检查。以上操作不会移除
Postfix、Dovecot、Rspamd 以及 `/var/vmail` 中的邮件数据；如需彻底移除邮件服务器，
请另行处理。

## 下一步

- [配置](configuration.md) — 调整端口、路径与凭据。
- [邮件栈](mail-stack.md) — 安装并配置 Postfix、Dovecot、Rspamd。
- [DNS 与送达率](dns-deliverability.md) — 让邮件真正送达。
- [故障排查](troubleshooting.md) — 当安装未按预期进行时。
