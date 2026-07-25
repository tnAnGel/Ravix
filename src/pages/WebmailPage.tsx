import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  Archive,
  Bold,
  ChevronLeft,
  Download,
  FileText,
  Filter,
  Forward,
  Image as ImageIcon,
  Inbox,
  Italic,
  Link2,
  List as ListIcon,
  ListOrdered,
  Loader2,
  Mail,
  MailOpen,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  PenSquare,
  Reply,
  ReplyAll,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/common/Avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import type {
  MailAttachment,
  MailContact,
  MailFilterRule,
  MailFolderInfo,
  MailFull,
  MailSummary,
} from "@/types";

// ---------------------------------------------------------------------------
// Folder presentation
// ---------------------------------------------------------------------------

const FOLDER_ICON: Record<string, typeof Inbox> = {
  inbox: Inbox,
  sent: Send,
  drafts: FileText,
  spam: ShieldAlert,
  trash: Trash2,
  archive: Archive,
};

function folderLabel(t: (k: string) => string, key: string): string {
  const known = ["inbox", "sent", "drafts", "spam", "trash", "archive"];
  return known.includes(key) ? t(`webmail.folder.${key}`) : key;
}

const PAGE = 50;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WebmailPage() {
  const { t } = useTranslation();
  const { mailboxId: routeId } = useParams();

  // Resolve mailbox: route param, else first active mailbox.
  const { data: mailboxes } = useApi(() => api.mailboxes({ status: "active" }), []);
  const mailboxId = routeId ?? mailboxes?.[0]?.id ?? null;
  const mailbox = useMemo(
    () => mailboxes?.find((m) => m.id === mailboxId),
    [mailboxes, mailboxId]
  );

  const [folder, setFolder] = useState("inbox");
  const [folders, setFolders] = useState<MailFolderInfo[]>([]);
  const [messages, setMessages] = useState<MailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<MailFull | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  // Mobile: which pane is visible.
  const [mobilePane, setMobilePane] = useState<"list" | "read">("list");

  const loadFolders = useCallback(async () => {
    if (!mailboxId) return;
    try {
      setFolders(await api.mailFolders(mailboxId));
    } catch {
      /* ignore */
    }
  }, [mailboxId]);

  const loadMessages = useCallback(
    async (reset: boolean) => {
      if (!mailboxId) return;
      setLoading(true);
      try {
        const offset = reset ? 0 : messages.length;
        const page = await api.mailMessages(mailboxId, folder, {
          q: query || undefined,
          offset,
          limit: PAGE,
        });
        setTotal(page.total);
        setMessages((prev) => (reset ? page.messages : [...prev, ...page.messages]));
      } finally {
        setLoading(false);
      }
    },
    [mailboxId, folder, query, messages.length]
  );

  // Initial + folder/search change → reset list.
  useEffect(() => {
    setMessages([]);
    setSelectedId(null);
    setOpen(null);
    loadFolders();
    loadMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxId, folder, query]);

  // Live refresh every 20s + when the tab regains focus.
  useEffect(() => {
    if (!mailboxId) return;
    const tick = () => {
      loadFolders();
      loadMessages(true);
    };
    const h = setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(h);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxId, folder, query]);

  const openMessage = useCallback(
    async (s: MailSummary) => {
      setSelectedId(s.id);
      setMobilePane("read");
      try {
        const full = await api.mailMessage(s.id);
        setOpen(full);
        if (s.unread) {
          setMessages((prev) =>
            prev.map((m) => (m.id === s.id ? { ...m, unread: false } : m))
          );
          loadFolders();
        }
      } catch {
        setOpen(null);
      }
    },
    [loadFolders]
  );

  // --- message actions ---------------------------------------------------

  const afterMutation = useCallback(() => {
    loadFolders();
    loadMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFolders]);

  const doStar = async (s: MailSummary) => {
    const res = await api.mailStar(s.id, !s.starred);
    setMessages((prev) => prev.map((m) => (m.id === s.id ? res : m)));
    if (open && open.summary.id === s.id) setOpen({ ...open, summary: res });
  };

  const doDelete = async (id: string) => {
    await api.mailDelete(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (open?.summary.id === id) {
      setOpen(null);
      setMobilePane("list");
    }
    afterMutation();
  };

  const doMove = async (id: string, target: string) => {
    await api.mailMove(id, target);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (open?.summary.id === id) {
      setOpen(null);
      setMobilePane("list");
    }
    afterMutation();
  };

  const doMarkUnread = async (id: string) => {
    await api.mailSetRead(id, true);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, unread: true } : m)));
    loadFolders();
  };

  // --- compose openers ---------------------------------------------------

  const startCompose = () =>
    setCompose({ to: "", cc: "", bcc: "", subject: "", html: "", showCc: false });

  const startReply = (full: MailFull, all: boolean) => {
    const s = full.summary;
    const cc = all ? full.ccAddr : "";
    setCompose({
      to: full.replyTo || s.fromAddr,
      cc,
      bcc: "",
      showCc: !!cc,
      subject: prefixSubject(s.subject, "Re"),
      html: quoteHtml(full),
      inReplyTo: full.messageId ?? undefined,
      references: full.messageId ?? undefined,
    });
  };

  const startForward = (full: MailFull) => {
    setCompose({
      to: "",
      cc: "",
      bcc: "",
      showCc: false,
      subject: prefixSubject(full.summary.subject, "Fwd"),
      html: quoteHtml(full),
    });
  };

  // --- keyboard shortcuts ------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || compose) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      const idx = messages.findIndex((m) => m.id === selectedId);
      switch (e.key) {
        case "c":
          startCompose();
          break;
        case "j":
          if (idx < messages.length - 1) openMessage(messages[idx + 1]);
          break;
        case "k":
          if (idx > 0) openMessage(messages[idx - 1]);
          break;
        case "r":
          if (open) startReply(open, false);
          break;
        case "a":
          if (open) startReply(open, true);
          break;
        case "f":
          if (open) startForward(open);
          break;
        case "e":
          if (open) doMove(open.summary.id, "archive");
          break;
        case "#":
          if (open) doDelete(open.summary.id);
          break;
        case "/":
          e.preventDefault();
          document.getElementById("mail-search")?.focus();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedId, open, compose]);

  if (!mailboxId) {
    return (
      <div className="flex h-[70vh] items-center justify-center text-muted-foreground">
        {t("webmail.noMailbox")}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <span className="font-medium">{mailbox?.email ?? t("webmail.title")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowFilters(true)}>
            <Filter className="h-4 w-4" /> {t("webmail.filters")}
          </Button>
          <Button size="sm" onClick={startCompose}>
            <PenSquare className="h-4 w-4" /> {t("webmail.compose")}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[190px_minmax(300px,380px)_1fr]">
        {/* Folder rail */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto rounded-lg border border-border bg-card/40 p-2",
            mobilePane === "read" ? "hidden lg:block" : "block"
          )}
        >
          {folders.map((f) => {
            const Icon = FOLDER_ICON[f.key] ?? Inbox;
            return (
              <button
                key={f.key}
                onClick={() => setFolder(f.key)}
                className={cn(
                  "mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm",
                  folder === f.key
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-card"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{folderLabel(t, f.key)}</span>
                {f.unread > 0 && (
                  <Badge variant="info" className="h-5 px-1.5 text-2xs">
                    {f.unread}
                  </Badge>
                )}
              </button>
            );
          })}
          {folder === "trash" && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-destructive"
              onClick={async () => {
                if (!confirm(t("webmail.confirmEmptyTrash"))) return;
                await api.mailEmptyTrash(mailboxId);
                afterMutation();
              }}
            >
              <Trash2 className="h-4 w-4" /> {t("webmail.emptyTrash")}
            </Button>
          )}
        </div>

        {/* Message list */}
        <div
          className={cn(
            "flex min-h-0 flex-col rounded-lg border border-border bg-card/40",
            mobilePane === "read" ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="flex items-center gap-2 border-b border-border p-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="mail-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("webmail.searchPlaceholder")}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              title={t("webmail.refresh")}
              onClick={() => {
                loadFolders();
                loadMessages(true);
              }}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && messages.length === 0 ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full animate-fade-in flex-col items-center justify-center gap-3 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/60">
                  <MailOpen className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">{t("webmail.empty")}</p>
                <p className="text-2xs text-muted-foreground">{t("webmail.emptyHint")}</p>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    active={selectedId === m.id}
                    onOpen={() => openMessage(m)}
                    onStar={() => doStar(m)}
                    onArchive={() => doMove(m.id, "archive")}
                    onDelete={() => doDelete(m.id)}
                  />
                ))}
                {messages.length < total && (
                  <div className="p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={loading}
                      onClick={() => loadMessages(false)}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("webmail.loadMore", { count: total - messages.length })
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Reading pane */}
        <div
          className={cn(
            "min-h-0 overflow-y-auto rounded-lg border border-border bg-card/40",
            mobilePane === "list" ? "hidden lg:block" : "block"
          )}
        >
          {open ? (
            <ReadingPane
              full={open}
              onBack={() => setMobilePane("list")}
              onReply={() => startReply(open, false)}
              onReplyAll={() => startReply(open, true)}
              onForward={() => startForward(open)}
              onStar={() => doStar(open.summary)}
              onArchive={() => doMove(open.summary.id, "archive")}
              onSpam={() =>
                doMove(open.summary.id, folder === "spam" ? "inbox" : "spam")
              }
              onDelete={() => doDelete(open.summary.id)}
              onMarkUnread={() => {
                doMarkUnread(open.summary.id);
                setOpen(null);
                setMobilePane("list");
              }}
              inSpam={folder === "spam"}
            />
          ) : selectedId ? (
            <ReadingSkeleton />
          ) : (
            <div className="flex h-full animate-fade-in flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-8 w-8 text-primary/70" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("webmail.selectMessage")}</p>
              <p className="max-w-xs text-2xs text-muted-foreground">
                {t("webmail.selectMessageHint")}
              </p>
              <Button size="sm" variant="outline" onClick={startCompose}>
                <PenSquare className="h-4 w-4" /> {t("webmail.compose")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {compose && mailboxId && (
        <ComposeDialog
          mailboxId={mailboxId}
          state={compose}
          onClose={() => setCompose(null)}
          onSent={() => {
            setCompose(null);
            afterMutation();
          }}
        />
      )}

      {showFilters && mailboxId && (
        <FiltersDialog mailboxId={mailboxId} folders={folders} onClose={() => setShowFilters(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message row
// ---------------------------------------------------------------------------

function MessageRow({
  m,
  active,
  onOpen,
  onStar,
  onArchive,
  onDelete,
}: {
  m: MailSummary;
  active: boolean;
  onOpen: () => void;
  onStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-2.5 border-b border-border/60 py-2.5 pl-3 pr-2 text-left transition-colors",
        active ? "bg-primary/10" : "hover:bg-card",
        m.unread && !active && "bg-card/50"
      )}
    >
      {/* Active accent bar */}
      {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      {/* Unread dot */}
      <span className="mt-2 w-1.5 shrink-0">
        {m.unread && <span className="block h-1.5 w-1.5 rounded-full bg-primary" />}
      </span>

      <Avatar name={m.fromName} email={m.fromAddr} size="md" className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              m.unread ? "font-semibold text-foreground" : "text-foreground/80"
            )}
          >
            {m.fromName || m.fromAddr}
          </span>
          <span
            className="shrink-0 text-2xs text-muted-foreground group-hover:opacity-0"
            title={formatDateTime(m.receivedAt)}
          >
            {timeAgo(m.receivedAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm",
              m.unread ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {m.subject}
          </span>
          {m.threadCount > 1 && (
            <Badge variant="muted" className="h-4 px-1 text-2xs">
              {m.threadCount}
            </Badge>
          )}
          {m.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </div>
        <p className="truncate text-2xs text-muted-foreground">{m.preview}</p>
      </div>

      {/* Hover quick actions + star */}
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className="rounded p-1 hover:bg-secondary"
          title={t("webmail.star")}
        >
          <Star
            className={cn(
              "h-4 w-4",
              m.starred ? "fill-warning text-warning" : "text-muted-foreground/50"
            )}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className="hidden rounded p-1 hover:bg-secondary group-hover:block"
          title={t("webmail.archive")}
        >
          <Archive className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="hidden rounded p-1 hover:bg-secondary group-hover:block"
          title={t("webmail.delete")}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reading pane
// ---------------------------------------------------------------------------

/** Placeholder shown while a clicked message is being fetched. */
function ReadingSkeleton() {
  return (
    <div className="animate-fade-in p-5">
      <Skeleton className="h-6 w-3/4" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}

function ReadingPane({
  full,
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onStar,
  onArchive,
  onSpam,
  onDelete,
  onMarkUnread,
  inSpam,
}: {
  full: MailFull;
  onBack: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onStar: () => void;
  onArchive: () => void;
  onSpam: () => void;
  onDelete: () => void;
  onMarkUnread: () => void;
  inSpam: boolean;
}) {
  const { t } = useTranslation();
  const s = full.summary;
  const [thread, setThread] = useState<MailFull[]>([full]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([full.summary.id]));

  // Load the whole conversation when the opened message belongs to a thread.
  useEffect(() => {
    setThread([full]);
    setExpanded(new Set([full.summary.id]));
    if (full.summary.threadCount > 1) {
      api
        .mailThread(full.summary.id)
        .then((msgs) => {
          if (!msgs?.length) return;
          setThread(msgs);
          const last = msgs[msgs.length - 1].summary.id;
          setExpanded(new Set([last, full.summary.id]));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full.summary.id]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onReply} title={t("webmail.reply")}>
          <Reply className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onReplyAll} title={t("webmail.replyAll")}>
          <ReplyAll className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onForward} title={t("webmail.forward")}>
          <Forward className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="icon-sm" variant="ghost" onClick={onStar} title={t("webmail.star")}>
          <Star className={cn("h-4 w-4", s.starred && "fill-warning text-warning")} />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onArchive} title={t("webmail.archive")}>
          <Archive className="h-4 w-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onSpam} title={inSpam ? t("webmail.notSpam") : t("webmail.spam")}>
          <ShieldAlert className={cn("h-4 w-4", inSpam && "text-success")} />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onMarkUnread} title={t("webmail.markUnread")}>
          <MailOpen className="h-4 w-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onDelete} title={t("webmail.delete")}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Subject */}
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-xl font-semibold leading-snug text-foreground">{s.subject}</h2>
        {thread.length > 1 && (
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {t("webmail.messagesInThread", { count: thread.length })}
          </p>
        )}
      </div>

      {/* Conversation */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {thread.map((msg, i) => (
          <ThreadMessage
            key={msg.summary.id}
            full={msg}
            collapsible={thread.length > 1}
            expanded={expanded.has(msg.summary.id)}
            onToggle={() => toggle(msg.summary.id)}
            isLast={i === thread.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/** A single message inside the conversation view — collapsible header + body. */
function ThreadMessage({
  full,
  collapsible,
  expanded,
  onToggle,
  isLast,
}: {
  full: MailFull;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const s = full.summary;
  const realAttachments = full.attachments.filter((a) => !a.inline);
  const [preview, setPreview] = useState<MailAttachment | null>(null);

  // Collapsed one-line summary (only in multi-message threads).
  if (collapsible && !expanded) {
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left transition-colors hover:bg-card/50"
      >
        <Avatar name={s.fromName} email={s.fromAddr} size="sm" />
        <span className="shrink-0 text-sm font-medium text-foreground">
          {s.fromName || s.fromAddr}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.preview}</span>
        {s.hasAttachments && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <span className="shrink-0 text-2xs text-muted-foreground">{timeAgo(s.receivedAt)}</span>
      </button>
    );
  }

  return (
    <div className={cn("border-b border-border/60", collapsible && !isLast && "bg-card/20")}>
      {/* Sender card — clicking collapses (in threads) */}
      <div
        className={cn("px-5 py-4", collapsible && "cursor-pointer")}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="flex items-start gap-3">
          <Avatar name={s.fromName} email={s.fromAddr} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium text-foreground">
                {s.fromName || s.fromAddr}
              </span>
              <span
                className="shrink-0 text-2xs text-muted-foreground"
                title={formatDateTime(s.receivedAt)}
              >
                {formatDateTime(s.receivedAt)}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{s.fromAddr}</p>
            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {t("webmail.to")}: {s.toAddr}
              {full.ccAddr ? ` · ${t("webmail.cc")}: ${full.ccAddr}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Body + attachments */}
      <div className="px-5 pb-5">
        {full.html ? (
          <HtmlMailBody html={full.html} messageId={s.id} attachments={full.attachments} />
        ) : (
          <PlainTextBody text={full.text || t("webmail.emptyBody")} />
        )}

        {realAttachments.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              {t("webmail.attachments", { count: realAttachments.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              {realAttachments.map((a) => (
                <AttachmentChip
                  key={a.index}
                  messageId={s.id}
                  att={a}
                  onPreview={isPreviewable(a) ? () => setPreview(a) : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <AttachmentLightbox messageId={s.id} att={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/** Images and PDFs can be shown inline; everything else is download-only. */
function isPreviewable(a: MailAttachment): boolean {
  const ct = (a.contentType || "").toLowerCase();
  return ct.startsWith("image/") || ct === "application/pdf";
}

async function downloadAttachment(messageId: string, att: MailAttachment) {
  const blob = await api.mailAttachment(messageId, att.index);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = att.filename ?? `attachment-${att.index}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AttachmentChip({
  messageId,
  att,
  onPreview,
}: {
  messageId: string;
  att: MailAttachment;
  onPreview?: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = (att.contentType || "").toLowerCase().startsWith("image/");

  // Lazily load a thumbnail for image attachments.
  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let alive = true;
    api
      .mailAttachment(messageId, att.index)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setThumb(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [isImage, messageId, att.index]);

  const download = async () => {
    setBusy(true);
    try {
      await downloadAttachment(messageId, att);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex items-center gap-2 overflow-hidden rounded-md border border-border bg-card text-xs">
      <button
        onClick={onPreview ?? download}
        className="flex min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-card/70"
        title={onPreview ? t("webmail.preview") : t("common.download")}
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
        ) : isImage ? (
          <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
        ) : att.contentType === "application/pdf" ? (
          <FileText className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="block max-w-[180px] truncate">{att.filename ?? `#${att.index}`}</span>
          <span className="text-2xs text-muted-foreground">{formatBytes(att.sizeBytes)}</span>
        </span>
      </button>
      <button
        onClick={download}
        className="border-l border-border px-2.5 py-2 hover:bg-card/70"
        title={t("common.download")}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}

/** Full-screen preview overlay for image / PDF attachments. */
function AttachmentLightbox({
  messageId,
  att,
  onClose,
}: {
  messageId: string;
  att: MailAttachment;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isImage = (att.contentType || "").toLowerCase().startsWith("image/");

  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    api
      .mailAttachment(messageId, att.index)
      .then((blob) => {
        made = URL.createObjectURL(blob);
        if (alive) setUrl(made);
        else URL.revokeObjectURL(made);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [messageId, att.index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="min-w-0 truncate text-sm">
          {att.filename ?? `#${att.index}`}{" "}
          <span className="text-white/60">{formatBytes(att.sizeBytes)}</span>
        </span>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={() => downloadAttachment(messageId, att)}
          >
            <Download className="h-4 w-4" /> {t("common.download")}
          </Button>
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <p className="text-sm text-white/70">{t("webmail.previewFailed")}</p>
        ) : !url ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        ) : isImage ? (
          <img src={url} alt={att.filename ?? ""} className="max-h-full max-w-full rounded object-contain" />
        ) : (
          <iframe src={url} title={att.filename ?? "PDF"} className="h-full w-full rounded bg-white" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML body — sanitized, rendered in an isolated iframe, cid: images resolved
// ---------------------------------------------------------------------------

function HtmlMailBody({
  html,
  messageId,
  attachments,
}: {
  html: string;
  messageId: string;
  attachments: MailAttachment[];
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState("");
  const [showQuoted, setShowQuoted] = useState(false);

  useEffect(() => {
    const revoked: string[] = [];
    let cancelled = false;
    (async () => {
      // 1. Sanitize — strips scripts, event handlers, etc.
      let clean = DOMPurify.sanitize(html, {
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      });
      // 2. Resolve inline cid: images to blob URLs.
      const inline = attachments.filter((a) => a.inline && a.contentId);
      for (const a of inline) {
        if (cancelled) return;
        const cid = a.contentId!.replace(/[<>]/g, "");
        if (clean.includes(`cid:${cid}`)) {
          try {
            const blob = await api.mailAttachment(messageId, a.index);
            const url = URL.createObjectURL(blob);
            revoked.push(url);
            clean = clean.split(`cid:${cid}`).join(url);
          } catch {
            /* leave the broken cid */
          }
        }
      }
      // 3. Split off the quoted reply history so it can be collapsed. The
      //    sandbox has no JS, so we do the split here and re-render on toggle.
      const split = splitQuotedHtml(clean);
      const visible = showQuoted || !split.quoted ? clean : split.main;
      // Render on a WHITE sheet with DARK text — exactly like Gmail/Outlook/
      // Apple Mail. HTML emails are authored for light backgrounds; forcing the
      // panel's dark-theme colours (light text on transparent) made any email
      // with its own white block invisible. The default colours below only
      // apply where the email itself doesn't set one, so emails keep their own
      // styling and unstyled ones stay readable.
      const doc = `<!doctype html><html><head><base target="_blank">
        <meta charset="utf-8">
        <style>
          html,body{margin:0;padding:0;background:#ffffff;color:#1a1d29;
            font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
            font-size:15px;line-height:1.65;word-wrap:break-word;overflow-wrap:anywhere}
          body{padding:20px 22px}
          .ravix-wrap{max-width:680px}
          p{margin:0 0 14px}
          a{color:#1a56db;text-decoration:none}
          a:hover{text-decoration:underline}
          img{max-width:100%;height:auto}
          table{max-width:100%}
          h1,h2,h3{line-height:1.3;margin:18px 0 10px;color:#0f1320}
          ul,ol{margin:0 0 14px;padding-left:22px}
          li{margin:4px 0}
          hr{border:none;border-top:1px solid #e3e6ec;margin:18px 0}
          pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
          pre{background:#f4f5f7;border:1px solid #e3e6ec;border-radius:8px;padding:12px;overflow:auto;color:#1a1d29}
          code{background:#f4f5f7;border-radius:4px;padding:1px 5px;color:#1a1d29}
          blockquote{border-left:3px solid #d0d4dc;margin:0 0 14px;padding:2px 0 2px 14px;color:#5a6372}
        </style></head><body><div class="ravix-wrap">${visible}</div></body></html>`;
      if (!cancelled) setSrcDoc(doc);
    })();
    return () => {
      cancelled = true;
      revoked.forEach(URL.revokeObjectURL);
    };
  }, [html, messageId, attachments, showQuoted]);

  const hasQuoted = !showQuoted && !!splitQuotedHtml(html).quoted;

  // Auto-size to content. sandbox has allow-same-origin (so we can read the
  // height) but NOT allow-scripts — combined with DOMPurify this keeps email
  // markup from running any JavaScript.
  const resize = () => {
    const f = ref.current;
    if (!f?.contentDocument?.body) return;
    f.style.height = f.contentDocument.body.scrollHeight + 24 + "px";
  };

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-border/60 bg-white shadow-sm">
        <iframe
          ref={ref}
          title="message-body"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={srcDoc}
          onLoad={resize}
          className="w-full"
          style={{ border: "none", minHeight: "80px", display: "block", background: "#fff" }}
        />
      </div>
      {hasQuoted && <QuoteToggle onClick={() => setShowQuoted(true)} />}
    </div>
  );
}

/** Compact "show trimmed/quoted content" affordance (Gmail-style "···"). */
function QuoteToggle({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t("webmail.showQuoted")}
      className="mt-1 flex items-center gap-1 rounded bg-secondary/60 px-2 py-1 text-muted-foreground hover:bg-secondary"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}

/** Heuristic split of an HTML email into the new message and the quoted reply
 *  history, so the latter can be collapsed. Conservative: only splits on
 *  well-known markers to avoid hiding real content. */
function splitQuotedHtml(html: string): { main: string; quoted: string } {
  const markers = [
    /<blockquote/i,
    /<div[^>]+class="[^"]*gmail_quote/i,
    /<div[^>]+class="[^"]*moz-cite-prefix/i,
    /<div[^>]+id="appendonsend/i,
    /id="divRplyFwdMsg/i,
  ];
  let idx = -1;
  for (const m of markers) {
    const hit = html.search(m);
    if (hit >= 0 && (idx === -1 || hit < idx)) idx = hit;
  }
  if (idx <= 0) return { main: html, quoted: "" };
  return { main: html.slice(0, idx), quoted: html.slice(idx) };
}

/** Plain-text body with collapsible quoted lines / signature. */
function PlainTextBody({ text }: { text: string }) {
  const { t } = useTranslation();
  const [showQuoted, setShowQuoted] = useState(false);
  const lines = text.split("\n");
  // Find where the quoted history / signature begins.
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^>/.test(l) || /^-{2}\s*$/.test(l) || /^On .+ wrote:$/.test(l) || /^_{5,}$/.test(l)) {
      cut = i;
      break;
    }
  }
  const hasQuoted = cut > 0 && !showQuoted;
  const shown = hasQuoted ? lines.slice(0, cut).join("\n").replace(/\s+$/, "") : text;
  // Same white "sheet" as the HTML body so reading is consistent and the text
  // is always dark-on-white regardless of the panel theme.
  return (
    <div>
      <div className="rounded-lg border border-border/60 bg-white px-5 py-4 shadow-sm">
        <pre className="max-w-[680px] whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-zinc-900">
          {shown || t("webmail.emptyBody")}
        </pre>
      </div>
      {hasQuoted && <QuoteToggle onClick={() => setShowQuoted(true)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

interface ComposeState {
  to: string;
  cc: string;
  bcc: string;
  showCc: boolean;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
}

function ComposeDialog({
  mailboxId,
  state,
  onClose,
  onSent,
}: {
  mailboxId: string;
  state: ComposeState;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const [to, setTo] = useState(state.to);
  const [cc, setCc] = useState(state.cc);
  const [bcc, setBcc] = useState(state.bcc);
  const [showCc, setShowCc] = useState(state.showCc);
  const [subject, setSubject] = useState(state.subject);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Seed body once + signature.
  useEffect(() => {
    (async () => {
      let html = state.html;
      try {
        const sig = await api.mailSignature(mailboxId);
        if (sig.enabled && sig.html) {
          html = `${html}<br><br>--<br>${sig.html}`;
        }
      } catch {
        /* no signature */
      }
      if (bodyRef.current) bodyRef.current.innerHTML = html;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildForm = (draft: boolean): FormData => {
    const fd = new FormData();
    fd.set("to", to);
    fd.set("cc", cc);
    fd.set("bcc", bcc);
    fd.set("subject", subject);
    fd.set("html", bodyRef.current?.innerHTML ?? "");
    fd.set("draft", draft ? "true" : "false");
    if (state.inReplyTo) fd.set("inReplyTo", state.inReplyTo);
    if (state.references) fd.set("references", state.references);
    files.forEach((f) => fd.append("attachments", f, f.name));
    return fd;
  };

  // Draft autosave every 25s when there's something to save.
  useEffect(() => {
    const h = setInterval(async () => {
      if (!to && !subject && !(bodyRef.current?.textContent ?? "").trim()) return;
      try {
        await api.mailCompose(mailboxId, buildForm(true));
        setDraftSaved(new Date().toLocaleTimeString());
      } catch {
        /* ignore */
      }
    }, 25000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, cc, bcc, files]);

  const send = async () => {
    setSending(true);
    setError("");
    try {
      await api.mailCompose(mailboxId, buildForm(false));
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "send failed");
      setSending(false);
    }
  };

  const exec = (cmd: string, val?: string) => {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center",
        maximized ? "sm:p-6" : "sm:p-4"
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col border border-border bg-card shadow-xl",
          maximized
            ? "h-full max-w-5xl rounded-xl sm:h-[94vh]"
            : "h-full max-w-2xl rounded-t-xl sm:h-auto sm:max-h-[88vh] sm:rounded-xl"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{t("webmail.newMessage")}</h3>
          <div className="flex items-center gap-2">
            {draftSaved && (
              <span className="text-2xs text-muted-foreground">
                {t("webmail.draftSaved", { time: draftSaved })}
              </span>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setMaximized((v) => !v)}
              title={t(maximized ? "webmail.restore" : "webmail.maximize")}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Recipients + subject — borderless rows with dividers */}
        <div className="shrink-0 border-b border-border">
          <RecipientField
            mailboxId={mailboxId}
            label={t("webmail.to")}
            value={to}
            onChange={setTo}
            trailing={
              !showCc && (
                <button
                  className="shrink-0 text-2xs text-primary hover:underline"
                  onClick={() => setShowCc(true)}
                >
                  {t("webmail.addCc")}
                </button>
              )
            }
          />
          {showCc && (
            <>
              <div className="border-t border-border/60">
                <RecipientField mailboxId={mailboxId} label={t("webmail.cc")} value={cc} onChange={setCc} />
              </div>
              <div className="border-t border-border/60">
                <RecipientField mailboxId={mailboxId} label={t("webmail.bcc")} value={bcc} onChange={setBcc} />
              </div>
            </>
          )}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("webmail.subject")}
            className="h-11 w-full border-t border-border/60 bg-transparent px-4 text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
          <div
            ref={bodyRef}
            contentEditable
            data-ph={t("webmail.bodyPlaceholder")}
            className="rte-editor min-h-[160px] flex-1 text-sm leading-relaxed text-foreground outline-none"
          />

          {/* Attachments */}
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-2xs"
                >
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                  <button
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 hover:bg-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        {/* Action bar: send + formatting + attach */}
        <div className="flex shrink-0 items-center gap-1 border-t border-border px-3 py-2.5">
          <Button onClick={send} disabled={sending || !to.trim()} className="shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("webmail.send")}
          </Button>

          <span className="mx-1.5 h-5 w-px bg-border" />

          <div className="flex items-center">
            <Button size="icon-sm" variant="ghost" onClick={() => exec("bold")} title="Bold">
              <Bold className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => exec("italic")} title="Italic">
              <Italic className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => exec("underline")} title="Underline">
              <UnderlineIcon className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => exec("insertUnorderedList")} title="Bulleted list">
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => exec("insertOrderedList")} title="Numbered list">
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                const url = prompt(t("webmail.linkUrl"));
                if (url) exec("createLink", url);
              }}
              title="Link"
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>

          <label className="ml-auto cursor-pointer" title={t("webmail.attach")}>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) setFiles((p) => [...p, ...Array.from(e.target.files!)]);
              }}
            />
            <span className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Paperclip className="h-4 w-4" />
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

function RecipientField({
  mailboxId,
  label,
  value,
  onChange,
  trailing,
}: {
  mailboxId: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  trailing?: React.ReactNode;
}) {
  const [suggestions, setSuggestions] = useState<MailContact[]>([]);
  const [openList, setOpenList] = useState(false);

  const lastToken = (v: string) => v.split(/[,;]\s*/).pop()?.trim() ?? "";

  useEffect(() => {
    const token = lastToken(value);
    if (token.length < 2) {
      setSuggestions([]);
      return;
    }
    const h = setTimeout(async () => {
      try {
        setSuggestions(await api.mailContacts(mailboxId, token));
        setOpenList(true);
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(h);
  }, [value, mailboxId]);

  const pick = (c: MailContact) => {
    const parts = value.split(/[,;]\s*/);
    parts[parts.length - 1] = c.email;
    onChange(parts.join(", ") + ", ");
    setOpenList(false);
  };

  return (
    <div className="relative flex items-center gap-2 px-4">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length && setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 150)}
        className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
      />
      {trailing}
      {openList && suggestions.length > 0 && (
        <div className="absolute left-14 right-4 top-full z-10 overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {suggestions.map((c) => (
            <button
              key={c.id}
              onMouseDown={() => pick(c)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10"
            >
              <Avatar name={c.name} email={c.email} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-foreground">{c.name || c.email}</span>
                {c.name && <span className="block truncate text-2xs text-muted-foreground">{c.email}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters (Sieve) dialog
// ---------------------------------------------------------------------------

function FiltersDialog({
  mailboxId,
  folders,
  onClose,
}: {
  mailboxId: string;
  folders: MailFolderInfo[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<MailFilterRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await api.mailFilters(mailboxId));
    } finally {
      setLoading(false);
    }
  }, [mailboxId]);

  useEffect(() => {
    load();
  }, [load]);

  const addRule = async () => {
    await api.mailCreateFilter(mailboxId, {
      name: t("webmail.newRule"),
      field: "from",
      op: "contains",
      value: "",
      action: "fileinto",
      target: "archive",
      enabled: true,
    });
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">{t("webmail.filtersTitle")}</h3>
            <p className="text-2xs text-muted-foreground">{t("webmail.filtersHint")}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("webmail.noFilters")}
            </p>
          ) : (
            rules.map((r) => (
              <FilterRow
                key={r.id}
                mailboxId={mailboxId}
                rule={r}
                folders={folders}
                onChanged={load}
              />
            ))
          )}
        </div>

        <div className="border-t border-border p-3">
          <Button variant="outline" size="sm" onClick={addRule} className="w-full">
            {t("webmail.addRule")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterRow({
  mailboxId,
  rule,
  folders,
  onChanged,
}: {
  mailboxId: string;
  rule: MailFilterRule;
  folders: MailFolderInfo[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [r, setR] = useState(rule);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof MailFilterRule>(k: K, v: MailFilterRule[K]) => {
    setR((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    await api.mailUpdateFilter(mailboxId, r.id, r);
    setDirty(false);
    onChanged();
  };

  const remove = async () => {
    await api.mailDeleteFilter(mailboxId, r.id);
    onChanged();
  };

  const sel = "h-8 rounded-md border border-border bg-background px-2 text-sm";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2">
        <Input
          value={r.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t("webmail.ruleName")}
          className="h-8 flex-1 text-sm"
        />
        <button onClick={remove} className="text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("webmail.ruleIf")}</span>
        <Select value={r.field} onValueChange={(v) => set("field", v as MailFilterRule["field"])}>
          <SelectTrigger className={sel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="from">{t("webmail.fieldFrom")}</SelectItem>
            <SelectItem value="to">{t("webmail.fieldTo")}</SelectItem>
            <SelectItem value="subject">{t("webmail.fieldSubject")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={r.op} onValueChange={(v) => set("op", v as MailFilterRule["op"])}>
          <SelectTrigger className={sel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">{t("webmail.opContains")}</SelectItem>
            <SelectItem value="is">{t("webmail.opIs")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={r.value}
          onChange={(e) => set("value", e.target.value)}
          placeholder={t("webmail.ruleValue")}
          className="h-8 w-40 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("webmail.ruleThen")}</span>
        <Select value={r.action} onValueChange={(v) => set("action", v as MailFilterRule["action"])}>
          <SelectTrigger className={sel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fileinto">{t("webmail.actFileinto")}</SelectItem>
            <SelectItem value="discard">{t("webmail.actDiscard")}</SelectItem>
            <SelectItem value="mark_read">{t("webmail.actMarkRead")}</SelectItem>
            <SelectItem value="star">{t("webmail.actStar")}</SelectItem>
          </SelectContent>
        </Select>
        {r.action === "fileinto" && (
          <Select value={r.target ?? "archive"} onValueChange={(v) => set("target", v)}>
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {folders.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {folderLabel(t, f.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {dirty && (
          <Button size="sm" onClick={save}>
            {t("common.save")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function prefixSubject(subject: string, prefix: string): string {
  const re = new RegExp(`^${prefix}:\\s*`, "i");
  return re.test(subject) ? subject : `${prefix}: ${subject}`;
}

function quoteHtml(full: MailFull): string {
  const s = full.summary;
  const original = full.html || (full.text ? `<pre>${escapeHtml(full.text)}</pre>` : "");
  return `<br><br><blockquote>${escapeHtml(s.fromName || s.fromAddr)} ${formatDateTime(
    s.receivedAt
  )}:<br>${original}</blockquote>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
