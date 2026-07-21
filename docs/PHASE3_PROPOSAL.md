# PHASE3_PROPOSAL.md — data-driven, admin-manageable config

> Goal: move every hardcoded enum/dropdown/config into the Google-Sheets DB so admins add/edit/
> remove them **in-app, no code changes**, with changes reflected everywhere — while every module's
> CRUD keeps working. Reconciliation (Phase 2) is ✅ done; Neon==Sheets. Nothing applied yet.

## Design (decisions made)

**1. Per-module lookup tabs.** Each configurable list becomes its own tab in that module's existing
spreadsheet (keeps each self-contained; mirrors how `companies`/`salespeople`/`products` already work).

**2. Lookup tab schema** (RAW text, header row 1):
```
value | label | sort_order | active            (+ icon | color where the UI is styled)
```
- `value` = the immutable code stored in records (e.g. `offline`). Never changes via UI.
- `label` = free-editable display text. `sort_order` = display order. `active` = TRUE/FALSE (soft-delete).

**3. Config layer** `lib/config_util.php` (+ `GoogleSheets`): read a lookup tab → normalized array,
cached like other reads. One helper, reused by all modules.

**4. Config API** (session-guarded; writes require admin):
- `GET  /<module>/api/config`                    → all lookups for that module, one payload (frontend calls once at load)
- `POST /<module>/api/config/<lookup>`           → add `{value,label,sort_order,icon?,color?}`
- `PUT  /<module>/api/config/<lookup>/<value>`   → edit label/sort/active/style (never the value)
- `DELETE /<module>/api/config/<lookup>/<value>` → **soft** (active=FALSE) so historical rows still resolve

**5. Frontends** fetch `api/config` at load and render dropdowns from it. The current hardcoded arrays
stay as a **fallback** if the fetch fails → zero-downtime rollout, no way for CRUD to break.

**6. Admin UI:** a "Settings" panel per module — a simple table per lookup with add / edit / toggle-active
/ reorder. Consistent markup across modules.

**7. Referential safety:** editing a label never touches stored `value`; delete is soft; changing a
`value` is disallowed in the UI (would orphan historical records).

## What becomes data-driven (seeded from today's hardcoded values → identical behavior day 1)

| Module | New lookup tabs | Seeded from |
|---|---|---|
| CIL | `channels`, `priorities`, `complaint_statuses` | `app.js` CHANNELS/PRIORITIES, `api.php` `$allowed` |
| TaskFlow | `task_statuses` (labels only; transition rules stay in code) | `api.php` actions |
| costcore | `costing_types`, `payment_terms`, `costcore_settings`(key/value: wht_rate), `default_margins` | `api.php` VALID_TYPE, `index.php` D defaults/PAY_OPTS |
| scot | `cargo_types`, `shipment_types`, `cargo_statuses`, `scot_statuses` | `forms.js`/`index.html` options |
| scot | year filter → **derived from data** (not a tab) | replaces hardcoded 2025/2026 |
| salespulse | (already data-driven — no change) | products/aliases/segments/years |

## Rollout — least destructive, staged

1. **Backup first.** Snapshot all 5 spreadsheets before any write: Drive API `files.copy` into a
   backup folder **and** export each tab's current values to `backups/<ts>/`. (Changes are purely
   *additive* — new tabs only, existing tabs/data untouched — so rollback = delete the added tabs.)
2. **Pilot CIL end-to-end**, verify live: create the 3 tabs seeded, add config API + Settings UI,
   switch the CIL frontend to fetch config (with fallback). Test: add a channel in Settings → it
   appears in the record form; existing records still render; add/edit/delete a lookup works.
3. **Replicate** the proven pattern to TaskFlow, costcore, scot.
4. **Cleanup pass** (separate, later): once every module is verified, remove the now-dead hardcoded
   arrays. Kept until then for safety.

## Testing
- `php -l` on all touched files; unit tests for `config_util` (parse/normalize, soft-delete, fallback).
- Per-module smoke: `GET api/config` shape; config CRUD; dropdown renders from DB; historical rows resolve.
- Re-run `tools/reconcile_neon_sheets.js` after (must still be ✅; config tabs are new, not in Neon map).

## Rollback
Delete the added tabs (existing data never modified) → frontends auto-fall-back to hardcoded arrays.
Restore from `backups/<ts>/` or the Drive copy if ever needed.

## Risk assessment
- **Low.** Additive-only structural change; hardcoded fallbacks; soft-delete; per-module isolation;
  Neon + Drive copy + local export as three independent backups. No existing tab is modified or reordered.
