import { createBrowserRouter, Navigate, RouterProvider, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { SetupWizard } from "@/pages/SetupWizard";
import { DashboardPage } from "@/pages/DashboardPage";
import { DomainsPage } from "@/pages/DomainsPage";
import { CloudflareWizardPage } from "@/pages/CloudflareWizardPage";
import { DomainDetailsPage } from "@/pages/DomainDetailsPage";
import { MailboxesPage } from "@/pages/MailboxesPage";
import { WebmailPage } from "@/pages/WebmailPage";
import { AliasesPage } from "@/pages/AliasesPage";
import { AntiSpamPage } from "@/pages/AntiSpamPage";
import { SslPage } from "@/pages/SslPage";
import { CampaignsPage } from "@/pages/CampaignsPage";
import { CampaignComposerPage } from "@/pages/CampaignComposerPage";
import { CampaignDetailPage } from "@/pages/CampaignDetailPage";
import { QueuePage } from "@/pages/QueuePage";
import { LogsPage } from "@/pages/LogsPage";
import { BackupsPage } from "@/pages/BackupsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SystemPage } from "@/pages/SystemPage";
import { AuditPage } from "@/pages/AuditPage";
import { DmarcPage } from "@/pages/DmarcPage";
import { TlsSecurityPage } from "@/pages/TlsSecurityPage";
import { RblPage } from "@/pages/RblPage";
import { ReputationPage } from "@/pages/ReputationPage";
import { SoftwarePage } from "@/pages/SoftwarePage";
import { DoctorPage } from "@/pages/DoctorPage";
import { InboxTestPage } from "@/pages/InboxTestPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { OrganizationsPage } from "@/pages/OrganizationsPage";
import { MonitoringPage } from "@/pages/MonitoringPage";
import { TasksPage } from "@/pages/TasksPage";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/setup", element: <SetupRouteGuard /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "domains", element: <DomainsPage /> },
      { path: "domains/cloudflare", element: <CloudflareWizardPage /> },
      { path: "domains/:domainId", element: <DomainDetailsPage /> },
      { path: "mailboxes", element: <MailboxesPage /> },
      { path: "mailboxes/:mailboxId/mail", element: <WebmailPage /> },
      { path: "aliases", element: <AliasesPage /> },
      { path: "anti-spam", element: <AntiSpamPage /> },
      { path: "ssl", element: <SslPage /> },
      { path: "dmarc", element: <DmarcPage /> },
      { path: "tls-security", element: <TlsSecurityPage /> },
      { path: "rbl", element: <RblPage /> },
      { path: "reputation", element: <ReputationPage /> },
      { path: "inbox-test", element: <InboxTestPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "organizations", element: <OrganizationsPage /> },
      { path: "campaigns", element: <CampaignsPage /> },
      { path: "campaigns/new", element: <CampaignComposerPage /> },
      { path: "campaigns/:id", element: <CampaignDetailPage /> },
      { path: "queue", element: <QueuePage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "monitoring", element: <MonitoringPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "backups", element: <BackupsPage /> },
      { path: "software", element: <SoftwarePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "system", element: <SystemPage /> },
      { path: "doctor", element: <DoctorPage /> },
      { path: "audit", element: <AuditPage /> },
    ],
  },
]);

/**
 * Wraps SetupWizard so a casual visitor to /login → /setup on an already-
 * configured panel can't re-walk the wizard and overwrite admin creds.
 * Operators who genuinely need to re-run setup can append ?force=1 (link
 * also appears inside Settings → Re-run setup wizard).
 */
function SetupRouteGuard() {
  const [params] = useSearchParams();
  const { data, loading } = useApi(() => api.authStatus(), []);
  if (loading) return null;
  // ?force=1 — the in-panel "re-run setup" link uses this; that path is
  // already auth-gated by AppLayout so we trust the operator.
  if (data?.configured && params.get("force") !== "1") {
    return <Navigate to="/login" replace />;
  }
  return <SetupWizard />;
}

export default function App() {
  return <RouterProvider router={router} />;
}
