# 命令行 — `ravixctl`

[← 返回目录](README.md) · [English](../en/cli.md) · [Русский](../ru/cli.md)

---

`ravixctl` 安装在 `/usr/local/bin/ravixctl`，用于从命令行控制 Ravix 安装。
所有命令都需要 root 权限。

```bash
sudo ravixctl <命令>
```

它从 `/etc/ravix/ravix.env` 读取凭据与端口；可通过 `RAVIX_ENV_FILE` 覆盖该路径。

## 服务控制

| 命令 | 作用 |
| --- | --- |
| `ravixctl status` | 等同于 `systemctl status ravix`。 |
| `ravixctl start` | 启动服务。 |
| `ravixctl stop` | 停止服务。 |
| `ravixctl restart` | 重启 — 修改 `ravix.env` 后需要执行。 |
| `ravixctl enable` | 开机自启。 |
| `ravixctl disable` | 取消开机自启。 |

## 日志

```bash
sudo ravixctl logs           # 最近的日志
sudo ravixctl logs -f        # 持续跟踪
sudo ravixctl logs 500       # 最后 500 行
```

若需查看*邮件*日志而非面板日志，请使用面板中的**日志**页面，或直接读取
`/var/log/mail.log`。

## `doctor`

出问题时第一个该运行的命令。

```bash
sudo ravixctl doctor
```

依次检查：

- `ravix` systemd 服务是否处于活动状态；
- API 是否在 `http://127.0.0.1:8080/api/auth/status` 响应；
- PostgreSQL 数据库是否可达；
- Nginx 是否处于活动状态。

Nginx 未运行只会作为提示信息而非失败报告 —— 后端可以在没有它的情况下运行，
只是你无法访问面板。

## `version`

```bash
sudo ravixctl version
```

输出正在运行的版本。请在
[问题报告](https://github.com/tnAnGel/Ravix/issues)中附上它。

## `apply`

```bash
sudo ravixctl apply
```

从数据库渲染邮件栈配置并重载受影响的服务 —— 等同于面板中的
**平台 → 应用**。参见[邮件栈](mail-stack.md)。

目前还没有试运行和回滚功能。请先备份。

## `recheck`

```bash
sudo ravixctl recheck
```

对所有域名重新执行实时的 MX / SPF / DKIM / DMARC / PTR 检查。修改 DNS 之后很有用，
也适合作为定时任务：

```cron
0 6 * * * /usr/local/bin/ravixctl recheck >/dev/null 2>&1
```

## `backup`

```bash
sudo ravixctl backup
```

创建备份并记录到面板的备份列表中。文件存放在 `/var/lib/ravix/backups`。

> ⚠️ 备份*创建*功能可用；完整的灾难恢复流程应视为尚未完成。请不要把它当作唯一的
> 副本 —— 把备份拷贝到主机之外，并在真正需要之前验证一次恢复流程。

## `update`

```bash
sudo ravixctl update
```

仅适用于**源码**安装，即 `/opt/ravix/src` 是一个 git 检出目录。它会：

1. 在 `/opt/ravix/src` 执行 `git pull --ff-only`；
2. 若 `/usr/local/bin/ravixctl` 有变化则自我更新（以原子方式替换，
   不会破坏正在运行的副本；新逻辑从下次调用起生效）；
3. 重新构建后端（`mvn -DskipTests package`）；
4. 重新构建前端（`npm ci && npm run build`）；
5. 停止服务，整体替换 `/opt/ravix/quarkus-app` 与 `/var/www/ravix`，然后重新启动。

由于脚本在 `set -euo pipefail` 下运行，**构建失败会在任何部署动作之前中止** ——
有问题的提交无法替换掉正常工作的安装。执行结束时会打印已部署的提交。

对于**发布版**安装，请改为重新运行安装程序：

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

## `reset-admin`

```bash
sudo ravixctl reset-admin admin@example.com '新的强密码'
```

当你被锁在面板之外时的恢复途径。两个参数都是必需的。请给密码加引号以免被 shell
处理，若你的 shell 会记录历史，可在命令前加一个空格。

它只重置密码。如果是两步验证把你挡在外面，请在数据库中为该账户清除它，
或提交 issue —— 目前还没有 `--disable-2fa` 选项。

## 常见操作组合

**修改 DNS 之后：**

```bash
sudo ravixctl recheck
```

**在面板中添加域名或邮箱之后：**

```bash
sudo ravixctl backup
sudo ravixctl apply
sudo ravixctl doctor
```

**出现故障时：**

```bash
sudo ravixctl doctor
sudo ravixctl logs 200
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

**例行升级：**

```bash
sudo ravixctl backup
sudo ravixctl update
sudo ravixctl doctor
```
