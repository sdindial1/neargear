const KEY = "neargear:wishlist";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function write(set: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
}

export function isSavedLocal(listingId: string): boolean {
  return read().has(listingId);
}

export function toggleSavedLocal(listingId: string): boolean {
  const set = read();
  const next = !set.has(listingId);
  if (next) set.add(listingId);
  else set.delete(listingId);
  write(set);
  return next;
}
