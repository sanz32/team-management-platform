"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { BOOST_LANG_STORAGE_KEY, boostCopy, isBoostLang, type BoostCopy, type BoostLang } from "@/lib/boost-i18n";

const listeners = new Set<() => void>();

let cached: BoostLang | null = null;

function readStoredLang(): BoostLang {
  try {
    const saved = window.localStorage.getItem(BOOST_LANG_STORAGE_KEY);
    if (isBoostLang(saved)) return saved;
  } catch {
  }
  return "en";
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== BOOST_LANG_STORAGE_KEY) return;
    cached = null;
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): BoostLang {
  if (cached === null) cached = readStoredLang();
  return cached;
}

function getServerSnapshot(): BoostLang {
  return "en";
}

interface BoostLangApi {
  lang: BoostLang;
  setLang: (lang: BoostLang) => void;
  t: BoostCopy;
}

const BoostLangContext = createContext<BoostLangApi | null>(null);

export function useBoostLang(): BoostLangApi {
  const ctx = useContext(BoostLangContext);
  if (!ctx) throw new Error("useBoostLang debe usarse dentro de <BoostLangProvider>");
  return ctx;
}

export default function BoostLangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLang = useCallback((next: BoostLang) => {
    cached = next;
    try {
      window.localStorage.setItem(BOOST_LANG_STORAGE_KEY, next);
    } catch {
    }
    listeners.forEach((l) => l());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "es";
    };
  }, [lang]);

  const value = useMemo<BoostLangApi>(() => ({ lang, setLang, t: boostCopy(lang) }), [lang, setLang]);

  return <BoostLangContext.Provider value={value}>{children}</BoostLangContext.Provider>;
}
