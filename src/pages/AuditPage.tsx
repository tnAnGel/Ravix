import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { timeAgo } from "@/lib/utils";

export function AuditPage() {
  const { t } = useTranslation();
  const { data, loading } = useApi(() => api.audit());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("audit.title")}
        description={t("audit.subtitle")}
        icon={<ScrollText />}
      />
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5"><Skeleton className="h-40 w-full" /></div>
          ) : (data ?? []).length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t("audit.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("audit.time")}</TableHead>
                  <TableHead>{t("audit.actor")}</TableHead>
                  <TableHead>{t("audit.action")}</TableHead>
                  <TableHead>{t("audit.ip")}</TableHead>
                  <TableHead className="text-right">{t("audit.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {timeAgo(a.at)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{a.actor ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.action}
                      {a.detail && <span className="ml-2 text-muted-foreground">{a.detail}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {a.ip || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={a.status < 300 ? "success" : a.status < 400 ? "warning" : "critical"}>
                        {a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
