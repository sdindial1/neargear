# Schema Reconciliation — MUST COMPLETE BEFORE PRODUCTION DEPLOY

**Status: not started. This is the #1 pre-deploy blocker (POST-LAUNCH item 1).**

A fresh production database built from the current migration files would **not**
match the dev database the code was developed and tested against. The failure
mode is a 500 on a payment or dispute route at runtime — not a build error that
would stop the deploy.

Last audited: **2026-08-03**, during payments Phase 4.

---

## 1. The drift map

### 1a. Migration files that were NEVER applied to dev

| File | Missing from dev | What it breaks |
|---|---|---|
| **`008_strikes.sql`** | 12 columns (below) | no-show route, item-dispute route, `issueStrike`, suspensions, `/banned`, `/admin/disputes` |
| **`011_terms_acceptance.sql`** | `users.terms_accepted_at`, `users.terms_version` | signup records **no evidence of terms acceptance** — a legal-evidence gap for a payments product, not just a bug |

`008`'s missing columns:

- `meetups`: `no_show_reported_by`, `no_show_reported_at`, `no_show_prompt_sent_at`,
  `item_dispute_reported_at`, `item_dispute_reason`, `item_dispute_notes`
- `users`: `strike_count`, `suspension_ends_at`, `suspended_permanently`
- `strikes`: `type`, `issued_by`, `notes`

**Why `008` kept being skipped:** line 9 is
`DROP TABLE IF EXISTS strikes CASCADE;` — a destructive statement inside an
otherwise additive migration. A migration nobody wants to run is a migration
that silently does not run. The reconciliation must rewrite it as purely
additive: add the three columns and `ALTER COLUMN reason DROP NOT NULL`
(the legacy column current code never writes, whose `NOT NULL` would fail
every insert).

### 1b. Columns in the dev DB backed by NO migration file

Found on `orders` during Phase 4:

| Column | Resolution |
|---|---|
| `refund_id` | renamed to `stripe_refund_id` by `017` |
| `refund_amount_cents` | declared in `017`; now populated by `refundOrder` |
| `refund_initiated_by` | declared in `017`; **still unused — decide keep or drop** |

⚠️ **Only `orders` has been audited for orphan columns.** `meetups`, `users`,
`listings`, `messages`, `notifications`, `reports`, `transactions`, `strikes`,
`founding_spots`, `waitlist`, and the three `partner_*` tables have **not**
been checked. Assume more orphans exist until proven otherwise.

### 1c. Naming mismatches

| Live DB | Code | Resolved |
|---|---|---|
| `orders.refund_id` | `stripe_refund_id` | ✅ `017` renames it — one concept, one column, matching the table's other Stripe ids |

### 1d. A third class: declared but never populated

Invisible to a schema diff — the column exists and matches its file, and sits
null forever.

| Column | Was | Fixed |
|---|---|---|
| `orders.stripe_charge_id` | declared in `016`, never written by the checkout webhook | ✅ webhook now stores it; `releaseOrder` prefers it; existing rows backfilled |

**No systematic audit of this class has been done.** It requires a code-side
pass, not a schema comparison.

### 1e. Not verifiable by the method used so far

Column-existence probes with a service-role key cannot see these:

| Item | Why it matters |
|---|---|
| **`004_proper_rls.sql`** | Service role bypasses RLS, so policy drift is invisible. This is the one migration where a mismatch is a **security** problem rather than a crash. |
| **CHECK constraints generally** | Columns can exist while their constraints differ. `018_admin_release` is in this category — unconfirmed. |

---

## 2. The plan

1. **Capture the truth.** Dump the live dev schema:
   `pg_dump --schema-only --no-owner --no-privileges` (or Supabase →
   Database → Schema). This is the target, because it is what the code was
   built and tested against.
2. **Build a control.** Run `001` → `018` in order against a scratch database.
3. **Diff.** Every difference is one of: a file never applied, an orphan column,
   a constraint mismatch, or a policy mismatch.
4. **Audit the reverse direction, in code.** For every table, grep the codebase
   for columns it reads or writes, and confirm each is (i) declared in a file
   and (ii) actually populated by the code that owns it. This is the only way
   to catch class 1d.
5. **Resolve each difference explicitly:**
   - Rewrite `008` as additive (no `DROP TABLE`).
   - Fold orphan columns into a reconciliation migration, or drop them.
   - Decide `refund_initiated_by`: wire it up or remove it. Not "leave it".
   - Compare `pg_policies` against `004` and reconcile.
6. **Renumber or consolidate** the file set if that produces a cleaner history.
   The goal is a set that applies cleanly to an empty database end to end, with
   no human deciding to skip a step.

---

## 3. Verification — the acceptance test

**A fresh database plus the ordered file set must equal the dev schema exactly.**
Not "looks right" — diffed.

```bash
# 1. target
pg_dump --schema-only --no-owner --no-privileges "$DEV_URL"     > /tmp/dev.sql

# 2. control
createdb scratch
for f in supabase/migrations/0*.sql; do psql "$SCRATCH_URL" -f "$f" || exit 1; done
pg_dump --schema-only --no-owner --no-privileges "$SCRATCH_URL" > /tmp/scratch.sql

# 3. must be empty
diff /tmp/dev.sql /tmp/scratch.sql
```

Also compare policies explicitly, since `pg_dump` ordering can mask them:

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

Run against both and diff.

**Done means:** the diff is empty, every migration applies to an empty database
in order without manual intervention, and the app boots against the scratch DB.

---

## 4. Prevention

The root cause is that migrations are applied by hand-pasting into the Supabase
SQL Editor, with **nothing recording which have run**. `008` was skipped in
roughly April and surfaced in August, four phases later, only because the
release sweep needed one of its columns.

Adopt one of:

- a `schema_migrations` table each file writes to as its final statement, or
- the Supabase CLI with `supabase db push` / `supabase migration list`.

Either makes an unapplied file visible immediately instead of four phases later.

---

## 5. Known additions to capture

Applied by hand and therefore **not yet reflected in any file's applied state**:

| Date | What | Note |
|---|---|---|
| 2026-08-03 | `orders`: 6 columns applied ad hoc before `017` existed | now declared in `017` |
| 2026-08-03 | `meetups.item_dispute_reason`, `item_dispute_notes` | minimal unblock for `/admin/disputes`; **declared in `008`, which remains otherwise unapplied** — this deepens the partial-application of `008` and the reconciliation must not assume `008` is all-or-nothing |

Every hand-applied change from here must be added to this table.
