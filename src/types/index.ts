// ---------------------------------------------------------------------------
// Ravix domain model (prototype). All data is mocked; these types mirror the
// shapes a future backend API would return, to keep wiring trivial later.
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "warning" | "critical";
export type CheckStatus = "pass" | "warn" | "fail" | "pending" | "unknown";

// --- Cloudflare integration -------------------------------------------------

export interface CloudflareStatus {
  configured: boolean;
  valid?: boolean;
  tokenStatus?: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export type CloudflareAction = "CREATE" | "UPDATE" | "UNCHANGED" | "SKIP";

export interface CloudflarePlanRecord {
  label: string;        // "A" / "MX" / "SPF" / "DKIM" / "DMARC"
  type: string;         // CF type
  name: string;         // FQDN
  expected: string;
  current: string | null;
  existingId: string | null;
  action: CloudflareAction;
  priority: number;
  note: string | null;
}

export interface CloudflarePlan {
  zone: string;
  hostname: string;
  ip: string;
  records: CloudflarePlanRecord[];
}

export interface CloudflareApplyResult {
  label: string;
  name: string;
  action: CloudflareAction;
  ok: boolean;
  detail: string;
}

export interface RelayConfig {
  host: string | null;
  port: number;
  user: string | null;
  hasPassword: boolean;
}

export interface BackgroundTask {
  id: string;
  kind: string;          // "software" | "apply"
  target: string | null;
  action: string | null;
  status: "running" | "ok" | "failed";
  startedAt: string;
  finishedAt: string | null;
  log: string;
}
export type ServiceState = "running" | "degraded" | "stopped" | "unknown";

export interface ServiceStatus {
  id: string;
  name: string;
  description: string;
  state: ServiceState;
  uptime: string;
  version: string;
  memoryMb: number;
}

export interface ResourceMetric {
  label: string;
  used: number;
  total: number;
  unit: string;
}

export type DnsRecordType = "MX" | "SPF" | "DKIM" | "DMARC" | "A" | "TXT" | "PTR";

export interface DnsRecord {
  type: DnsRecordType;
  host: string;
  expected: string;
  detected: string | null;
  status: CheckStatus;
  ttl?: number;
  priority?: number;
}

export interface Domain {
  id: string;
  name: string;
  status: HealthStatus;
  createdAt: string;
  mailboxes: number;
  aliases: number;
  checks: {
    mx: CheckStatus;
    spf: CheckStatus;
    dkim: CheckStatus;
    dmarc: CheckStatus;
    ssl: CheckStatus;
  };
  dkimSelector: string;
  dkimPublicKey: string;
  ssl: {
    issuer: string;
    expiresAt: string | null;
    autoRenew: boolean;
  };
  records: DnsRecord[];
}

export type MailboxStatus = "active" | "disabled" | "suspended";

export interface Mailbox {
  id: string;
  email: string;
  displayName: string;
  domain: string;
  quotaMb: number;
  usedMb: number;
  status: MailboxStatus;
  lastLogin: string | null;
  createdAt: string;
}

export type AliasStatus = "active" | "disabled";

export interface Alias {
  id: string;
  source: string;
  destinations: string[];
  domain: string;
  status: AliasStatus;
  catchAll: boolean;
  createdAt: string;
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "completed";

export interface MailReadinessCheck {
  key: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "INFO";
  detail: string;
}

export interface MailReadiness {
  overall: "ready" | "degraded" | "blocked";
  summary: string;
  checkedAt: string;
  checks: MailReadinessCheck[];
  port25Reachable: boolean;
  relayConfigured: boolean;
  canSendOutbound: boolean;
}

export interface ReputationScore {
  score: number;
  grade: "excellent" | "good" | "fair" | "poor";
  sent30d: number;
  bounced30d: number;
  complaints30d: number;
  bounceRate: number;
  complaintRate: number;
  suppressed: number;
}

export interface WarmupState {
  enabled: boolean;
  startDate: string | null;
  targetDaily: number;
  day: number;
  dailyCap: number;
  complete: boolean;
}

export interface ReputationOverview {
  reputation: ReputationScore;
  warmup: WarmupState;
  sentToday: number;
  dailyCap: number | null;
}

export interface FblComplaint {
  id: number;
  email: string;
  source: string | null;
  receivedAt: string;
}

export interface RblZoneResult {
  zone: string;
  listed: boolean;
  result: string | null;
}

export interface RblIpResult {
  ip: string;
  listedCount: number;
  zones: RblZoneResult[];
  checkedAt: string;
}

export interface TlsSecurityItem {
  key: string;
  label: string;
  host: string;
  expected: string;
  detected: string | null;
  // "warn" added because a published TLSA without active DNSSEC is no longer
  // "pass" but isn't strictly "missing" either — receivers ignore the record
  // but it's not broken; we surface it as a warning in the UI.
  status: "pass" | "missing" | "optional" | "info" | "warn";
  detail: string;
}

export interface DnssecStatus {
  /** "active" | "pending" | "disabled" | "unknown" — straight from CF. */
  status: string;
  /** The DS record to paste at the registrar. Blank until CF reports it. */
  dsRecord: string;
  /** Human-readable explanation of the current state. */
  hint: string;
}

export interface TlsPosture {
  domain: string;
  mailHost: string;
  items: TlsSecurityItem[];
  policyBody: string;
  status: "healthy" | "warning" | "critical";
  dnssec: DnssecStatus;
}

export interface DmarcReport {
  id: string;
  domain: string;
  orgName: string | null;
  reportId: string | null;
  dateBegin: string | null;
  dateEnd: string | null;
  receivedAt: string;
  totalCount: number;
  passCount: number;
  failCount: number;
}

export interface DmarcSummary {
  domain: string;
  total: number;
  pass: number;
  fail: number;
  reports: number;
  passRate: number;
}

export interface DmarcSource {
  sourceIp: string;
  count: number;
  pass: number;
  fail: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  status: number;
  detail: string | null;
}

export type AudienceType = "all" | "domain" | "segment" | "list";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  sender: string;
  subject: string;
  body: string;
  preheader: string | null;
  replyTo: string | null;
  audienceType: AudienceType;
  audienceRef: string | null;
  templateId: string | null;
  recipients: number;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
  opens: number;
  clicks: number;
  unsubscribe: boolean;
  ratePerHour: number;
  scheduledAt: string | null;
  sentAt: string | null;
  updatedAt: string;
}

export type RecipientStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "unsubscribed";

export interface CampaignRecipient {
  id: number;
  campaignId: string;
  email: string;
  name: string | null;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
}

export type SegmentType = "all" | "domain" | "status" | "manual";

export interface Segment {
  id: string;
  name: string;
  type: SegmentType;
  filterValue: string | null;
  count: number;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export type EventSeverity = "info" | "success" | "warning" | "critical";
export type EventCategory =
  | "domain"
  | "mailbox"
  | "ssl"
  | "spam"
  | "system"
  | "queue"
  | "campaign";

export interface RavixEvent {
  id: string;
  category: EventCategory;
  severity: EventSeverity;
  message: string;
  at: string;
}

export type QueueState = "active" | "deferred" | "hold" | "failed";

export interface QueueItem {
  id: string;
  sender: string;
  recipient: string;
  domain: string;
  subject: string;
  sizeKb: number;
  attempts: number;
  state: QueueState;
  reason: string | null;
  /** Plain-language explanation of `reason` (backend-derived). Null when
   *  state is active or the reason doesn't match any known pattern. */
  hint: string | null;
  /** Short stable tag for grouping ("timeout-25", "spam", "rbl", …) so the
   *  UI can fold N identical-reason items into one summary row. */
  hintCode: string | null;
  queuedAt: string;
}

export type LogSource = "postfix" | "dovecot" | "rspamd" | "nginx" | "ravix";
export type LogLevel = "info" | "warning" | "error" | "debug";

export interface LogLine {
  id: string;
  source: LogSource;
  level: LogLevel;
  timestamp: string;
  process: string;
  message: string;
}

export interface Certificate {
  id: string;
  domain: string;
  issuer: string;
  type: "lets-encrypt" | "custom";
  status: HealthStatus;
  issuedAt: string;
  expiresAt: string;
  autoRenew: boolean;
  lastRenewal: {
    at: string;
    status: "success" | "failed";
    detail: string;
  };
}

export interface Backup {
  id: string;
  createdAt: string;
  sizeMb: number;
  type: "manual" | "scheduled";
  status: "complete" | "running" | "failed";
  contents: string[];
}

export interface DeliverabilityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

// ---------------------------------------------------------------------------
// Webmail
// ---------------------------------------------------------------------------

/** Standard folder keys; custom Maildir folders use their own name as key. */
export type MailFolder =
  | "inbox"
  | "sent"
  | "drafts"
  | "spam"
  | "trash"
  | "archive"
  | string;

export interface MailFolderInfo {
  key: string;
  name: string;
  total: number;
  unread: number;
}

/** Row in the message list (header-level data + thread grouping). */
export interface MailSummary {
  id: string;
  folder: string;
  fromAddr: string;
  fromName: string | null;
  toAddr: string;
  subject: string;
  preview: string;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  receivedAt: string;
  threadId: string | null;
  threadCount: number;
}

export interface MailAttachment {
  index: number;
  filename: string | null;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
  contentId: string | null;
}

/** A fully-decoded message (HTML/plain body + attachments). */
export interface MailFull {
  summary: MailSummary;
  ccAddr: string;
  replyTo: string;
  html: string | null;
  text: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: MailAttachment[];
}

export interface MailPage {
  messages: MailSummary[];
  total: number;
  offset: number;
  limit: number;
}

export interface MailContact {
  id: string;
  email: string;
  name: string | null;
  seenCount: number;
}

export interface MailSignature {
  id: string;
  html: string;
  enabled: boolean;
}

export interface MailFilterRule {
  id: string;
  ord: number;
  name: string | null;
  field: "from" | "to" | "subject";
  op: "contains" | "is";
  value: string;
  action: "fileinto" | "discard" | "mark_read" | "star";
  target: string | null;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Doctor — one-button diagnosis
// ---------------------------------------------------------------------------

export type DoctorSeverity = "PASS" | "WARN" | "FAIL" | "INFO";

export interface DoctorCheck {
  key: string;
  category: string; // network | dns | dkim | tls | service | drift
  label: string;
  severity: DoctorSeverity;
  detail: string;
  fix: string | null;       // fix id, or null
  fixLabel: string | null;
}

export interface DoctorReport {
  overall: "healthy" | "degraded" | "broken";
  passed: number;
  warnings: number;
  failures: number;
  checkedAt: string;
  checks: DoctorCheck[];
}

export interface ProviderPlaybook {
  ip: string;
  ipv6: string;
  asn: string;
  org: string;
  providerKey: string;
  port25v4: boolean;
  port25v6: boolean;
  policyNote: string;
  ticketSubject: string;
  ticketBody: string;
}

export interface ApiKey {
  id: string;
  name: string;
  last4: string;
  scopes: string;
  createdAt: string;
  lastUsed: string | null;
  sentCount: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Inbox-placement test
// ---------------------------------------------------------------------------

export interface InboxFinding {
  key: string;
  label: string;
  status: string;     // category: auth | dns | reputation | tls
  points: number;
  max: number;
  detail: string;
}

export interface InboxSeedResult {
  label: string;
  email: string;
  placement: string;  // inbox | spam | missing | send-failed | error
  detail: string;
}

export interface InboxTestResult {
  id: string;
  domain: string | null;
  fromAddr: string;
  score: number;       // 0..10
  grade: "excellent" | "good" | "fair" | "poor";
  summary: string;
  findings: InboxFinding[];
  seeds: InboxSeedResult[];
  probeTag: string;
  seedsPending: boolean;
  createdAt: string;
}

export interface InboxSeed {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  enabled: boolean;
}

export interface RadicaleStatus {
  installed: boolean;
  running: boolean;
  users: number;
  baseUrl: string;
}
