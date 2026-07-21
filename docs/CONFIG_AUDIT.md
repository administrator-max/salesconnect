# CONFIG_AUDIT.md — hardcoded values → data-driven (Phase 3 prep)

> Read-only audit. Locates every hardcoded enum / dropdown / config value that must move
> into the database so admins manage it in-app **without code changes** (the reframed Phase 3
> goal). The full redesign proposal + migrations come **after the reconciliation** runs.
> Generated: 2026-07-21.

## The target pattern

Two things already work this way and are the model to copy:
- **CIL `companies` / `salespeople`** — Sheets tabs + full CRUD endpoints + frontend fetches them
  and offers inline "add new" → editable by users, zero code change.
- **salespulse `products` / `product_aliases`** — Sheets tabs, admin-editable.

The redesign generalizes this into a **lookup-tab pattern**: every configurable list becomes its
own Sheets tab (`value, label, sort_order, active`, plus optional `icon`/`color`), served by a
generic config API, and every frontend fetches its options at load instead of hardcoding them.
A small **Settings/Admin UI** lets admins add/edit/remove/reorder entries.

## Inventory: what is hardcoded today

### CIL
| Config | Where hardcoded | Values | Proposed source |
|---|---|---|---|
| Communication channels | `cil/assets/js/app.js:32–35` (`CHANNELS`, with icon/bg/color) | whatsapp, offline, phone, zoom | new tab `channels` (value,label,icon,color,sort,active) |
| Complaint priorities | `cil/assets/js/app.js:1504–1508` (`PRIORITIES`, colors) | critical, high, medium, low | new tab `priorities` |
| Complaint statuses | `cil/api.php:107` (`$allowed`), default `open`, auto open→in_progress | open, in_progress, resolved | new tab `complaint_statuses` (value,label,sort,is_default,is_closed) |
| ✅ companies, salespeople | already tabs + CRUD | — | (model) |

### TaskFlow
| Config | Where | Values | Proposed source |
|---|---|---|---|
| Task workflow states | `taskflow/api.php:105` actions | accept / reject / done (+ pending/accepted/…) | tab `task_statuses` for **labels/values**; the transition *rules* stay in code (state machine) |
| ✅ staff | already tab + CRUD | — | (model) |

### costcore
| Config | Where | Values | Proposed source |
|---|---|---|---|
| Costing type | `costcore/api.php:26` (`VALID_TYPE`) | import, domestic | tab `costing_types` |
| WHT rate | `costcore/index.php:265` (`whtRate:.003`) | 0.003 | tab `costcore_settings` (key/value) |
| Default margin tiers | `costcore/index.php:265` (`margins:[A,B,C]`) | A/B/C defaults (already user-addable per costing) | tab `costcore_default_margins` |
| Payment terms | `PAY_OPTS` (costcore) | fixed list | tab `payment_terms` |

### scot
| Config | Where | Values | Proposed source |
|---|---|---|---|
| Cargo type | `scot/assets/{ai,ui,filters}.js`, `index.html` | Import, Domestic | tab `cargo_types` |
| Shipment type | `scot/assets/forms.js` / `index.html` | (fixed list) | tab `shipment_types` |
| Cargo status | forms/index | (fixed list) | tab `cargo_statuses` |
| Shipment status | forms/index | (fixed list) | tab `scot_statuses` |
| Year filter | `scot/assets/index.html:101` (`2025/2026`) | hardcoded years | derive from data (like salespulse) |
| ✅ consignees | already derived from data | — | (model) |

### salespulse
| Config | Where | Values | Proposed source |
|---|---|---|---|
| Months | `executive.html:384–390` | Jan–Dec (0–11) | **keep** — calendar, not config |
| ✅ products, aliases, segments, years | tabs / derived | — | (model) |

## Design questions the proposal will resolve (after reconciliation)

1. **One config store or per-module tabs?** Likely per-module lookup tabs (keeps each spreadsheet
   self-contained), with a shared generic config API in `lib/`.
2. **Generic endpoint** `GET/POST/PUT/DELETE /<module>/api/config/<lookup>` vs. per-lookup routes.
3. **Styling in data** (icon/color for channels/priorities) — store in the tab so UI stays code-free.
4. **Backward-compat / CRUD safety:** existing enum values must be seeded into the new tabs before
   any frontend switches to fetching them; old hardcoded arrays become the seed + fallback.
5. **Admin UI:** one central "Settings" module vs. a config panel inside each tool.
6. **Referential care:** records store enum *values* (e.g. `channel='offline'`); renaming a lookup
   value must not orphan historical rows → edits change label, not the stored value (or cascade).

## Not touched here
- No DB writes. No frontend/API changes yet. This is discovery for the proposal.
