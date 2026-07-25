import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Custom (design-system) role picker used for team members and org members.
 *  Replaces the native <select> so it matches the rest of the UI. */
export function RoleSelect({
  value,
  onChange,
  className,
  includeOwner = true,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  includeOwner?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeOwner && <SelectItem value="owner">{t("settings.roleOwner")}</SelectItem>}
        <SelectItem value="admin">{t("settings.roleAdmin")}</SelectItem>
        <SelectItem value="viewer">{t("settings.roleViewer")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
