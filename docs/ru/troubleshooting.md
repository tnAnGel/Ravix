# Диагностика

[← К оглавлению](README.md) · [English](../en/troubleshooting.md) · [中文](../zh/troubleshooting.md)

---

## С чего начать

```bash
sudo ravixctl doctor          # сервис, API, база, nginx
sudo ravixctl logs 200        # логи панели
sudo journalctl -u ravix -n 200 --no-pager
sudo tail -200 /var/log/mail.log
```

`doctor` показывает, *какой* слой лежит; логи говорят почему.

---

## Панель недоступна

**1. Работает ли бэкенд?**

```bash
sudo systemctl status ravix
sudo journalctl -u ravix -n 100 --no-pager
```

Частые причины:

| Симптом в логе | Причина |
| --- | --- |
| `Connection refused` к PostgreSQL | PostgreSQL не запущен: `sudo systemctl start postgresql`. |
| `password authentication failed` | `RAVIX_DB_PASSWORD` в `/etc/ravix/ravix.env` больше не совпадает с ролью. |
| `Flyway ... validate failed` | Схема разошлась с миграциями, обычно после ручной правки. |
| `Address already in use` | Порт 8080 занят: `sudo ss -lptn 'sport = :8080'`. |

**2. Отвечает ли API локально?**

```bash
curl -i http://127.0.0.1:8080/api/auth/status
```

Если здесь работает, а в браузере нет — проблема в Nginx или файрволе.

**3. Nginx**

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -50 /var/log/nginx/error.log
```

**4. Файрвол**

```bash
sudo ufw status
```

Порт панели по умолчанию `9162`, не 443. Если вы — правильно — сузили его до
своего IP при усилении безопасности, а IP с тех пор сменился, вот и ответ.

---

## Я заблокирован

```bash
sudo ravixctl reset-admin admin@example.com 'новый-надёжный-пароль'
```

Если мешает 2FA, очистите секрет для аккаунта напрямую:

```bash
sudo -u postgres psql -d ravix \
  -c "UPDATE ravix.admin_user SET two_factor_secret = NULL WHERE email = 'admin@example.com';"
```

---

## Почта не отправляется

### Сначала смотрите очередь

```bash
sudo postqueue -p | tail -30
```

Причина отсрочки называет проблему.

| Причина | Смысл | Решение |
| --- | --- | --- |
| `Connection timed out` на порт 25 | **Провайдер блокирует исходящий SMTP.** | Откройте тикет в поддержку. Почти все облачные провайдеры блокируют 25-й порт по умолчанию. Это причина №1 с большим отрывом. |
| `550 ... no PTR` / `does not resolve` | Отсутствующая или несовпадающая обратная зона. | Настройте PTR у хостера; см. [DNS](dns-deliverability.md#2-ptr--та-которую-вы-не-поставите-сами). |
| `554 ... blocked using ...` | Вы в блок-листе. | Смотрите раздел **RBL**, устраните причину, затем запрашивайте делистинг. |
| `Relay access denied` | Postfix не считает себя ответственным за домен. | Домена нет в `virtual_domains` — примените конфигурацию. |
| `SASL authentication failed` | Неверные учётные данные клиента. | Сбросьте пароль ящика в панели и примените заново. |

Проверьте, что 25-й порт действительно открыт:

```bash
nc -zv gmail-smtp-in.l.google.com 25
```

Таймаут здесь — окончательный вердикт: дело в провайдере, а не в вашей настройке.

### Почта уходит, но попадает в спам

Пройдите [чеклист доставляемости](dns-deliverability.md#рабочий-чеклист). На
практике это почти всегда PTR, SPF, DKIM или совсем новый IP без прогрева.

---

## Почта не приходит

**1. Маршрутизирует ли внешний мир почту к вам?**

```bash
dig +short MX example.com
dig +short A mail.example.com
```

MX должен указывать на имя хоста с A-записью — не на IP и не на CNAME.

**2. Принимает ли 25-й порт соединения?**

```bash
nc -zv mail.example.com 25
```

**3. Считает ли Postfix домен своим?**

```bash
sudo postmap -q example.com hash:/etc/postfix/ravix/virtual_domains
```

Пустой вывод означает, что домен не попал в сгенерированный конфиг — добавьте
его в панели и выполните `sudo ravixctl apply`.

**4. Есть ли ящик в карте?**

```bash
sudo postmap -q user@example.com hash:/etc/postfix/ravix/virtual_mailboxes
```

**5. Смотрите доставку вживую**

```bash
sudo tail -f /var/log/mail.log
```

---

## DNS-проверки падают, хотя запись есть

- **Распространение.** Запись не видна везде мгновенно. Дождитесь истечения TTL
  той записи, которую заменили, затем `sudo ravixctl recheck`.
- **Расхождение резолверов.** Сравните то, что видит Ravix, с публичными:
  ```bash
  dig +short TXT example.com @1.1.1.1
  dig +short TXT example.com @8.8.8.8
  ```
- **Отключён JNDI.** Если *все* DNS-проверки возвращают пустоту, а не ошибку —
  выключен `quarkus.naming.enable-jndi`. Ravix использует DNS-провайдер JDK, а
  Quarkus отключает JNDI по умолчанию; поставляемый `application.properties`
  включает его обратно. Проблема характерна для самосборных билдов.
- **Две SPF-записи.** Две TXT `v=spf1` — перманентная ошибка, а не слияние.
  Держите ровно одну.

---

## Применение сломало почтовый стек

```bash
sudo postfix check
sudo systemctl status postfix dovecot rspamd opendkim
```

`postfix check` назовёт файл и строку. Если вы сделали бэкап, рекомендованный в
[Почтовом стеке](mail-stack.md):

```bash
sudo systemctl stop postfix
sudo rm -rf /etc/postfix && sudo cp -a /root/postfix.bak /etc/postfix
sudo systemctl start postfix
```

Затем заведите [issue](https://github.com/tnAnGel/Ravix/issues) со сломавшимся
сгенерированным конфигом — плохой рендер это баг, который стоит починить.

---

## Установка упала

**«This installer targets Debian/Ubuntu»** — нет `apt-get`. Слой провижининга
Ravix намеренно заточен под Debian/Ubuntu.

**«Run as root (sudo).»** — используйте `sudo`.

**«Checksum verification failed — refusing to install.»** — скачанные артефакты
не совпали с `SHA256SUMS`. Обычно это оборванная загрузка или прокси,
переписывающий ответ. Повторите; если повторяется — сообщите, но не обходите
проверку.

**«No installable release found (mode=release).»** — нет подходящего
опубликованного релиза. Уберите `RAVIX_INSTALL_MODE=release`, чтобы откатиться
на сборку из исходников, или укажите существующий тег через `RAVIX_VERSION`.

**Java 21 не ставится.** Установщик добавляет репозиторий Adoptium, если
`openjdk-21-jre-headless` недоступен. На нестандартном дистрибутиве поставьте
JRE 21 сами, затем перезапустите.

**Сборке из исходников не хватает памяти.** Компиляция Quarkus и бандл Vite на
хосте с 1 ГБ — впритык. Добавьте swap или используйте путь через релиз.

---

## Куда обращаться

Заведите [issue](https://github.com/tnAnGel/Ravix/issues) с выводом:

```bash
sudo ravixctl version
sudo ravixctl doctor
sudo ravixctl logs 200
```

Вычистите домены, IP и API-ключи — issue публичный. По проблемам безопасности
используйте [SECURITY.md](../../SECURITY.md), а не публичный issue.
