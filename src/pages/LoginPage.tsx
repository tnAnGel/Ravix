import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
  User,
} from "lucide-react";
import { LogoMark } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";

export function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  // Drives the "First-time setup" CTA below — only shown on a brand-new install.
  const { data: serverStatus } = useApi(() => api.authStatus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      await api.login(username.trim(), password);
      navigate("/");
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left — brand / pitch panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card/40 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(600px circle at 20% 10%, hsl(245 70% 35% / 0.25), transparent 45%), radial-gradient(700px circle at 90% 90%, hsl(196 80% 40% / 0.12), transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark size={36} />
          <span className="text-lg font-semibold tracking-tight">Ravix</span>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-balance text-3xl font-semibold leading-tight tracking-tight">
            {t("login.pitchTitle")}
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {t("login.pitchBody")}
          </p>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            {[
              t("login.feature1"),
              t("login.feature2"),
              t("login.feature3"),
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          curl -fsSL https://raw.githubusercontent.com/tnAnGel/Ravix/main/install.sh | sudo bash
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:hidden">
            <LogoMark size={40} className="mx-auto" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("login.title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{t("login.username")}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("login.username")}
                  className="pl-9"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("login.password")}</Label>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn("pl-9", error && "border-destructive")}
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-xs text-destructive">
                  {t("login.invalidCredentials")}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("login.signingIn") : t("login.signIn")}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          {/* Only show the first-run setup CTA when the panel is genuinely
              unconfigured. On an in-use install this used to be a route into
              the wizard for anyone hitting /login, with no auth — actual
              security gap. Operators who need to re-run setup later get to
              it from Settings → Re-run setup wizard. */}
          {serverStatus && !serverStatus.configured && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-2xs uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                {t("login.or")}
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link to="/setup">
                  <KeyRound className="h-4 w-4" /> {t("login.firstRunSetup")}
                </Link>
              </Button>
            </div>
          )}

          <ServerStatusFooter />
        </div>
      </div>
    </div>
  );
}

function ServerStatusFooter() {
  const { t } = useTranslation();
  const { data, error } = useApi(() => api.authStatus());
  const online = !error && !!data?.online;
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2 text-2xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            online ? "bg-success animate-pulse-soft" : "bg-destructive"
          )}
        />
        {online ? t("login.serverOnline") : t("login.serverOffline")}
      </span>
      <span className="font-mono">{data?.hostname ?? "mail.example.com"}</span>
      <span className="font-mono">v{data?.version ?? "0.1.0"}</span>
    </div>
  );
}
