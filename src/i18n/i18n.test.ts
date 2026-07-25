import { describe, it, expect } from "vitest";
import { en } from "@/i18n/en";
import { ru } from "@/i18n/ru";

/** Flatten a nested translation object into dotted key paths. */
function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, key)
      : [key];
  });
}

describe("i18n parity (en ↔ ru)", () => {
  const enKeys = new Set(flatten(en as Record<string, unknown>));
  const ruKeys = new Set(flatten(ru as Record<string, unknown>));

  it("every English key has a Russian translation", () => {
    const missing = [...enKeys].filter((k) => !ruKeys.has(k)).sort();
    expect(missing, `keys present in en.ts but missing in ru.ts:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every Russian key has an English translation", () => {
    const missing = [...ruKeys].filter((k) => !enKeys.has(k)).sort();
    expect(missing, `keys present in ru.ts but missing in en.ts:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has a non-trivial number of keys (sanity)", () => {
    expect(enKeys.size).toBeGreaterThan(100);
  });
});
