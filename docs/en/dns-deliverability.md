# DNS & deliverability

[← Docs index](README.md) · [Русский](../ru/dns-deliverability.md) · [中文](../zh/dns-deliverability.md)

---

Getting mail *delivered* is harder than getting it *sent*. This page covers the
records Ravix checks, in the order they matter.

## The checks Ravix runs

**Domains → your domain → Recheck** performs live DNS lookups and shows pass /
warn / fail per record. `DomainChecker` runs these; `sudo ravixctl recheck`
runs them for every domain from the command line.

| Check | What it verifies |
| --- | --- |
| **MX** | The domain's MX points at your mail host. |
| **SPF** | A `v=spf1` record exists and authorizes your sending IP. |
| **DKIM** | The selector's public key is published and matches the private key Ravix holds. |
| **DMARC** | A `_dmarc` record exists and is syntactically valid. |
| **PTR** | The sending IP has reverse DNS, and it resolves forward again. |

## The records you need

### 1. MX — receiving mail

```dns
example.com.        3600  IN  MX   10 mail.example.com.
mail.example.com.   3600  IN  A    203.0.113.10
```

The MX target must be a hostname with an A record, never an IP and never a CNAME.

### 2. PTR — the one you cannot set yourself

```dns
10.113.0.203.in-addr.arpa.  IN  PTR  mail.example.com.
```

Reverse DNS is set by whoever owns the IP — your hosting provider, in their
control panel or by support ticket. It must match the hostname your mail server
announces in `HELO`, and that hostname must resolve forward to the same IP.

**Mail from an IP with no PTR is rejected outright by most large providers.**
This is the single most common reason a fresh mail server cannot deliver
anywhere. Fix it first.

### 3. SPF — who may send as you

```dns
example.com.  3600  IN  TXT  "v=spf1 mx ~all"
```

`mx` authorizes whatever your MX records point at. Add other senders explicitly:

```dns
"v=spf1 mx include:_spf.google.com ip4:203.0.113.10 ~all"
```

Rules that bite people:

- **One SPF record per domain.** Two `v=spf1` TXT records is a permanent error,
  not a merge.
- **The 10-lookup limit.** Each `include:`, `a`, `mx` and `redirect` costs a DNS
  lookup; exceeding ten makes SPF fail everywhere.
- `~all` (softfail) is the sane default. Move to `-all` only once you are
  certain every legitimate sender is listed.

### 4. DKIM — signing

Generate a key in **Domains → DKIM**. Ravix creates the private key under
`/etc/opendkim`, configures OpenDKIM to sign with it, and shows you the DNS
record to publish:

```dns
ravix._domainkey.example.com.  3600  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBg..."
```

Publish it **before** applying the configuration, and give DNS time to
propagate. A signature verified against a missing key is worse than no signature.

Rotate keys by generating a new selector, publishing it, waiting out the TTL,
then switching signing over.

### 5. DMARC — policy and reporting

Start in monitor mode:

```dns
_dmarc.example.com.  3600  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.com; pct=100"
```

Then tighten only once the reports are clean:

| Policy | Meaning | When |
| --- | --- | --- |
| `p=none` | Monitor, do not act | Weeks 1–4 — collect data. |
| `p=quarantine` | Spam-folder failures | Once SPF and DKIM pass consistently. |
| `p=reject` | Reject failures | Steady state, after `quarantine` shows no legitimate failures. |

Moving to `p=reject` before you have read the reports will silently kill mail
from senders you forgot about — mailing lists, invoicing systems, your CRM.

## DMARC report ingestion

Point `rua=` at a mailbox you control, then feed the aggregate reports to Ravix
in either of two ways:

1. **Upload** — **DMARC → Upload report**, accepting `.xml`, `.gz` and `.zip`.
2. **Drop** — copy files into `/var/lib/ravix/dmarc/inbox`; `DmarcScanner`
   ingests them automatically.

The DMARC page then breaks down volume by source, showing who sends as your
domains and whether they authenticate. Unfamiliar sources that pass are usually
a forwarder; unfamiliar sources that fail are either spoofing or a system you
forgot you owned.

## Transport security

**TLS security** covers the layer above authentication.

| Mechanism | Record | Effect |
| --- | --- | --- |
| **MTA-STS** | `_mta-sts` TXT + a policy served over HTTPS | Tells senders to require TLS and refuse to downgrade. |
| **TLS-RPT** | `_smtp._tls` TXT | Senders report TLS failures to you. |
| **DANE / TLSA** | `_25._tcp` TLSA | Pins your certificate — requires DNSSEC on the zone. |

DANE only works with DNSSEC enabled at the registrar; the panel shows the DS
record state and turns the card green once the root zone reflects it.

## RBL / blocklist monitoring

**RBL** checks your sending IPs against DNSBLs (Spamhaus, SpamCop, SORBS and
others) and records the history, so you find out from the panel rather than from
a customer.

If you are listed: fix the cause first — usually a compromised mailbox, an open
relay, or a bad list — then use the blocklist's own delisting form. Delisting
without fixing the cause gets you relisted, often with a longer penalty.

## Reputation and warm-up

**Reputation** scores your sending over a rolling 30 days from bounces,
complaints and volume.

A new IP has no reputation, and sending a large volume from one immediately
looks exactly like a spam run. Ravix supports a daily cap that ramps over time —
**Reputation → Warm-up**. A conservative ramp:

| Day | Messages / day |
| --- | ---: |
| 1–3 | 50 |
| 4–7 | 200 |
| 8–14 | 1 000 |
| 15–21 | 5 000 |
| 22–30 | 20 000 |

Ramp against *engaged* recipients first. Volume to addresses that never open
teaches the receiving side exactly the wrong thing.

## FBL / complaint handling

Feedback loops let providers tell you when a recipient hits "spam". Ravix
ingests ARF complaints dropped into `/var/lib/ravix/fbl/inbox` and adds the
address to the suppression list, so campaigns skip it.

Register for the feedback loops of the providers you actually send to — most
large mailbox providers run one — and point them at that inbox.

## Inbox placement testing

**Deliverability → Inbox test** sends seed messages to a set of test addresses
and reports where each one landed. Use it after a DNS change or a warm-up step
to check you are reaching the inbox rather than the spam folder.

## A working checklist

- [ ] PTR set, matching the mail hostname, resolving forward to the same IP.
- [ ] MX pointing at a hostname with an A record.
- [ ] One SPF record, under ten lookups, `~all`.
- [ ] DKIM published and verifying.
- [ ] DMARC at `p=none` with `rua=`, reports being ingested.
- [ ] TLS certificate matching the MX hostname.
- [ ] Not listed on any major RBL.
- [ ] Warm-up configured if the IP is new.
- [ ] Outbound port 25 confirmed open.
