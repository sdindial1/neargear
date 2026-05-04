export const ACTIVE_PROFILE_STORAGE_KEY = "neargear:active_profile";

export type ActiveProfile = "primary" | "spouse";

export interface ActiveProfileUser {
  full_name: string | null;
  spouse_name?: string | null;
  spouse_phone?: string | null;
  phone?: string | null;
  active_profile?: ActiveProfile | string | null;
}

export function getActiveProfile(
  user: ActiveProfileUser | null | undefined,
): ActiveProfile {
  if (!user) return "primary";
  return user.active_profile === "spouse" ? "spouse" : "primary";
}

export function getActiveName(
  user: ActiveProfileUser | null | undefined,
): string {
  if (!user) return "";
  if (getActiveProfile(user) === "spouse" && user.spouse_name) {
    return user.spouse_name;
  }
  return user.full_name ?? "";
}

export function getActivePhone(
  user: ActiveProfileUser | null | undefined,
): string | null {
  if (!user) return null;
  if (getActiveProfile(user) === "spouse" && user.spouse_phone) {
    return user.spouse_phone;
  }
  return user.phone ?? null;
}

export function readActiveProfileFromStorage(): ActiveProfile | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  return v === "spouse" || v === "primary" ? v : null;
}

export function writeActiveProfileToStorage(profile: ActiveProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profile);
}
