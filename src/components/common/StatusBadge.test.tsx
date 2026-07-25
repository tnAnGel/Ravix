import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatusBadge, CheckBadge } from "@/components/common/StatusBadge";
import type { CheckStatus, HealthStatus } from "@/types";

describe("StatusBadge / CheckBadge", () => {
  it("renders known health statuses", () => {
    for (const s of ["healthy", "warning", "critical"] as HealthStatus[]) {
      const { container } = render(<StatusBadge status={s} />);
      expect(container.firstChild).toBeTruthy();
    }
  });

  it("falls back instead of crashing on an unknown health status", () => {
    expect(() => render(<StatusBadge status={"bogus" as unknown as HealthStatus} />)).not.toThrow();
  });

  it("renders known check statuses", () => {
    for (const s of ["pass", "warn", "fail"] as CheckStatus[]) {
      const { container } = render(<CheckBadge status={s} />);
      expect(container.firstChild).toBeTruthy();
    }
  });

  it("falls back instead of crashing on an unknown check status", () => {
    expect(() => render(<CheckBadge status={"weird" as unknown as CheckStatus} />)).not.toThrow();
  });
});
