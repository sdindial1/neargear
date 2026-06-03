/**
 * Partner Programs — shared helpers (Phase 1).
 */

import type { PartnerStatus, PartnerPayoutStatus } from "@/types/database";

/**
 * Turn a free-text name into a URL-safe slug.
 * "Dragon Youth Baseball" -> "dragon-youth-baseball" (then editable to "dyb").
 * Lowercase, alphanumeric + single hyphens, trimmed of leading/trailing hyphens.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True when a slug is well-formed (lowercase alphanumeric + internal hyphens). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Trim a string and coerce empty/non-string to null (for nullable DB columns). */
export function emptyToNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Format integer cents as USD, e.g. 2400 -> "$24.00". */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export const PARTNER_STATUSES: PartnerStatus[] = ["active", "paused", "ended"];

export const PARTNER_STATUS_BADGE: Record<
  PartnerStatus,
  { label: string; className: string }
> = {
  active: { label: "Active", className: "bg-green-100 text-green-800" },
  paused: { label: "Paused", className: "bg-amber-100 text-amber-800" },
  ended: { label: "Ended", className: "bg-gray-200 text-gray-600" },
};

export const PAYOUT_STATUS_BADGE: Record<
  PartnerPayoutStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  reversed: { label: "Reversed", className: "bg-red-100 text-red-700" },
};

/** Sort order for the list page: active first, then paused, then ended. */
export const STATUS_SORT_RANK: Record<PartnerStatus, number> = {
  active: 0,
  paused: 1,
  ended: 2,
};
