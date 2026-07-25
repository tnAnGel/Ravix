# 多租户

[← 返回目录](README.md) · [English](../en/multi-tenant.md) · [Русский](../ru/multi-tenant.md)

---

> **状态：已实现，但尚未经过实战检验。** 后端模型、Hibernate 过滤器以及持久化层的
> 隔离测试均已就位。前端覆盖仍不完整，且该模型尚未经过真实的多客户部署检验。
> 在以此对外销售托管服务之前，请把租户隔离当作一条需要你自己验证的安全边界。

## 模型

一套 Ravix 安装、**一套邮件栈**、多个相互独立的组织。

这一点很关键：操作系统层面的邮件平面按设计就是共享的。Postfix 仅按收件域名路由，
并不知道域名归谁所有，因此整个安装只有一组 `virtual_domains` 映射表、一个 Dovecot
用户文件和一张 OpenDKIM 密钥表，覆盖所有租户。域名在整个安装范围内全局唯一。

**隔离是逻辑上的，在应用层实施** —— 而不是靠独立的 Postfix 或 Dovecot 实例。
一个组织只能看到属于自己的数据行；邮件栈本身仍由运营方掌控。

## 实体

| 实体 | 用途 |
| --- | --- |
| `Organization` | 一个租户：名称、slug、状态，以及域名、邮箱和存储的配额。 |
| `OrgMembership` | 将 `AdminUser` 与 `Organization` 以某个角色关联起来。 |
| `AdminUser.superadmin` | 平台运营方标志 —— 绕过全部组织范围限制。 |

一个用户可以隶属多个组织（运营方员工）；常见情形是一个用户属于一个组织。

### 按租户限定范围

以下实体带有 `org_id`，在每次查询时都会被过滤：

`domain`、`mailbox`、`alias`、`campaign`、`campaign_recipient`、`segment`、
`contact`、`email_template`、`mail_filter`、`mail_signature`、`inbox_seed`、
`inbox_test`、`api_key`

### 运营方全局

基础设施与可观测性属于运营方，而非某个租户：

`app_setting`、`service_status`、`package_status`、`queue_item`、`log_line`、
`install_log`、`certificate`、`dns_record`、`rbl_check`、`dmarc_report`、
`fbl_complaint`、`audit_log`、`background_task`、`warmup_config`、`backup`

其中一些*可以*按租户展示 —— 比如某个客户自己的队列条目或 DMARC 报告 ——
但它们并不归属于任何单个租户。

## 角色

角色按用户设置，并在 `AuthFilter` 中强制执行：

| 角色 | 权限 |
| --- | --- |
| `owner` | 一切权限，包括管理其他团队成员。 |
| `admin` | 完全掌控邮件平台；但**不能**添加、移除其他管理员或修改其角色。 |
| `viewer` | 只读。仅可修改自己的密码和两步验证。 |

`Roles.normalize()` 会把历史遗留和自由文本值（`Administrator`、`read-only`、
大小写混杂等）归并到这一标准集合；任何无法识别的值都会变成 `admin`。

与这三种角色正交的是 `superadmin`：它是一个*平台级*标志而非角色，会完全绕过组织
范围限制。

## 隔离是如何实施的

四层机制，刻意叠加，使任何单一疏漏都不至于泄露数据：

1. **`TenantContext`** —— 一个请求作用域的 bean，用于解析调用者的有效组织，
   由 `AuthFilter.resolveTenant()` 填充。
2. **Hibernate `@Filter("orgFilter")`** —— 作用于每个受限实体，按请求启用，
   为查询追加 `org_id = :orgId`。
3. **`OrgStamp`，一个 `@PrePersist` 监听器** —— 在创建时从上下文写入 `org_id`，
   因此任何写入路径都不可能遗漏它。
4. **按 id 查询使用 HQL。** REST 资源使用 `find("id", …).firstResult()` 而非
   `findById()`，因为按主键加载会完全绕过 Hibernate 过滤器。这一点很微妙 ——
   正是它使得 `GET /api/domains/<其他组织的id>` 返回 404 而不是数据行。

超级管理员默认不受范围限制，可通过传递 `X-Ravix-Org` 请求头或 `org` 查询参数
在某个租户内部操作。

跨组织的读写返回 **404 而非 403** —— 403 会变相确认该数据行存在。

## 自行验证隔离

`TenantFilterTest` 在真实 PostgreSQL 上覆盖了持久化层：两个组织下的三个域名，
断言每个组织只能看到自己的域名，且不加过滤时所有数据行依然存在。

这证明过滤器在会话层面有效，但**并不能**证明约 39 个 REST 资源全都正确启用了它。
在生产环境中信赖它之前，请在运行中的服务器上做端到端验证：

1. 创建组织 B；在 Default 中放一个域名，在 B 中放一个域名。
2. 添加一个非超级管理员用户，仅加入 B。
3. 以该用户登录 —— `GET /api/domains` 必须**只**返回 B 的域名。
4. `GET /api/domains/<Default 的域名 id>` 必须返回 **404**。
5. 超级管理员不带 `X-Ravix-Org` 时能看到两者；带 `X-Ravix-Org: <B>` 时只看到 B 的。

如果第 3 或第 4 步发生泄露，说明过滤器未在查询所用会话上生效 —— 修复方式是通过
租户资源上的 CDI 拦截器在事务内部启用它，而不是在 JAX-RS 过滤器中启用。
若你遇到这种情况，请[提交问题报告](https://github.com/tnAnGel/Ravix/issues)。

## 配额

`Organization` 带有 `quota_domains`、`quota_mailboxes` 和 `quota_storage_mb`。
`0` 表示不限。强制执行尚不完整 —— 在 0.1 中请把配额字段视为参考值，
而非硬性限制。

## 迁移与升级

`V13__multi_tenant.sql` 向后兼容。升级单租户安装时会创建一个 `Default` 组织，
将所有受限数据行回填进去，并把既有管理员设为其所有者并赋予 `superadmin` 标志。
行为与迁移之前完全一致 —— 只有当你创建第二个组织时，才会真正感受到多租户。

## API

| 接口 | 用途 |
| --- | --- |
| `/api/organizations` | 供超级管理员对组织及其成员进行增删改查。 |
| `/api/auth/me` | 返回 `superadmin` 标志与调用者的 `orgs` 列表。 |
| `X-Ravix-Org: <id>` | 超级管理员用于在某个租户内部操作的请求头。 |

## 坦诚的局限

- **前端覆盖不完整** —— 组织切换器与成员管理尚未在每个页面上完整呈现。
- **配额未被强制执行。**
- **邮件栈是共享的。** 租户无法拥有自己的 Postfix 调优、独立 IP 或独立的 TLS 策略。
- **运营方全局数据未按租户过滤展示** —— 租户看不到属于自己的队列或 DMARC 报告视图。
- **没有邀请流程。** 成员由超级管理员添加。

如果你正考虑用 Ravix 做分销托管，请预留时间自行审查隔离机制。该机制设计合理，
并在持久化层有测试覆盖，但尚未经受一个真正的多客户产品所应有的对抗性审查。
