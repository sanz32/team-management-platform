"use client";

interface Entry {
  data: unknown;
  at: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_TTL_MS = 30_000;

export function readCache<T>(url: string): { data: T; ageMs: number } | null {
  const entry = store.get(url);
  if (!entry) return null;
  return { data: entry.data as T, ageMs: Date.now() - entry.at };
}

export function writeCache(url: string, data: unknown): void {
  store.set(url, { data, at: Date.now() });
}

export function invalidateCache(prefix: string): void {
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clearCache(): void {
  store.clear();
  inflight.clear();
}

let cacheOwner: string | null = null;

export function setCacheOwner(next: string | null): void {
  if (cacheOwner === next) return;
  clearCache();
  cacheOwner = next;
}

export function getCacheOwner(): string | null {
  return cacheOwner;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const existing = inflight.get(url);
  if (existing) return (await existing) as T | null;

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  })();

  inflight.set(url, promise);
  try {
    const data = await promise;
    if (data !== null) writeCache(url, data);
    return data;
  } finally {
    inflight.delete(url);
  }
}

export interface CachedJsonOptions<T> {
  ttlMs?: number;
  onRevalidated?: (data: T) => void;
  force?: boolean;
}

export async function cachedJson<T>(url: string, options: CachedJsonOptions<T> = {}): Promise<T | null> {
  const { ttlMs = DEFAULT_TTL_MS, onRevalidated, force } = options;

  if (force) {
    invalidateCache(url);
    return fetchJson<T>(url);
  }

  const cached = readCache<T>(url);
  if (!cached) return fetchJson<T>(url);

  if (cached.ageMs < ttlMs) return cached.data;

  void fetchJson<T>(url)
    .then((fresh) => {
      if (fresh !== null && onRevalidated && !sameJson(fresh, cached.data)) {
        onRevalidated(fresh);
      }
    })
    .catch(() => {});

  return cached.data;
}

export function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
