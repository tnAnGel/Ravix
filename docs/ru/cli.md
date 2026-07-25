# CLI — `ravixctl`

[← К оглавлению](README.md) · [English](../en/cli.md) · [中文](../zh/cli.md)

---

`ravixctl` ставится в `/usr/local/bin/ravixctl` и управляет установкой Ravix из
командной строки. Все команды требуют root.

```bash
sudo ravixctl <команда>
```

Учётные данные и порты читаются из `/etc/ravix/ravix.env`; путь переопределяется
переменной `RAVIX_ENV_FILE`.

## Управление сервисом

| Команда | Действие |
| --- | --- |
| `ravixctl status` | `systemctl status ravix`. |
| `ravixctl start` | Запустить сервис. |
| `ravixctl stop` | Остановить. |
| `ravixctl restart` | Перезапустить — нужно после правки `ravix.env`. |
| `ravixctl enable` | Запускать при загрузке. |
| `ravixctl disable` | Не запускать при загрузке. |

## Логи

```bash
sudo ravixctl logs           # последние записи
sudo ravixctl logs -f        # следить
sudo ravixctl logs 500       # последние 500 строк
```

Для *почтовых* логов, а не логов панели, используйте страницу **Логи** в панели
или читайте `/var/log/mail.log` напрямую.

## `doctor`

Первое, что стоит запустить, когда что-то не так.

```bash
sudo ravixctl doctor
```

Проверяет по порядку:

- активен ли systemd-сервис `ravix`;
- отвечает ли API на `http://127.0.0.1:8080/api/auth/status`;
- доступна ли база PostgreSQL;
- активен ли Nginx.

Неактивный Nginx помечается как информация, а не ошибка — бэкенд может работать
без него, просто панель недоступна.

## `version`

```bash
sudo ravixctl version
```

Печатает запущенную версию. Прикладывайте к
[баг-репортам](https://github.com/tnAnGel/Ravix/issues).

## `apply`

```bash
sudo ravixctl apply
```

Рендерит конфигурацию почтового стека из базы и перезагружает затронутые
сервисы — то же, что кнопка **Платформа → Применить**. См.
[Почтовый стек](mail-stack.md).

Dry-run и отката пока нет. Сначала сделайте бэкап.

## `recheck`

```bash
sudo ravixctl recheck
```

Перезапускает живые проверки MX / SPF / DKIM / DMARC / PTR по всем доменам.
Полезно сразу после изменения DNS и в качестве cron-задачи:

```cron
0 6 * * * /usr/local/bin/ravixctl recheck >/dev/null 2>&1
```

## `backup`

```bash
sudo ravixctl backup
```

Создаёт бэкап и регистрирует его в списке бэкапов панели. Файлы кладутся в
`/var/lib/ravix/backups`.

> ⚠️ *Создание* бэкапов работает; полноценные сценарии восстановления следует
> считать незавершёнными. Не полагайтесь на это как на единственную копию —
> забирайте бэкапы с хоста и проверяйте восстановление до того, как оно
> понадобится.

## `update`

```bash
sudo ravixctl update
```

Работает только на **source**-установке, где `/opt/ravix/src` — git-чекаут. Что
делает:

1. выполняет `git pull --ff-only` в `/opt/ravix/src`;
2. самообновляет `/usr/local/bin/ravixctl`, если тот изменился (атомарно, чтобы
   не повредить работающую копию — новая логика применится со следующего
   запуска);
3. пересобирает бэкенд (`mvn -DskipTests package`);
4. пересобирает фронтенд (`npm ci && npm run build`);
5. останавливает сервис, целиком заменяет `/opt/ravix/quarkus-app` и
   `/var/www/ravix`, запускает снова.

Поскольку скрипт работает под `set -euo pipefail`, **упавшая сборка прерывает
всё до деплоя** — сломанный коммит не может заменить рабочую установку. В конце
печатается задеплоенный коммит.

На **release**-установке вместо этого перезапустите установщик:

```bash
curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
```

## `reset-admin`

```bash
sudo ravixctl reset-admin admin@example.com 'новый-надёжный-пароль'
```

Путь восстановления, когда вы заблокированы в панели. Оба аргумента обязательны.
Пароль берите в кавычки, чтобы шелл его не испортил, и ставьте пробел перед
командой, если шелл пишет историю.

Сбрасывается только пароль. Если вход блокирует 2FA — отключите её для аккаунта
в базе или заведите issue: флага `--disable-2fa` пока нет.

## Типичные сценарии

**После изменения DNS:**

```bash
sudo ravixctl recheck
```

**После добавления доменов или ящиков в панели:**

```bash
sudo ravixctl backup
sudo ravixctl apply
sudo ravixctl doctor
```

**Что-то сломалось:**

```bash
sudo ravixctl doctor
sudo ravixctl logs 200
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

**Плановое обновление:**

```bash
sudo ravixctl backup
sudo ravixctl update
sudo ravixctl doctor
```
