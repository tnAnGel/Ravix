import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
// Initialise i18next once so components using useTranslation render in tests.
import "@/i18n";

// Unmount React trees between tests so the DOM doesn't leak across cases.
afterEach(() => cleanup());
