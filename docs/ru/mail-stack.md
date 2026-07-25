# Почтовый стек

[← К оглавлению](README.md) · [English](../en/mail-stack.md) · [中文](../zh/mail-stack.md)

---

Установка Ravix ставит *панель*. Сам почтовый сервер ставится потом, из панели,
в разделе **Платформа → Установка ПО**.

## Компоненты, которыми управляет Ravix

| Компонент | Пакет(ы) | Роль |
| --- | --- | --- |
| **Postfix** | `postfix` | SMTP / MTA |
| **Dovecot** | `dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-sieve` | IMAP, POP3, доставка по LMTP, фильтры Sieve |
| **Rspamd** | `rspamd` | Фильтрация и скоринг спама |
| **Redis** | `redis` | Кеш-бэкенд для Rspamd |
| **OpenDKIM** | `opendkim` | Milter подписи DKIM |
| **Certbot** | `certbot` | ACME-клиент Let's Encrypt |
| **Nginx** | `nginx` | Обратный прокси, вебмейл |
| **PostgreSQL** | `postgresql` | База панели |
| **fail2ban** | `fail2ban` | Защита от перебора для SSH / SMTP / IMAP |
| **Radicale** | `radicale` | Календари и контакты (CalDAV / CardDAV) |

Для каждого показывается установленная версия, состояние сервиса и наличие
обновления. Ravix ставит через `apt`, то есть пакеты берутся из репозиториев
вашего дистрибутива.

## Рекомендуемый порядок

1. **Установите компоненты** — минимум Postfix, Dovecot, Rspamd, Redis и
   OpenDKIM. Radicale — только если нужны календари.
2. **Добавьте первый домен** в разделе **Домены** и опубликуйте DNS-записи,
   которые сгенерирует Ravix. См. [DNS и доставляемость](dns-deliverability.md).
3. **Сгенерируйте DKIM-ключ** для домена и опубликуйте DNS-запись.
4. **Создайте ящики** в разделе **Ящики**.
5. **Примените конфигурацию** — **Платформа → Применить**.
6. **Проверьте** — отправьте письмо туда и обратно, посмотрите **Логи** и
   **Очередь**.

Ничто из введённого в панели не доходит до Postfix и Dovecot, пока вы не
нажмёте «Применить».

## Что генерирует «Применить»

`ProvisioningService` рендерит базу в конфиги и перезагружает затронутые сервисы.

| Файл | Содержимое |
| --- | --- |
| `/etc/postfix/ravix/virtual_domains` | Все активные домены. |
| `/etc/postfix/ravix/virtual_mailboxes` | Карта «ящик → путь Maildir». |
| `/etc/postfix/ravix/virtual_aliases` | Карта «алиас → получатель». |
| `/etc/dovecot/ravix-users` | Записи `passwd-file` с BCrypt-хешами. |
| `/etc/opendkim/` | Таблица ключей, таблица подписи, доверенные хосты, приватные ключи. |
| `/etc/rspamd/local.d/` | Пороги оценок, списки разрешений/блокировок, настройки DKIM. |

Соответствующие настройки Postfix:

```text
virtual_mailbox_domains = hash:/etc/postfix/ravix/virtual_domains
virtual_mailbox_maps    = hash:/etc/postfix/ravix/virtual_mailboxes
virtual_alias_maps      = hash:/etc/postfix/ravix/virtual_aliases
virtual_mailbox_base    = /var/vmail
virtual_transport       = lmtp:unix:private/dovecot-lmtp
```

Ravix выполняет `postmap` для hash-карт и перезагружает Postfix, Dovecot,
OpenDKIM и Rspamd по необходимости.

> **Эти файлы генерируются.** Править их руками бессмысленно — следующее
> применение перезапишет. Меняйте данные в панели. Настройки *вне*
> `/etc/postfix/ravix/`, `/etc/rspamd/local.d/` и `/etc/dovecot/ravix-users`
> не трогаются.

## Хранение почты

Почта хранится в формате Maildir под `/var/vmail`, владелец — пользователь
`vmail` (uid/gid `5000` по умолчанию). Доставка идёт Postfix → Dovecot LMTP →
Maildir, то есть форматом ящиков и учётом квот владеет Dovecot.

Базовый путь и владельца переопределяют `RAVIX_VMAIL_BASE`, `RAVIX_VMAIL_UID` и
`RAVIX_VMAIL_GID` — см. [Конфигурацию](configuration.md).

## Sieve-фильтры и подписи

Фильтры на ящик (**Ящики → Фильтры**) компилируются `SieveService` в
Sieve-скрипты и применяются Dovecot при доставке. Подписи хранятся в базе и
подставляются окном написания письма в панели, а не MTA — письмо, отправленное
из внешнего IMAP-клиента, подпись не получит.

## TLS-сертификаты

Раздел **Сертификаты** управляет Let's Encrypt через Certbot: выпуск, список
сроков и продление. Postfix и Dovecot указываются на файлы в
`/etc/letsencrypt/live/<host>/`.

Для почтового сертификата используйте **почтовое имя хоста** (например
`mail.example.com`) — оно должно совпадать с тем, куда указывает MX, иначе у
отправляющих серверов, которые это проверяют, не сойдётся TLS. Сертификат самой
панели — отдельный.

## Как применять безопасно

Dry-run, диффа и отката пока нет — применение сразу пишет и перезагружает. Пока
это не сделано:

```bash
sudo ravixctl backup                 # перед применением
sudo cp -a /etc/postfix /root/postfix.bak
sudo ravixctl apply                  # или кнопка в панели
sudo ravixctl doctor
sudo ravixctl logs 200
```

Если после применения Postfix не стартует, `postfix check` назовёт проблемную
строку; восстановите бэкап и заведите
[issue](https://github.com/tnAnGel/Ravix/issues).

## Очередь

Раздел **Очередь** — обёртка над очередью Postfix: просмотр отложенных и
удержанных писем с причиной, повтор, удержание и удаление отдельных элементов,
сводка по состояниям. Растущая очередь с `Connection timed out` на 25-м порту
почти всегда означает, что провайдер блокирует исходящий SMTP — см.
[Диагностику](troubleshooting.md#почта-не-отправляется).
