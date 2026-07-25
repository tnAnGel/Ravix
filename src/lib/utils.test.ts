import { describe, it, expect } from "vitest";
import { formatBytes, pct, cn } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats across units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("honours decimal places", () => {
    expect(formatBytes(1536, 2)).toBe("1.5 KB");
    expect(formatBytes(1587, 2)).toBe("1.55 KB");
  });
});

describe("pct", () => {
  it("computes a clamped percentage", () => {
    expect(pct(0, 100)).toBe(0);
    expect(pct(50, 100)).toBe(50);
    expect(pct(100, 100)).toBe(100);
    expect(pct(150, 100)).toBe(100); // clamped at 100
  });

  it("guards against a zero/negative total", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -10)).toBe(0);
  });

  it("rounds to the nearest integer", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
  });
});

describe("cn", () => {
  it("merges and de-duplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4"); // tailwind-merge keeps the last
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});
