// ---------------------------------------------------------------------------
// Ravix API client. Talks to the Quarkus backend under /api (proxied to
// http://localhost:8080 in dev — see vite.config.ts). All response shapes
// mirror the types in src/types plus a few aggregate shapes defined here.
// ---------------------------------------------------------------------------

import type {
  DoctorReport,
  ProviderPlaybook,
  ApiKey,
  InboxTestResult,
  InboxSeed,
  RadicaleStatus,
  Alias,
  AuditEntry,
  BackgroundTask,
  Backup,
  Campaign,
  CampaignRecipient,
  Certificate,
  DeliverabilityCheck,
  DmarcReport,
  DmarcSource,
  DmarcSummary,
  FblComplaint,
  CloudflareApplyResult,
  CloudflarePlan,
  CloudflareStatus,
  CloudflareZone,
  MailReadiness,
  MailFolderInfo,
  MailSummary,
  MailFull,
  MailPage,
  MailContact,
  MailSignature,
  MailFilterRule,
  RblIpResult,
  RelayConfig,
  ReputationOverview,
  TlsPosture,
  WarmupState,
  Domain,
  EmailTemplate,
  HealthStatus,
  LogLine,
  Mailbox,
  QueueItem,
  RavixEvent,
  Segment,
  ServiceStatus,
} from "@/types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";
const ORG_KEY = "ravix.org";
const SESSION_FLAG = "ravix.session";

// The session itself lives in an HttpOnly cookie set by /auth/login, so no
// script — ours or an injected one — can read it. What remains here is a bare
// "we think we are signed in" flag used only to pick the initial route; it
// carries no secret, and the server is still the authority (a stale flag just
// means the first request comes back 401 and bounces us to /login).
export const auth = {
  markSignedIn: () => localStorage.setItem(SESSION_FLAG, "1"),
  clearSession: () => localStorage.removeItem(SESSION_FLAG),
  isAuthenticated: () => !!localStorage.getItem(SESSION_FLAG),
  // Active organization (multi-tenant). Sent as X-Ravix-Org on every request.
  getOrg: () => localStorage.getItem(ORG_KEY),
  setOrg: (id: string) => localStorage.setItem(ORG_KEY, id),
  clearOrg: () => localStorage.removeItem(ORG_KEY),
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const org = auth.getOrg();
  if (org) headers["X-Ravix-Org"] = org;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  // Session expired / missing — bounce to login (except on auth endpoints).
  if (res.status === 401 && !path.startsWith("/auth/")) {
    auth.clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new Error("unauthorized");
  }
  // Role/tenant forbidden — surface a friendly reason globally (read-only role,
  // owner-only action, …) so the UI can show a notice instead of a raw error.
  if (res.status === 403) {
    let reason = "forbidden";
    try {
      reason = (JSON.parse(await res.text())?.reason as string) || "forbidden";
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ravix:forbidden", { detail: reason }));
    }
    throw new Error(`forbidden:${reason}`);
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const get = <T>(path: string) => http<T>(path);
const post = <T>(path: string, body?: unknown) =>
  http<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body?: unknown) =>
  http<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
const del = <T = void>(path: string) => http<T>(path, { method: "DELETE" });

// Multipart upload (compose with attachments). Browser sets the boundary.
const postForm = async <T>(path: string, form: FormData): Promise<T> => {
  const headers: Record<string, string> = {};
  const org = auth.getOrg();
  if (org) headers["X-Ravix-Org"] = org;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
    credentials: "include",
  });
  if (res.status === 401) {
    auth.clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
};

// Fetch a binary resource (attachment bytes) as a Blob, auth-gated.
const getBlob = async (path: string): Promise<Blob> => {
  const headers: Record<string, string> = {};
  const org = auth.getOrg();
  if (org) headers["X-Ravix-Org"] = org;
  const res = await fetch(`${BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.blob();
};

// --- Aggregate response shapes ---------------------------------------------

export interface DashboardData {
  health: { score: number; status: HealthStatus; summary: string };
  metrics: {
    domains: number;
    domainsNeedAttention: number;
    mailboxes: number;
    mailboxesActive: number;
    mailboxesSuspended: number;
    sslActive: number;
    sslTotal: number;
    queueTotal: number;
    queueDeferred: number;
    queueFailed: number;
  };
  host: { vcpus: number; load: number; dataPath: string };
  resources: { label: string; used: number; total: number; unit: string }[];
  cpuHistory: { t: number; value: number }[];
  queueHistory: { t: number; value: number }[];
  queueSummary: QueueSummary;
}

export interface OrgRef {
  id: string;
  name: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  twoFactor: boolean;
  superadmin?: boolean;
  orgs?: OrgRef[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  quotaDomains: number;
  quotaMailboxes: number;
  quotaStorageMb: number;
  domains: number;
  mailboxes: number;
  myRole: string | null;
}

export interface OrgMember {
  membershipId: string;
  userId: string;
  email: string;
  role: string;
}

export interface MonitoringAlert {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  twoFactor: boolean;
}

export interface QueueSummary {
  active: number;
  deferred: number;
  hold: number;
  failed: number;
  total: number;
  oldestDeferred: string | null;
}

export interface AntiSpamData {
  status: HealthStatus | "degraded" | "inactive";
  rspamdRunning: boolean;
  redisConnected: boolean;
  spamThreshold: number;
  rejectThreshold: number;
  greylisting: boolean;
  dkimSigning: boolean;
  bayesLearned: number;
  dkimSignedDomains: number;
  totalDomains: number;
  whitelist: string[];
  blacklist: string[];
  recentDecisions: {
    id: string;
    time: string;
    from: string;
    action: string;
    score: number;
    symbols: string[];
  }[];
}

export interface SystemData {
  hostname: string;
  version: string;
  installMode: string;
  os: string;
  kernel: string;
  arch: string;
  uptime: string;
  systemUser: string;
  paths: { app: string; config: string; data: string; logs: string; sqlite: string };
  packages: { name: string; version: string; status: string }[];
  commandChecks: { cmd: string; result: string; ok: boolean }[];
  installLog: { at: string; msg: string; ok: boolean }[];
}

export type Settings = Record<string, string>;

export type ServiceState = "running" | "stopped" | "degraded" | "unknown";

export interface SoftwareComponent {
  id: string;
  name: string;
  description: string;
  pkg: string;
  installed: boolean;
  version: string;
  hasService: boolean;
  serviceState: ServiceState;
  configs: { path: string; label: string; exists: boolean }[];
}

export type SoftwareAction =
  | "install"
  | "reinstall"
  | "uninstall"
  | "start"
  | "stop"
  | "restart";

export interface SoftwareActionResult {
  /** For install/reinstall/uninstall: only taskId+status are returned (202). */
  taskId?: string;
  status?: string;
  action?: string;
  componentId?: string;
  /** For start/stop/restart: sync envelope. */
  ok?: boolean;
  output?: string;
  component?: SoftwareComponent;
}

export interface ConfigFileContent {
  path: string;
  exists: boolean;
  content: string;
}

// --- Endpoints -------------------------------------------------------------

export const api = {
  // --- Auth ---
  login: async (username: string, password: string, code?: string) => {
    const res = await post<{ token: string; user: AuthUser }>("/auth/login", {
      username,
      password,
      code,
    });
    // The session cookie is already set by the response; this only records that
    // the route guard may let us through.
    auth.markSignedIn();
    return res;
  },
  twoFactorSetup: () =>
    post<{ secret: string; otpauthUri: string }>("/auth/2fa/setup"),
  twoFactorEnable: (code: string) =>
    post<{ ok: boolean }>("/auth/2fa/enable", { code }),
  twoFactorDisable: (password: string) =>
    post<{ ok: boolean }>("/auth/2fa/disable", { password }),
  me: () => get<AuthUser>("/auth/me"),
  logout: async () => {
    try {
      await post<void>("/auth/logout");
    } finally {
      auth.clearSession();
    }
  },
  authStatus: () =>
    get<{
      online: boolean;
      hostname: string;
      version: string;
      /** True once the operator has done at least one intentional thing
       *  (added a domain or changed the mail hostname). Login page uses
       *  this to hide the "First-time setup" link on an in-use panel
       *  so a passer-by can't re-walk the wizard and overwrite creds. */
      configured: boolean;
    }>("/auth/status"),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>("/auth/password", { currentPassword, newPassword }),

  // --- Admin users ---
  adminUsers: () => get<AdminUser[]>("/admin-users"),
  createAdminUser: (body: { email: string; password: string; role?: string }) =>
    post<AdminUser>("/admin-users", body),
  toggleAdminTwoFactor: (id: string) => post<AdminUser>(`/admin-users/${id}/2fa`),
  changeAdminRole: (id: string, role: string) =>
    post<AdminUser>(`/admin-users/${id}/role`, { role }),
  deleteAdminUser: (id: string) => del(`/admin-users/${id}`),

  // --- Organizations (multi-tenant) ---------------------------------------
  organizations: () => get<Organization[]>("/organizations"),
  createOrganization: (body: {
    name: string;
    slug?: string;
    quotaDomains?: number;
    quotaMailboxes?: number;
    quotaStorageMb?: number;
  }) => post<Organization>("/organizations", body),
  deleteOrganization: (id: string) => del(`/organizations/${id}`),
  orgMembers: (id: string) => get<OrgMember[]>(`/organizations/${id}/members`),
  addOrgMember: (id: string, email: string, role: string) =>
    post<OrgMember>(`/organizations/${id}/members`, { email, role }),
  removeOrgMember: (id: string, membershipId: string) =>
    del(`/organizations/${id}/members/${membershipId}`),

  dashboard: () => get<DashboardData>("/dashboard"),

  domains: () => get<Domain[]>("/domains"),
  domain: (id: string) => get<Domain>(`/domains/${id}`),
  createDomain: (body: { name: string; dkimSelector?: string }) =>
    post<Domain>("/domains", body),
  recheckDomain: (id: string) => post<Domain>(`/domains/${id}/recheck`),
  // Push the panel's DNS plan to Cloudflare for this domain on demand.
  // Backend uses the saved CF token; returns the updated domain.
  cloudflareSyncDomain: (id: string) =>
    post<{ ok: boolean; syncedDomains: number; domain: Domain }>(
      `/domains/${id}/cloudflare-sync`
    ),
  cloudflareSyncAll: () =>
    post<{ ok: boolean; syncedDomains: number }>("/cloudflare/sync-all"),
  deleteDomain: (id: string) => del(`/domains/${id}`),

  mailboxes: (params?: { domain?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.domain && params.domain !== "all") q.set("domain", params.domain);
    if (params?.status && params.status !== "all") q.set("status", params.status);
    const qs = q.toString();
    return get<Mailbox[]>(`/mailboxes${qs ? `?${qs}` : ""}`);
  },
  createMailbox: (body: {
    email: string;
    displayName: string;
    domain: string;
    quotaMb: number;
    password?: string;
  }) => post<Mailbox>("/mailboxes", body),
  setMailboxQuota: (id: string, quotaMb: number) =>
    put<Mailbox>(`/mailboxes/${id}/quota`, { quotaMb }),
  toggleMailbox: (id: string) => post<Mailbox>(`/mailboxes/${id}/toggle`),
  resetMailboxPassword: (id: string, password: string) =>
    post<void>(`/mailboxes/${id}/reset-password`, { password }),
  deleteMailbox: (id: string) => del(`/mailboxes/${id}`),
  importMail: (
    id: string,
    body: {
      host: string;
      port?: number;
      user: string;
      password: string;
      ssl: boolean;
      localPassword: string;
    }
  ) => post<{ taskId: string; status: string }>(`/mailboxes/${id}/import`, body),
  mailbox: (id: string) => get<Mailbox>(`/mailboxes/${id}`),

  // --- Webmail (real Maildir) ---
  mailFolders: (mailboxId: string) =>
    get<MailFolderInfo[]>(`/mailboxes/${mailboxId}/folders`),
  mailMessages: (
    mailboxId: string,
    folder: string,
    opts?: { q?: string; offset?: number; limit?: number }
  ) => {
    const params = new URLSearchParams({ folder });
    if (opts?.q) params.set("q", opts.q);
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    return get<MailPage>(`/mailboxes/${mailboxId}/messages?${params.toString()}`);
  },
  mailMessage: (id: string) => get<MailFull>(`/messages/${id}`),
  mailThread: (id: string) => get<MailFull[]>(`/messages/${id}/thread`),
  mailSetRead: (id: string, unread: boolean) =>
    post<MailSummary>(`/messages/${id}/read`, { unread }),
  mailStar: (id: string, starred?: boolean) =>
    post<MailSummary>(`/messages/${id}/star`, starred == null ? {} : { starred }),
  mailMove: (id: string, folder: string) =>
    post<MailSummary>(`/messages/${id}/move`, { folder }),
  mailDelete: (id: string) => del(`/messages/${id}`),
  mailCompose: (mailboxId: string, form: FormData) =>
    postForm<{ ok?: boolean; id?: string }>(`/mailboxes/${mailboxId}/messages`, form),
  mailEmptyTrash: (mailboxId: string) =>
    del<{ deleted: number }>(`/mailboxes/${mailboxId}/trash`),
  mailAttachment: (id: string, index: number) =>
    getBlob(`/messages/${id}/attachments/${index}`),
  mailContacts: (mailboxId: string, q: string) =>
    get<MailContact[]>(`/mailboxes/${mailboxId}/contacts?q=${encodeURIComponent(q)}`),
  mailSignature: (mailboxId: string) =>
    get<MailSignature>(`/mailboxes/${mailboxId}/signature`),
  mailSaveSignature: (mailboxId: string, html: string, enabled: boolean) =>
    put<MailSignature>(`/mailboxes/${mailboxId}/signature`, { html, enabled }),
  mailFilters: (mailboxId: string) =>
    get<MailFilterRule[]>(`/mailboxes/${mailboxId}/filters`),
  mailCreateFilter: (mailboxId: string, body: Partial<MailFilterRule>) =>
    post<MailFilterRule>(`/mailboxes/${mailboxId}/filters`, body),
  mailUpdateFilter: (mailboxId: string, id: string, body: Partial<MailFilterRule>) =>
    put<MailFilterRule>(`/mailboxes/${mailboxId}/filters/${id}`, body),
  mailDeleteFilter: (mailboxId: string, id: string) =>
    del(`/mailboxes/${mailboxId}/filters/${id}`),

  aliases: () => get<Alias[]>("/aliases"),
  createAlias: (body: {
    source: string;
    domain: string;
    destinations: string[];
    catchAll: boolean;
  }) => post<Alias>("/aliases", body),
  toggleAlias: (id: string) => post<Alias>(`/aliases/${id}/toggle`),
  deleteAlias: (id: string) => del(`/aliases/${id}`),

  campaigns: () => get<Campaign[]>("/campaigns"),
  campaign: (id: string) => get<Campaign>(`/campaigns/${id}`),
  createCampaign: (body: Record<string, unknown>) =>
    post<Campaign>("/campaigns", body),
  pauseCampaign: (id: string) => post<Campaign>(`/campaigns/${id}/pause`),
  resumeCampaign: (id: string) => post<Campaign>(`/campaigns/${id}/resume`),
  sendCampaign: (id: string) => post<Campaign>(`/campaigns/${id}/send`),
  deleteCampaign: (id: string) => del(`/campaigns/${id}`),
  campaignRecipients: (id: string) =>
    get<CampaignRecipient[]>(`/campaigns/${id}/recipients`),
  campaignLinks: (id: string) =>
    get<{ url: string; clicks: number }[]>(`/campaigns/${id}/links`),
  previewAudience: (audienceType: string, audienceRef?: string | null) =>
    post<{ count: number; sample: string[] }>("/campaigns/preview-audience", {
      audienceType,
      audienceRef,
    }),
  importRecipients: (id: string, emails: string[]) =>
    post<Campaign>(`/campaigns/${id}/recipients/import`, { emails }),

  // --- Segments & templates ---
  segments: () => get<Segment[]>("/segments"),
  createSegment: (body: { name: string; type: string; filterValue?: string | null }) =>
    post<Segment>("/segments", body),
  deleteSegment: (id: string) => del(`/segments/${id}`),
  templates: () => get<EmailTemplate[]>("/templates"),
  createTemplate: (body: { name: string; subject: string; body: string }) =>
    post<EmailTemplate>("/templates", body),
  updateTemplate: (id: string, body: { name?: string; subject?: string; body?: string }) =>
    put<EmailTemplate>(`/templates/${id}`, body),
  deleteTemplate: (id: string) => del(`/templates/${id}`),

  queue: (state?: string) =>
    get<QueueItem[]>(`/queue${state && state !== "all" ? `?state=${state}` : ""}`),
  queueRetry: (ids: string[]) => post<void>("/queue/retry", { ids }),
  queueHold: (ids: string[]) => post<void>("/queue/hold", { ids }),
  queueDelete: (ids: string[]) => post<void>("/queue/delete", { ids }),
  queueFlush: () => post<void>("/queue/flush"),

  logs: (source?: string) =>
    get<LogLine[]>(`/logs${source && source !== "all" ? `?source=${source}` : ""}`),

  certificates: () => get<Certificate[]>("/certificates"),
  renewCertificate: (id: string) => post<Certificate>(`/certificates/${id}/renew`),
  renewAllCertificates: () => post<Certificate[]>("/certificates/renew-all"),
  setCertAutoRenew: (id: string, enabled: boolean) =>
    put<Certificate>(`/certificates/${id}/auto-renew`, { enabled }),
  issueCertificate: (domain: string, email?: string) =>
    post<{ taskId: string; status: string }>("/certificates/issue", { domain, email }),
  uploadCertificate: (body: {
    domain: string;
    certificate: string;
    privateKey: string;
  }) => post<Certificate>("/certificates/upload", body),

  monitoringAlerts: () => get<MonitoringAlert[]>("/monitoring/alerts"),

  backups: () => get<Backup[]>("/backups"),
  createBackup: () => post<Backup>("/backups"),
  restoreBackup: (id: string) =>
    post<{ ok: boolean; id: string }>(`/backups/${id}/restore`),
  deleteBackup: (id: string) => del(`/backups/${id}`),
  /** Stream the backup tarball to a browser download. Done as a fetch+blob
   *  rather than an anchor href so the request carries the session cookie
   *  under our own fetch settings, and so no credential ever has to be put in
   *  a URL query where history / referer / access logs would capture it. */
  downloadBackup: async (id: string, filename = `ravix-${id}.tar.gz`) => {
    const res = await fetch(`/api/backups/${id}/download`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  antiSpam: () => get<AntiSpamData>("/anti-spam"),
  updateAntiSpam: (body: Partial<AntiSpamData>) => put<AntiSpamData>("/anti-spam", body),
  restartRspamd: () => post<{ ok: boolean }>("/anti-spam/restart"),
  addSenderListEntry: (listType: "whitelist" | "blacklist", value: string) =>
    post<AntiSpamData>("/anti-spam/list", { listType, value }),
  removeSenderListEntry: (listType: "whitelist" | "blacklist", value: string) =>
    del(
      `/anti-spam/list?listType=${encodeURIComponent(listType)}&value=${encodeURIComponent(value)}`
    ),

  services: () => get<ServiceStatus[]>("/services"),
  deliverability: () => get<DeliverabilityCheck[]>("/deliverability"),
  events: (limit?: number) => get<RavixEvent[]>(`/events${limit ? `?limit=${limit}` : ""}`),

  settings: () => get<Settings>("/settings"),
  updateSettings: (body: Settings) => put<Settings>("/settings", body),

  system: () => get<SystemData>("/system"),

  audit: (actor?: string) =>
    get<AuditEntry[]>(`/audit${actor ? `?actor=${encodeURIComponent(actor)}` : ""}`),

  // --- RBL / blacklist monitoring ---
  rbl: () => get<RblIpResult[]>("/rbl"),
  rblScan: () => post<RblIpResult[]>("/rbl/scan"),

  // --- Mail readiness ("can we send?") ---
  mailReadiness: () => get<MailReadiness>("/mail-readiness"),
  testMailReadiness: () => post<MailReadiness>("/mail-readiness/run"),

  // --- Cloudflare integration ---
  cloudflareStatus: () => get<CloudflareStatus>("/cloudflare/status"),
  cloudflareSaveToken: (token: string) =>
    put<{ valid: boolean; status: string; warning?: string }>(
      "/cloudflare/token",
      { token }
    ),
  cloudflareClearToken: () => del("/cloudflare/token"),
  cloudflareZones: () => get<CloudflareZone[]>("/cloudflare/zones"),
  cloudflarePublicIp: () =>
    get<{ ip: string; ipv6: string }>("/cloudflare/public-ip"),
  cloudflarePlan: (zoneId: string, hostname: string, ip: string, ipv6?: string) =>
    post<CloudflarePlan>("/cloudflare/plan", { zoneId, hostname, ip, ipv6 }),
  cloudflareApply: (zoneId: string, hostname: string, ip: string, ipv6?: string) =>
    post<{ ok: boolean; results: CloudflareApplyResult[] }>(
      "/cloudflare/apply",
      { zoneId, hostname, ip, ipv6 }
    ),

  // --- Outbound SMTP relay ---
  relay: () => get<RelayConfig>("/relay"),
  saveRelay: (body: { host: string; port: number; user: string; password: string }) =>
    put<RelayConfig>("/relay", body),
  clearRelay: () => del("/relay"),
  testRelay: (to: string, from?: string) =>
    post<{ ok: boolean }>("/relay/test", { to, from }),

  // --- Reputation / warm-up / FBL ---
  reputation: () => get<ReputationOverview>("/reputation"),
  updateWarmup: (body: { enabled?: boolean; startDate?: string; targetDaily?: number }) =>
    post<WarmupState>("/reputation/warmup", body),
  complaints: () => get<FblComplaint[]>("/reputation/complaints"),
  addComplaint: (email: string) =>
    post<FblComplaint>("/reputation/complaints", { email }),

  // --- TLS security (MTA-STS / TLS-RPT / DANE) ---
  tlsSecurity: () => get<TlsPosture[]>("/tls-security"),

  // --- DMARC ---
  dmarcSummary: () => get<DmarcSummary[]>("/dmarc/summary"),
  dmarcSources: () => get<DmarcSource[]>("/dmarc/sources"),
  dmarcReports: (domain?: string) =>
    get<DmarcReport[]>(`/dmarc/reports${domain ? `?domain=${encodeURIComponent(domain)}` : ""}`),
  dmarcIngest: (filename: string, contentBase64: string) =>
    post<DmarcReport>("/dmarc/ingest", { filename, contentBase64 }),

  // --- Software provisioning ---
  // apply / install / reinstall / uninstall run in the background and return
  // a task handle so the UI doesn't block. start / stop / restart are fast
  // and return the sync envelope.
  applyConfig: () =>
    post<{ taskId: string; status: string; action: string }>("/platform/apply"),
  softwareComponents: () => get<SoftwareComponent[]>("/platform/components"),
  softwareAction: (id: string, action: SoftwareAction) =>
    post<SoftwareActionResult>(`/platform/components/${id}/${action}`),

  // Poll a single background task for progress + log.
  task: (id: string) => get<BackgroundTask>(`/tasks/${id}`),
  taskList: (kind?: string, active?: boolean) => {
    const qp: string[] = [];
    if (kind) qp.push(`kind=${encodeURIComponent(kind)}`);
    if (active) qp.push("active=true");
    return get<BackgroundTask[]>(`/tasks${qp.length ? `?${qp.join("&")}` : ""}`);
  },
  readConfig: (path: string) =>
    get<ConfigFileContent>(`/platform/config?path=${encodeURIComponent(path)}`),
  saveConfig: (path: string, content: string) =>
    put<{ ok: boolean }>("/platform/config", { path, content }),

  // --- Doctor (one-button diagnosis) ---
  doctorRun: () => post<DoctorReport>("/doctor/run"),
  doctorFix: (id: string) =>
    post<{ ok: boolean; detail: string }>(`/doctor/fix/${id}`),
  providerPlaybook: () => get<ProviderPlaybook>("/provider/playbook"),

  // --- Transactional API keys ---
  apiKeys: () => get<ApiKey[]>("/api-keys"),
  createApiKey: (name: string) =>
    post<{ key: ApiKey; secret: string }>("/api-keys", { name }),
  toggleApiKey: (id: string) => post<ApiKey>(`/api-keys/${id}/toggle`),
  deleteApiKey: (id: string) => del(`/api-keys/${id}`),

  // --- Inbox-placement test ---
  inboxTestRun: (seeds: boolean) =>
    post<InboxTestResult>(`/inbox-test/run?seeds=${seeds}`),
  inboxTestCheckSeeds: () => post<InboxTestResult>("/inbox-test/check-seeds"),
  inboxTestLatest: () => get<InboxTestResult | null>("/inbox-test/latest"),
  inboxSeeds: () => get<InboxSeed[]>("/inbox-test/seeds"),
  addInboxSeed: (body: {
    label?: string;
    email: string;
    imapHost: string;
    imapPort?: number;
    imapUser: string;
    imapPass: string;
  }) => post<InboxSeed>("/inbox-test/seeds", body),
  toggleInboxSeed: (id: string) => post<InboxSeed>(`/inbox-test/seeds/${id}/toggle`),
  deleteInboxSeed: (id: string) => del(`/inbox-test/seeds/${id}`),

  // --- Calendar & contacts (Radicale CalDAV/CardDAV) ---
  radicaleStatus: () => get<RadicaleStatus>("/radicale/status"),
  radicaleInstall: () =>
    post<{ taskId: string; status: string; action: string }>("/radicale/install"),
  radicaleUninstall: () =>
    post<{ taskId: string; status: string; action: string }>("/radicale/uninstall"),
};
