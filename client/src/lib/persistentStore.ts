/**
 * A tiny localStorage-backed store that works with React's `useSyncExternalStore`.
 * Snapshots are cached per raw string so repeated reads return the same reference (required to
 * avoid render loops). If storage is blocked it degrades to an in-memory store for the session.
 */
export interface PersistentStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
  getServerSnapshot(): T;
  set(updater: (current: T) => T): void;
}

export function createPersistentStore<T>(key: string, seed: () => T, isValid: (value: unknown) => value is T): PersistentStore<T> {
  const listeners = new Set<() => void>();
  const initial = seed();
  let memory: T = initial;
  let cached: { raw: string | null; value: T } | null = null;

  function read(): T {
    if (typeof window === "undefined") return initial;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return memory; // storage blocked
    }
    if (cached && cached.raw === raw) return cached.value;
    let value: T;
    if (raw === null) {
      value = memory;
    } else {
      try {
        const parsed: unknown = JSON.parse(raw);
        value = isValid(parsed) ? parsed : memory;
      } catch {
        value = memory;
      }
    }
    cached = { raw, value };
    return value;
  }

  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) emit();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => initial,
    set(updater) {
      const next = updater(read());
      memory = next;
      try {
        const raw = JSON.stringify(next);
        window.localStorage.setItem(key, raw);
        cached = { raw, value: next };
      } catch {
        cached = null; // fall back to the in-memory copy
      }
      emit();
    },
  };
}
