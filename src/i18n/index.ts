import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { ru } from "./ru";

export const SUPPORTED_LANGUAGES = [
  { code: "ru", label: "Русский", short: "RU" },
  { code: "en", label: "English", short: "EN" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

const STORAGE_KEY = "ravix.lang";

function initialLanguage(): LanguageCode {
  const stored = (typeof localStorage !== "undefined" &&
    localStorage.getItem(STORAGE_KEY)) as LanguageCode | null;
  if (stored === "ru" || stored === "en") return stored;
  return "ru"; // Russian is the default language.
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(code: LanguageCode) {
  i18n.changeLanguage(code);
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, code);
  if (typeof document !== "undefined") document.documentElement.lang = code;
}

// Keep <html lang> in sync on load.
if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

export default i18n;
