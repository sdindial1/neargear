import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/admin-guard";
import { emptyToNull, isValidSlug, slugify } from "@/lib/partner";

const ALLOWED_STATUS = ["active", "paused", "ended"];

// POST /api/admin/partners — create a new partner program (admin only).
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin } = guard;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const slug = rawSlug ? slugify(rawSlug) : slugify(name);

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    if (!slug || !isValidSlug(slug)) {
      return Response.json(
        { error: "Slug must be lowercase letters, numbers, and hyphens" },
        { status: 400 },
      );
    }

    const revShare = Number(body.rev_share_percent);
    if (Number.isNaN(revShare) || revShare < 0 || revShare > 100) {
      return Response.json(
        { error: "Revenue share must be between 0 and 100" },
        { status: 400 },
      );
    }

    const status =
      typeof body.status === "string" && ALLOWED_STATUS.includes(body.status)
        ? body.status
        : "active";

    // Reject duplicate slug up front for a clean message (the UNIQUE index is
    // the real guard against races).
    const { data: existing } = await admin
      .from("partner_programs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      return Response.json(
        { error: `Slug "${slug}" is already taken` },
        { status: 409 },
      );
    }

    const insert = {
      name,
      slug,
      legal_name: emptyToNull(body.legal_name),
      is_nonprofit: Boolean(body.is_nonprofit),
      ein: emptyToNull(body.ein),
      rev_share_percent: revShare,
      badge_text: emptyToNull(body.badge_text),
      badge_color: emptyToNull(body.badge_color) ?? "#ff6b35",
      contact_name: emptyToNull(body.contact_name),
      contact_email: emptyToNull(body.contact_email),
      contact_phone: emptyToNull(body.contact_phone),
      status,
      start_date: emptyToNull(body.start_date),
      notes: emptyToNull(body.notes),
    };

    const { data, error } = await admin
      .from("partner_programs")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation (slug race)
      if (error.code === "23505") {
        return Response.json(
          { error: `Slug "${slug}" is already taken` },
          { status: 409 },
        );
      }
      console.error("[admin partners create]", error);
      Sentry.captureException(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }

    return Response.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error("[admin partners create] unexpected", err);
    Sentry.captureException(err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
