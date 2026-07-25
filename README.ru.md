<div align="center">

<img src="public/favicon.svg" alt="Ravix" width="88" height="88">

# Ravix

### Частная почтовая инфраструктура под вашим контролем.

Self-hosted панель управления настоящим почтовым сервером на Linux — Postfix,
Dovecot, Rspamd, OpenDKIM и Certbot, разворачиваемые и обслуживаемые из одного
дашборда.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-2b6cb0.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tnAnGel/Ravix/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/tnAnGel/Ravix/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tnAnGel/Ravix?style=flat-square&color=6b46c1&include_prereleases)](https://github.com/tnAnGel/Ravix/releases)
[![Java 21](https://img.shields.io/badge/Java-21-e11d48?style=flat-square)](https://adoptium.net/)
[![React 18](https://img.shields.io/badge/React-18-0891b2?style=flat-square)](https://react.dev/)

**[Документация](docs/ru/README.md)** ·
[English](README.md) · **Русский** · [中文](README.zh.md)

</div>

---

<div align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="Дашборд Ravix" width="100%">
</div>

---

## Что это

Ravix — **не почтовый сервер**. Это control plane для него.

Вы даёте чистый хост с Debian или Ubuntu; Ravix ставит на него Postfix, Dovecot,
Rspamd и OpenDKIM, рендерит их конфигурацию из базы, которую вы правите через
веб-интерфейс, и следит за тем, от чего реально зависит доставка почты —
DNS-записями, подписями DKIM, отчётами DMARC, блок-листами, состоянием TLS и
репутацией отправителя.

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

Одна команда, ~30–60 секунд — и панель готова. Подробности в
**[Установке](docs/ru/installation.md)**.

> [!WARNING]
> **Ravix 0.1 — пре-релиз.** Сессии живут в `HttpOnly`-cookie, попытки входа
> ограничены, CORS сведён к same-origin — но **бэкенд по-прежнему работает от
> root**, потому что разворачивает почтовый стек. Считайте доступ к панели
> равным root-доступу. Прочитайте **[Безопасность](docs/ru/security.md)** перед
> тем, как направлять на панель публичное DNS-имя: оставшиеся слабые места
> задокументированы, а не скрыты.

## Возможности

<table>
<tr>
<td width="50%" valign="top">

### 📮 Почтовая платформа
- Домены, ящики, алиасы и Sieve-фильтры
- Развёртывание Postfix / Dovecot / Rspamd / OpenDKIM
- Управление пакетами и сервисами через `apt` и `systemd`
- Очередь Postfix: просмотр, повтор, удержание, удаление
- Сертификаты Let's Encrypt через Certbot
- Встроенный вебмейл с папками, поиском и написанием писем
- CalDAV / CardDAV через Radicale

</td>
<td width="50%" valign="top">

### 📈 Доставляемость
- Живые проверки MX / SPF / DKIM / DMARC / PTR по доменам
- Генерация 2048-битных DKIM-ключей с подсказками по DNS
- Приём агрегированных отчётов DMARC и аналитика по источникам
- Состояние MTA-STS, TLS-RPT и DANE / TLSA
- Мониторинг RBL / DNSBL с историей
- Скользящая репутация отправки за 30 дней
- Дневные лимиты прогрева IP и подавление по жалобам FBL

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔐 Контроль доступа
- Хеширование паролей BCrypt, сессионная аутентификация
- Двухфакторная аутентификация TOTP
- Роли `owner` / `admin` / `viewer`
- Организации с изоляцией арендаторов
- API-ключи для автоматизации (`rvx_live_…`)
- Журнал аудита всех изменяющих действий

</td>
<td width="50%" valign="top">

### 🛠 Эксплуатация
- Дашборд с живым состоянием системы и сервисов
- Просмотр логов Postfix, Dovecot, Rspamd, Nginx
- Рассылки с троттлингом, шаблонами и сегментами
- API транзакционной отправки
- Интеграция с Cloudflare для публикации DNS-записей
- CLI `ravixctl` для тех, кто любит консоль
- Документация на русском, английском и китайском

</td>
</tr>
</table>

## Скриншоты

<table>
<tr>
<td width="50%"><img src="docs/assets/screenshots/domains.png" alt="Домены"><br><sub><b>Домены</b> — живой статус MX / SPF / DKIM / DMARC / PTR по каждому домену.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/webmail.png" alt="Вебмейл"><br><sub><b>Вебмейл</b> — папки, поиск, панель чтения и написание писем — встроенные.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/screenshots/mailboxes.png" alt="Ящики"><br><sub><b>Ящики</b> — квоты, фильтры, подписи и управление паролями.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/platform.png" alt="Платформа"><br><sub><b>Платформа</b> — установка и надзор за Postfix, Dovecot, Rspamd и остальным.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/screenshots/deliverability.png" alt="Репутация"><br><sub><b>Репутация</b> — оценка отправки за 30 дней, график прогрева и подавление жалоб.</sub></td>
<td width="50%"><img src="docs/assets/screenshots/tls-security.png" alt="MTA-STS / TLS"><br><sub><b>MTA-STS / TLS</b> — состояние MTA-STS, TLS-RPT и DANE по доменам.</sub></td>
</tr>
</table>

## Архитектура

```text
                    ┌──────────────────────────────────────────┐
   Браузер ────────▶│  Nginx  :9162                            │
                    │    /       → /var/www/ravix  (Vite dist) │
                    │    /api/   → 127.0.0.1:8080              │
                    └───────────────────┬──────────────────────┘
                                        │
                             ┌──────────▼───────────┐
                             │  Бэкенд Quarkus      │
                             └──┬────────────────┬──┘
                                │                │
                  ┌─────────────▼──┐    ┌────────▼──────────────────────┐
                  │  PostgreSQL    │    │  Linux-хост                   │
                  │  владеет Flyway│    │  systemd · apt · postmap      │
                  └────────────────┘    │  /etc/postfix · DNS · certbot │
                                        └───────────────────────────────┘
```

**PostgreSQL — источник истины; конфиги почтового стека — производный артефакт.**
Вы правите данные в панели, нажимаете **Применить**, и `ProvisioningService`
рендерит карты Postfix, файл пользователей Dovecot, таблицы ключей OpenDKIM и
оверрайды Rspamd, после чего перезагружает сервисы.

| Слой | Технологии |
| --- | --- |
| Фронтенд | React 18 · TypeScript · Vite · Tailwind · i18next |
| Бэкенд | Java 21 · Quarkus 3 · Hibernate Panache · Flyway |
| База | PostgreSQL 14+ |
| Под управлением | Postfix · Dovecot · Rspamd · Redis · OpenDKIM · Certbot · Nginx · Radicale |

Подробности — в **[Архитектуре](docs/ru/architecture.md)**.

## Требования

| | Минимум | Рекомендуется |
| --- | ---: | ---: |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 2 ГБ | 4 ГБ |
| Диск | 10 ГБ SSD | 80+ ГБ SSD |

Основная цель — Debian 12; Ubuntu 22.04/24.04 LTS работает на той же модели
`apt` + `systemd`. Поддерживаются `amd64` и `arm64`.

Две вещи определяют, заработает ли это вообще, и ни одна из них не в руках Ravix:
**исходящий порт 25 должен быть открыт** (большинство облачных провайдеров
блокируют его по умолчанию) и **у вашего IP должна быть PTR-запись**. См.
[DNS и доставляемость](docs/ru/dns-deliverability.md).

## Документация

| | Русский | English | 中文 |
| --- | --- | --- | --- |
| Оглавление | [docs/ru](docs/ru/README.md) | [docs/en](docs/en/README.md) | [docs/zh](docs/zh/README.md) |
| Установка | [Установка](docs/ru/installation.md) | [Installation](docs/en/installation.md) | [安装](docs/zh/installation.md) |
| Конфигурация | [Конфигурация](docs/ru/configuration.md) | [Configuration](docs/en/configuration.md) | [配置](docs/zh/configuration.md) |
| Архитектура | [Архитектура](docs/ru/architecture.md) | [Architecture](docs/en/architecture.md) | [架构](docs/zh/architecture.md) |
| Почтовый стек | [Почтовый стек](docs/ru/mail-stack.md) | [Mail stack](docs/en/mail-stack.md) | [邮件栈](docs/zh/mail-stack.md) |
| Доставляемость | [DNS](docs/ru/dns-deliverability.md) | [DNS](docs/en/dns-deliverability.md) | [DNS](docs/zh/dns-deliverability.md) |
| CLI | [ravixctl](docs/ru/cli.md) | [ravixctl](docs/en/cli.md) | [ravixctl](docs/zh/cli.md) |
| API | [REST API](docs/ru/api.md) | [REST API](docs/en/api.md) | [REST API](docs/zh/api.md) |
| Безопасность | [Безопасность](docs/ru/security.md) | [Security](docs/en/security.md) | [安全](docs/zh/security.md) |
| Диагностика | [Диагностика](docs/ru/troubleshooting.md) | [Troubleshooting](docs/en/troubleshooting.md) | [故障排查](docs/zh/troubleshooting.md) |

## Разработка

```bash
# PostgreSQL (dev-URL по умолчанию ждёт порт 54322)
docker run -d --name ravix-pg -p 54322:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16

# Бэкенд — :8080, Swagger UI на /api/swagger
cd backend && ./mvnw quarkus:dev

# Фронтенд — :5173, проксирует /api на бэкенд
npm install && npm run dev
```

Тесты:

```bash
npm run lint && npm test          # типизация + vitest
cd backend && mvn verify          # юниты + интеграционные (нужен Docker)
```

CI прогоняет всё это на каждый push и pull request. Перед тем как открывать PR,
загляните в **[CONTRIBUTING.md](CONTRIBUTING.md)** — у Ravix намеренно
ограниченная область и короткий список того, чего в нём не будет.

## Планы

Честно о том, что ещё не сделано:

- [x] Сессии на `HttpOnly` / `SameSite=Strict` cookie
- [x] Ограничение частоты попыток входа с блокировкой
- [x] Same-origin CORS вместо wildcard
- [x] Убран дефолтный пароль администратора
- [ ] Увести бэкенд с root на узкий привилегированный хелпер + `sudoers`
- [ ] Dry-run, дифф и откат для генерируемых конфигов почтового стека
- [ ] Настоящий просмотр почты через Maildir/IMAP в вебмейле
- [ ] Полные сценарии аварийного восстановления
- [ ] Принуждение квот для организаций

## Безопасность

Нашли уязвимость? **Не открывайте публичный issue** — сообщите приватно через
[GitHub Security Advisories](https://github.com/tnAnGel/Ravix/security/advisories/new).
Полная политика и список известных слабых мест: **[SECURITY.md](SECURITY.md)**.

## Лицензия

Ravix распространяется под **[GNU Affero General Public License v3.0](LICENSE)**.

Кратко: вы вправе свободно запускать, изучать, изменять и распространять его.
Если вы изменили Ravix и предоставляете его другим **по сети**, вы обязаны
предоставить им и полный исходный код вашей изменённой версии на той же лицензии.
Именно этот сетевой пункт — суть выбора: он не даёт превратить хостируемый форк
в закрытый продукт.

Copyright © 2025–2026 **Максим Беляков**. Об авторстве, товарном знаке и условиях
коммерческого лицензирования — в **[NOTICE](NOTICE)**.

---

<div align="center">

**Автор и мейнтейнер — Максим Беляков**

[GitHub](https://github.com/tnAnGel) · [Telegram @Namnes](https://t.me/Namnes) · [darkzeit00@gmail.com](mailto:darkzeit00@gmail.com)

</div>
