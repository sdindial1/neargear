<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Migration order

**Additive** (new table, new nullable column, new index, loosened policy): apply the migration BEFORE the code that reads it.

**Removes, renames or restricts anything** (DROP COLUMN/TABLE/VIEW/FUNCTION, RENAME, a type change, a tightened policy or constraint): apply it WITH or AFTER the code that stops using it. Never before. Confirm that code is LIVE in production first. A merged PR isn't enough.

Getting this backwards fails silently. Migration 037 dropped `giveaway_events` columns while the deployed route still wrote them. Every insert returned 500, and the `/giveaway` funnel recorded nothing for 20 days of paid traffic. Migration 026 documents the same trap from the policy side.

Apply migrations through `_recon/apply-to-dev.mjs`, never the SQL editor. That script refuses any file that removes a name deployed `origin/main` code still references. Check without touching the database: `node _recon/apply-to-dev.mjs --check-only --files=<file.sql>`.
