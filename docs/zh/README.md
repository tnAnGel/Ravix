<div align="center">

# Ravix 文档

[English](../en/README.md) · [Русский](../ru/README.md) · **中文**

</div>

---

Ravix 是一个自托管的 Linux 邮件服务器控制面板。它在自身运行的主机上部署并管理
Postfix、Dovecot、Rspamd、OpenDKIM 和 Certbot，并提供域名、邮箱、DNS 健康状况、
送达率和邮件营销的仪表盘。

> ⚠️ **Ravix 0.1 是预发布版本，尚未针对生产环境加固。** 后端以 root 身份运行，
> CORS 默认完全开放，且没有登录频率限制。在将面板暴露到互联网之前，请先阅读
> [安全](security.md)。

## 从这里开始

| 文档 | 内容 |
| --- | --- |
| **[安装](installation.md)** | 系统要求、一行命令安装、安装模式、升级与卸载。 |
| **[配置](configuration.md)** | 全部环境变量、`ravix.env`、`application.properties`、端口与路径。 |
| **[架构](architecture.md)** | 前端、后端、数据库与主机邮件栈如何协同工作。 |

## 日常运维

| 文档 | 内容 |
| --- | --- |
| **[邮件栈](mail-stack.md)** | 从面板安装 Postfix/Dovecot/Rspamd、生成的配置、应用变更。 |
| **[DNS 与送达率](dns-deliverability.md)** | MX、SPF、DKIM、DMARC、PTR、MTA-STS、DANE、RBL 监控与信誉。 |
| **[命令行 — `ravixctl`](cli.md)** | 服务控制、健康检查、备份、更新、管理员恢复。 |
| **[REST API](api.md)** | 认证、API 密钥、事务性发信接口、完整资源清单。 |

## 出问题时

| 文档 | 内容 |
| --- | --- |
| **[故障排查](troubleshooting.md)** | 安装失败、邮件收发不通、DNS 检查失败、面板无法访问。 |
| **[安全](security.md)** | 威胁模型、已知弱点、加固清单。 |

## 设计说明

| 文档 | 状态 |
| --- | --- |
| **[多租户](multi-tenant.md)** | 组织、角色与租户隔离 — 部分实现。 |

## 文档约定

- 带 `sudo` 前缀的命令需在邮件主机上以 root 身份执行。
- `example.com` 始终是占位符，请替换为你自己的域名。
- `panel.example.com` 指提供*面板*服务的主机名，通常**不应**与邮件主机名相同。
- 路径按默认安装给出；若你做过覆盖，请参见[配置](configuration.md)。

---

英文版本为准。若译文与之矛盾，以英文页面为准，同时欢迎提交
[问题报告](https://github.com/tnAnGel/Ravix/issues)。
