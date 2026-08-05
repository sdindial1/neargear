# Schema Reconciliation

## ✅ COMPLETE — verified 2026-08-05

**A fresh database built from `001` → `019` is now identical to dev.** The
acceptance test is a diff, and it came back empty:

| | Result |
|---|---|
| Migrations applied to an empty database | **19 / 19 clean** |
| IN DEV, NOT IN FILES | **0** |
| IN FILES, NOT IN DEV | **0** |
| DIFFERENT definitions | **0** |
| Inventory rows, both sides | **448** (17 tables · 239 columns · 78 constraints · 54 indexes · 39 policies · 17 RLS · 2 triggers · 2 functions) |
| Postgres version, both sides | **17.6** — so no difference was a version artefact |

The diff compares by object identity, not line text, so every column type,
nullability, default, constraint definition, index definition, policy
expression, RLS toggle, trigger and function matched exactly.

### What closed it

- `008_strikes` and `011_terms_acceptance` applied to dev — they had never run.
- `019_reconciliation` added: drops the four permissive `USING (true)` policies
  that were silently overriding `004`, removes dead objects (`orders.resolved_by`
  and its FK, the superseded `idx_orders_active_dispute`), and aligns
  `refund_initiated_by` to `uuid` with its foreign key.
- `supabase/schema.sql` renamed to `migrations/001_base_schema.sql`, so the
  ordered set is self-describing. This paid off immediately: the migration
  runner had a special case for the old path, and the fix was to delete it.

### Consequences now live on dev

`issueStrike` can finally write. The item-dispute route can set
`meetups.status = 'item_dispute'`. Signup records terms acceptance. The
tightened `004` policies are no longer being overridden.

### Migration 020 (users RLS) — applied 2026-08-05

Added after the acceptance test, so the invariant now covers `001` → `020`.
It was applied to dev **through `apply-to-dev.mjs`**, i.e. the same whole-file
path as `008`/`011`/`019`, so the files and dev stay in step.

Worth recording why: `020` was first hand-pasted into the SQL Editor and
**silently did not apply at all** — no view, no policy change, while the app
code had already been repointed at the view. The whole-file path has now
succeeded 5/5 where hand-pasting has failed 4 times. That is the argument for
item 12 in POST-LAUNCH, stated as evidence rather than principle.

### Still open

- **Prevention** — nothing records which migrations have run. This is the root
  cause and it is tracked as a follow-up in POST-LAUNCH, not a blocker.
- **Class-(d) audit** — columns declared but never *populated*. Invisible to a
  schema diff; needs a code-side pass. `refund_initiated_by` is the known open
  case: aligned but unused, awaiting a keep-or-drop decision.

### How to re-run this check

Tooling lives in `_recon/` (gitignored). With a scratch Supabase project:

```
node run-migrations.mjs       # 001 -> 019 against an EMPTY scratch database
node inventory.mjs            # -> scratch-schema.csv
node inventory.mjs --dev      # -> dev-schema.csv  (read-only)
node diff.mjs                 # -> schema-diff.md
```

`run-migrations.mjs` refuses any connection string containing the dev project
ref. Applying files to dev is a separate script requiring an explicit flag.

---

## The original analysis (kept for context)

Audited **2026-08-03**, during payments Phase 4.

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
| 2026-08-03 | `meetups.item_dispute_reason`, `item_dispute_notes` | minimal unblock for `/admin/disputes` |
| 2026-08-04 | `meetups.no_show_reported_by`, `no_show_reported_at`, `no_show_prompt_sent_at`, `item_dispute_reported_at` | applied to unblock the no-show route for Phase 4 Step 3 testing |
| 2026-08-04 | `018_admin_release.sql` applied in full | a real migration file — does not add drift |

### ⚠️ `008` is now partially applied, and the split is not obvious

Verified 2026-08-04:

| `008` component | State |
|---|---|
| `meetups` — all 6 columns | ✅ **applied** (piecemeal, across two sessions) |
| `users.strike_count`, `suspension_ends_at`, `suspended_permanently` | ❌ **still missing** |
| `strikes.type`, `issued_by`, `notes` | ❌ **still missing** |
| `strikes` legacy `reason NOT NULL` | ❌ still NOT NULL |
| `meetups.status` CHECK gaining `item_dispute` | ⚠️ unverified |

**"Is 008 applied?" has no yes/no answer.** The reconciliation must check it
column by column and must not treat any migration as atomic.

**Live consequence:** `issueStrike()` writes `strikes.type/issued_by/notes` and
`users.strike_count`, none of which exist — so **no strike has ever actually
been issued**, and it fails silently because the insert's error is unchecked.
Phase 4's money paths were verified with strikes silently no-opping alongside
them. The no-show and dispute flows move money correctly; their *reputation*
side effect does nothing.

`011_terms_acceptance` also remains unapplied — signup still records no
evidence of terms acceptance.

Every hand-applied change from here must be added to this table.
