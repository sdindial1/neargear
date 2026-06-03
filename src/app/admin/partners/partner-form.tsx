"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { slugify } from "@/lib/partner";
import type { PartnerProgram, PartnerStatus } from "@/types/database";

const STATUSES: PartnerStatus[] = ["active", "paused", "ended"];

export interface PartnerFormValues {
  name: string;
  slug: string;
  legal_name: string;
  is_nonprofit: boolean;
  ein: string;
  rev_share_percent: string;
  badge_text: string;
  badge_color: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: PartnerStatus;
  start_date: string;
  notes: string;
}

function fromProgram(p: PartnerProgram): PartnerFormValues {
  return {
    name: p.name ?? "",
    slug: p.slug ?? "",
    legal_name: p.legal_name ?? "",
    is_nonprofit: Boolean(p.is_nonprofit),
    ein: p.ein ?? "",
    rev_share_percent: String(p.rev_share_percent ?? 30),
    badge_text: p.badge_text ?? "",
    badge_color: p.badge_color ?? "#ff6b35",
    contact_name: p.contact_name ?? "",
    contact_email: p.contact_email ?? "",
    contact_phone: p.contact_phone ?? "",
    status: (p.status as PartnerStatus) ?? "active",
    start_date: p.start_date ?? "",
    notes: p.notes ?? "",
  };
}

const EMPTY: PartnerFormValues = {
  name: "",
  slug: "",
  legal_name: "",
  is_nonprofit: false,
  ein: "",
  rev_share_percent: "30",
  badge_text: "",
  badge_color: "#ff6b35",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  status: "active",
  start_date: "",
  notes: "",
};

interface Props {
  mode: "create" | "edit";
  partner?: PartnerProgram;
}

export function PartnerForm({ mode, partner }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PartnerFormValues>(
    mode === "edit" && partner ? fromProgram(partner) : EMPTY,
  );
  // In create mode, keep slug auto-synced to the name until the admin edits it.
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PartnerFormValues>(
    key: K,
    value: PartnerFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const onNameChange = (name: string) => {
    setValues((v) => ({
      ...v,
      name,
      slug: slugTouched ? v.slug : slugify(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (mode === "create" && !values.slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    setSaving(true);

    const payload = {
      name: values.name.trim(),
      // Slug is immutable after creation — only send it on create.
      ...(mode === "create" ? { slug: values.slug.trim() } : {}),
      legal_name: values.legal_name,
      is_nonprofit: values.is_nonprofit,
      ein: values.is_nonprofit ? values.ein : "",
      rev_share_percent: Number(values.rev_share_percent),
      badge_text: values.badge_text,
      badge_color: values.badge_color,
      contact_name: values.contact_name,
      contact_email: values.contact_email,
      contact_phone: values.contact_phone,
      status: values.status,
      start_date: values.start_date,
      notes: values.notes,
    };

    const url =
      mode === "create"
        ? "/api/admin/partners"
        : `/api/admin/partners/${partner!.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "Could not save partner");
        setSaving(false);
        return;
      }
      toast.success(mode === "create" ? "Partner created" : "Partner updated");
      const id = mode === "create" ? data.id : partner!.id;
      router.push(`/admin/partners/${id}`);
      router.refresh();
    } catch {
      toast.error("Network error — please try again");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section title="Identity">
        <Field label="Name" required htmlFor="name">
          <Input
            id="name"
            value={values.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Dragon Youth Baseball"
            required
          />
        </Field>
        <Field
          label="Slug"
          required
          htmlFor="slug"
          hint={
            mode === "edit"
              ? "Slug can't be changed — it's baked into referral links."
              : "Lowercase letters, numbers, and hyphens. Auto-filled from the name; shorten it (e.g. “dyb”)."
          }
        >
          <Input
            id="slug"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
            placeholder="dyb"
            readOnly={mode === "edit"}
            className={mode === "edit" ? "bg-muted text-muted-foreground" : ""}
            required={mode === "create"}
          />
        </Field>
        <Field label="Legal name" htmlFor="legal_name">
          <Input
            id="legal_name"
            value={values.legal_name}
            onChange={(e) => set("legal_name", e.target.value)}
            placeholder="Southlake Baseball Association"
          />
        </Field>
        <div className="flex items-center gap-2">
          <input
            id="is_nonprofit"
            type="checkbox"
            checked={values.is_nonprofit}
            onChange={(e) => set("is_nonprofit", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-orange focus:ring-orange"
          />
          <Label htmlFor="is_nonprofit" className="cursor-pointer">
            This partner is a nonprofit
          </Label>
        </div>
        {values.is_nonprofit && (
          <Field label="EIN" htmlFor="ein" hint="Leave blank until provided.">
            <Input
              id="ein"
              value={values.ein}
              onChange={(e) => set("ein", e.target.value)}
              placeholder="12-3456789"
            />
          </Field>
        )}
      </Section>

      <Section title="Revenue share">
        <Field
          label="Revenue share percent"
          required
          htmlFor="rev_share_percent"
          hint="% of NearGear platform revenue. For DYB: 30% means 30% of NearGear's 8% platform fee goes to the league — equivalent to 2.4% of the gross sale. Founding-family members pay 0% fees, so they generate no partner attribution."
        >
          <div className="flex items-center gap-2">
            <Input
              id="rev_share_percent"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={values.rev_share_percent}
              onChange={(e) => set("rev_share_percent", e.target.value)}
              className="max-w-32"
              required
            />
            <span className="text-sm text-muted-foreground">
              % of platform fees
            </span>
          </div>
        </Field>
      </Section>

      <Section title="Badge">
        <Field
          label="Badge text"
          htmlFor="badge_text"
          hint="Shows on members' profiles, e.g. “DYB Member”."
        >
          <Input
            id="badge_text"
            value={values.badge_text}
            onChange={(e) => set("badge_text", e.target.value)}
            placeholder="DYB Member"
          />
        </Field>
        <Field label="Badge color" htmlFor="badge_color">
          <div className="flex items-center gap-3">
            <input
              id="badge_color"
              type="color"
              value={values.badge_color}
              onChange={(e) => set("badge_color", e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-input bg-transparent p-1"
            />
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: values.badge_color }}
            >
              {values.badge_text || "Badge preview"}
            </span>
          </div>
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Contact name" htmlFor="contact_name">
          <Input
            id="contact_name"
            value={values.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
            placeholder="Jeff Israel"
          />
        </Field>
        <Field label="Contact email" htmlFor="contact_email">
          <Input
            id="contact_email"
            type="email"
            value={values.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
            placeholder="jeff@example.com"
          />
        </Field>
        <Field label="Contact phone" htmlFor="contact_phone">
          <Input
            id="contact_phone"
            value={values.contact_phone}
            onChange={(e) => set("contact_phone", e.target.value)}
            placeholder="(817) 555-0100"
          />
        </Field>
      </Section>

      <Section title="Status & dates">
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            value={values.status}
            onChange={(e) => set("status", e.target.value as PartnerStatus)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date" htmlFor="start_date">
          <Input
            id="start_date"
            type="date"
            value={values.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="Internal notes" htmlFor="notes">
          <Textarea
            id="notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={4}
            placeholder="Board approval pending, etc."
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving} className="btn-primary">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === "create" ? "Create partner" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-orange">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
