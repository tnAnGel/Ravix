package sh.ravix.platform;

import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import sh.ravix.dto.QueueSummaryDto;
import sh.ravix.entity.QueueItem;

/**
 * Reads the live Postfix queue via {@code postqueue -p}. Falls back to the
 * panel's {@code queue_item} table when Postfix isn't present (dev machine).
 */
@ApplicationScoped
public class QueueService {

    @Inject
    PlatformService platform;

    /**
     * Hard ceiling on how many entries one request materialises. A backlog
     * deeper than this is an incident in its own right — the panel shows the
     * newest slice, and {@link #summary()} still counts the whole queue.
     */
    @org.eclipse.microprofile.config.inject.ConfigProperty(
            name = "ravix.queue.max-items", defaultValue = "500")
    int maxItems;

    /** All queue items (live if available, else DB), newest first. */
    public List<QueueItem> items() {
        List<QueueItem> live = live();
        if (live != null) return live;
        return QueueItem.listAll(Sort.by("queuedAt").descending());
    }

    /** Newest-first slice, never longer than {@code ravix.queue.max-items}. */
    public List<QueueItem> items(String state) {
        List<QueueItem> all = items();
        if (state != null && !state.isBlank() && !"all".equals(state)) {
            all = all.stream().filter(q -> state.equals(q.state)).toList();
        }
        return all.size() <= maxItems ? all : List.copyOf(all.subList(0, maxItems));
    }

    public QueueSummaryDto summary() {
        List<QueueItem> all = items();
        long active = all.stream().filter(q -> "active".equals(q.state)).count();
        long deferred = all.stream().filter(q -> "deferred".equals(q.state)).count();
        long hold = all.stream().filter(q -> "hold".equals(q.state)).count();
        long failed = all.stream().filter(q -> "failed".equals(q.state)).count();
        OffsetDateTime oldest = all.stream()
                .filter(q -> "deferred".equals(q.state) && q.queuedAt != null)
                .map(q -> q.queuedAt)
                .min(OffsetDateTime::compareTo)
                .orElse(null);
        return new QueueSummaryDto(active, deferred, hold, failed,
                active + deferred + hold + failed, oldest);
    }

    /** Returns null when Postfix/mailq is unavailable (so the caller can fall back). */
    private List<QueueItem> live() {
        if (!platform.isLinux()) return null;
        Optional<String> out = platform.run(10, "postqueue", "-p");
        if (out.isEmpty()) return null;
        String text = out.get();
        if (text.toLowerCase().contains("mail queue is empty")) {
            return List.of();
        }
        return parse(text);
    }

    /** Parse `postqueue -p` / `mailq` output into queue items. */
    static List<QueueItem> parse(String text) {
        List<QueueItem> items = new ArrayList<>();
        String[] lines = text.split("\n");
        int i = 0;
        // Skip the header line(s).
        while (i < lines.length && (lines[i].startsWith("-Queue ID") || lines[i].isBlank())) {
            i++;
        }
        OffsetDateTime now = OffsetDateTime.now();

        while (i < lines.length) {
            String first = lines[i];
            if (first.isBlank() || first.startsWith("--")) {
                i++;
                continue;
            }
            String[] tok = first.trim().split("\\s+");
            if (tok.length < 2) {
                i++;
                continue;
            }
            QueueItem q = new QueueItem();
            String id = tok[0];
            String state = "deferred";
            if (id.endsWith("*")) {
                state = "active";
                id = id.substring(0, id.length() - 1);
            } else if (id.endsWith("!")) {
                state = "hold";
                id = id.substring(0, id.length() - 1);
            }
            q.id = id;
            try {
                q.sizeKb = Math.max(1, Integer.parseInt(tok[1]) / 1024);
            } catch (NumberFormatException e) {
                q.sizeKb = 0;
            }
            q.sender = tok[tok.length - 1];
            q.subject = "—";
            q.attempts = 1;
            q.queuedAt = now;

            // Following lines: optional "(reason)" then recipient address(es).
            i++;
            String reason = null;
            String recipient = null;
            while (i < lines.length && !lines[i].isBlank() && !lines[i].startsWith("--")) {
                String l = lines[i].trim();
                if (l.startsWith("(") && l.endsWith(")")) {
                    reason = l.substring(1, l.length() - 1);
                } else if (recipient == null && l.contains("@")) {
                    recipient = l;
                }
                i++;
            }
            q.reason = reason;
            q.recipient = recipient == null ? "" : recipient;
            q.domain = recipient != null && recipient.contains("@")
                    ? recipient.substring(recipient.indexOf('@') + 1) : "";
            q.state = state;
            classify(q);
            items.add(q);
        }
        return items;
    }

    /** Translate Postfix's terse deferred-reason into a plain-language
     *  explanation + a stable code so the UI can group identical causes.
     *  Falls back to (null, "other") on unknown reasons so the operator
     *  still sees the raw line. */
    static void classify(QueueItem q) {
        String r = q.reason == null ? "" : q.reason.toLowerCase();
        if (r.isEmpty()) return;

        // Network — provider blocks outbound :25 or destination is dead
        if (r.contains("connection timed out") && r.contains(":25")) {
            q.hintCode = "timeout-25";
            q.hint = "Не достучаться до получателя по порту 25 — либо ваш хостер блокирует исходящий TCP 25, либо у получателя только IPv4-MX, а у вас IPv6-only канал. Решение: настройте SMTP relay (Settings → Outbound relay) или попросите провайдера разблокировать 25.";
            return;
        }
        if (r.contains("connection refused")) {
            q.hintCode = "refused";
            q.hint = "Получающий сервер активно отвергает соединение. Скорее всего MX-запись указывает на неработающий хост.";
            return;
        }
        if (r.contains("no route to host") || r.contains("network is unreachable")) {
            q.hintCode = "no-route";
            q.hint = "Нет маршрута к серверу получателя. Проверьте сетевой стек хоста и DNS.";
            return;
        }
        if (r.contains("name or service not known") || r.contains("host not found")
                || r.contains("no address associated")) {
            q.hintCode = "dns-fail";
            q.hint = "DNS-имя получателя не резолвится. Возможно домен не существует или его MX-запись сломана.";
            return;
        }
        // Authentication / sender reputation rejections
        if (r.contains("ipv6") && (r.contains("ptr") || r.contains("does not meet"))) {
            q.hintCode = "ipv6-ptr";
            q.hint = "Gmail/Outlook требуют PTR для IPv6 + AAAA указывающий обратно на хост. Проверьте reverse DNS у хостера и AAAA-запись в Cloudflare.";
            return;
        }
        if (r.contains("dkim") && (r.contains("fail") || r.contains("none"))) {
            q.hintCode = "dkim-fail";
            q.hint = "Получатель не смог верифицировать DKIM подпись. Проверьте /tls-security — DKIM TXT-запись должна точно совпадать с публичным ключом OpenDKIM.";
            return;
        }
        if (r.contains("spf") && (r.contains("softfail") || r.contains("fail"))) {
            q.hintCode = "spf-fail";
            q.hint = "SPF проверка не прошла. Убедитесь что отправляющий IP перечислен в SPF-записи (v=spf1 mx ~all обычно достаточно).";
            return;
        }
        if (r.contains("550") && (r.contains("spam") || r.contains("policy")
                || r.contains("blocked") || r.contains("rejected"))) {
            q.hintCode = "spam";
            q.hint = "Получатель пометил письмо как спам или заблокировал отправителя. Прокачивайте репутацию IP (warm-up), проверьте контент письма, наличие List-Unsubscribe.";
            return;
        }
        if (r.contains("rbl") || r.contains("blacklist") || r.contains("zen.spamhaus")
                || r.contains("barracuda")) {
            q.hintCode = "rbl";
            q.hint = "Ваш IP в RBL/чёрном списке. Откройте /rbl — там видно в каком списке и как из него выйти.";
            return;
        }
        if (r.contains("rate limit") || r.contains("too many") || r.contains("4.7.1")) {
            q.hintCode = "rate-limit";
            q.hint = "Получатель временно ограничил приём. Postfix сам попробует снова. Если повторяется — снижайте темп отправки.";
            return;
        }
        if (r.contains("tls") && (r.contains("handshake") || r.contains("certificate"))) {
            q.hintCode = "tls";
            q.hint = "Не удалось установить TLS-соединение с получателем. Возможно у получателя истёк сертификат или у вас smtp_tls_security_level=dane без корректного TLSA.";
            return;
        }
        if (r.startsWith("4")) {
            q.hintCode = "temp";
            q.hint = "Временный сбой (4.x.x). Postfix попробует снова автоматически. Если стоит больше часа — нажмите Retry или проверьте сеть.";
            return;
        }
        if (r.startsWith("5")) {
            q.hintCode = "perm";
            q.hint = "Постоянный отказ (5.x.x) — Postfix через несколько часов отбойничком вернёт письмо отправителю.";
            return;
        }
        q.hintCode = "other";
        q.hint = null;
    }
}
