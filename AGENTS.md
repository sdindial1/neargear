<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migration order

**Additive** (new table, new nullable column, new index, loosened policy): apply the migration BEFORE the code that reads it.

**Removes, renames or restricts anything** (DROP COLUMN/TABLE/VIEW/FUNCTION, RENAME, a type change, a tightened policy or constraint): apply it WITH or AFTER the code that stops using it. Never before. Confirm that code is LIVE in production first. A merged PR isn't enough.

Getting this backwards fails silently. Migration 037 dropped `giveaway_events` columns while the deployed route still wrote them. Every insert returned 500, and the `/giveaway` funnel recorded nothing for 20 days of paid traffic. Migration 026 documents the same trap from the policy side.

Before applying ANY migration, run `npm run check:migrations -- <file.sql>`. It is version-controlled and needs only git, no database. It exits 1 if the file drops or renames a name that deployed `origin/main` code still references. Pass `--removal-reviewed=<file.sql>` only after confirming the code that stops using the name is live. Never apply migrations through the Supabase SQL editor, which skips this check. The local `_recon/apply-to-dev.mjs` runs the same versioned check automatically.
