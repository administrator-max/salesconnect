# DATA_DICTIONARY.md — SalesConnect (for Excel readers)

> Plain-language description of the Google-Sheets tabs, for people who work in Excel.
> Full technical schemas live in `docs/DATA_INVENTORY.md`. This file focuses on the new
> **data-driven config tabs** (the `cfg_*` tabs admins manage in-app) plus a readable pass
> over the operational tabs.
> Updated: 2026-07-21.

## How config works now (read this first)

Dropdown options and lookup lists are **no longer hardcoded** — they live in `cfg_*` tabs and
are edited in-app via each module's **⚙ Settings** button. Add/rename/disable an option there and
it appears everywhere instantly, with **no code change**.

Rules for every `cfg_*` tab:
- **`value`** — the stored code. It is what records reference. **Do not change it** once used
  (renaming would orphan old records). To retire an option, set **`active` = FALSE** (it hides
  from dropdowns but old records still read correctly). You may edit labels/colors freely.
- **`sort_order`** — display order (small number = first).
- **`active`** — `TRUE` shows the option; `FALSE` hides it (soft-delete). Blank counts as active.
- Colours are hex (e.g. `#e8f5e9`); `color` = background, `color2` = text.

You can also edit these tabs directly in Google Sheets if you prefer — same effect.

## CIL config tabs (spreadsheet: cil)

| Tab | Columns | Meaning |
|---|---|---|
| `cfg_channels` | value, label, icon, color, color2, sort_order, active | Communication channels in the "Log Communication" form. Seeded: whatsapp, offline, phone, zoom. |
| `cfg_priorities` | value, label, color, color2, sort_order, active | Complaint priority levels. Seeded: critical, high, medium, low. |
| `cfg_complaint_statuses` | value, label, color, color2, sort_order, is_default, is_closed, active | Complaint statuses. `is_default` = status a new complaint starts at; `is_closed` = counts as resolved. Seeded: open, in_progress, resolved. |

## costcore config tabs (spreadsheet: costcore)

| Tab | Columns | Meaning |
|---|---|---|
| `cfg_payment_terms` | value, sort_order, active | Payment-term options in the costing form. `value` is the full term text (e.g. "NET 30 Days"). 9 seeded. |
| `cfg_hedging_days` | value, sort_order, active | Hedging-days options (60 / 90 / 150). |
| `cfg_shipment_types` | value, label, sort_order, active | Import shipment type. **value is calc-bound** (breakbulk / container20 / container40) — relabel only. |
| `cfg_margin_types` | value, label, sort_order, active | Margin type. **value calc-bound** (fixed / percent) — relabel only. |
| `cfg_commission_units` | value, label, sort_order, active | Commission unit. **value calc-bound** (idr / usd) — relabel only. |

### costcore is column-based (no JSON blob)

After the cutover migration, Cost Core stores each costing in **real columns across three tabs**
(the app reads/writes these directly — no `data_json`):

| Tab | Columns | Meaning |
|---|---|---|
| `costings` | id, type, customer, created_at, updated_at, ship_type, kurs, import_duty, wht, port_charges, hedge_rate, hedge_days, destination, is_pipa, stripping, add_cost, commission, comm_unit, margin_type, margin, pay_terms, wht_rate, truck_cost, truck_from, truck_to | One row per costing = the header/parameters. Import- vs domestic-only fields are blank when N/A. **This is the source of truth** (editable). |
| `costings_items` | costing_id, type, item_no, name, qty, cif, qty_kg, buy_price, margin_idx, remark | One row per line item (source). Import uses qty/cif; domestic uses qty_kg/buy_price/margin_idx. |
| `costings_margins` | costing_id, margin_no, name, val | Domestic margin tiers (A/B/C…); items point to them by `margin_idx` = `margin_no`. |

Editing these in the app writes straight to the columns. (Until the cutover migration runs, existing
rows still carry a legacy `data_json` cell that the code reads as a fallback.)

## scot config tabs (spreadsheet: scot)

| Tab | Columns | Meaning |
|---|---|---|
| `cfg_cargo_types` | value, sort_order, active | Import / Domestic. |
| `cfg_shipment_types` | value, sort_order, active | Breakbulk / Container. |
| `cfg_shipment_routes` | value, sort_order, active | Direct / Transit. |
| `cfg_cargo_statuses` | value, sort_order, active | Direct / Via Warehouse / Storage. |
| `cfg_statuses` | value, sort_order, active | Shipment status: Contract / Booked / On Going / Done. |
| `cfg_document_types` | value, label, sort_order, active | Document link type (BL / PIB / Surat Jalan / Other). |

*(TaskFlow has no config tab: its task states are a fixed workflow, and its only dropdown —
assignee — is already driven by the `staff` tab. salespulse was already data-driven via
`products` / `product_aliases`.)*

## Operational data tabs (quick reference — full schema in DATA_INVENTORY.md)

**CIL** — `companies` (id, name) · `salespeople` (id, name) · `records` (a communication log;
stores company/sales **names**, channel, date/time, participants) · `discussions` (topics & points
per record) · `complaints` · `complaint_responses`.
**TaskFlow** — `staff` (id, name, position) · `tasks` (title, from/to staff id, status, deadlines).
**costcore** — `costings` (one saved costing per row; the full costing is stored in `data_json`).
**scot** — `shipments` (one shipment per row, ~40 columns) · `documents`.
**salespulse** — `monthly_actuals`, `plan_revisions`, `budget_lines`, `products`,
`product_aliases`, `ps_headers`, `ps_items`, `Summary`.

## Relationships (for Excel users)

- CIL `records.company` / `complaints.company` hold the company **name** — matches `companies.name`.
- CIL `records.channel` holds a `cfg_channels.value`; `complaints.priority` → `cfg_priorities.value`;
  `complaints.status` → `cfg_complaint_statuses.value`.
- scot `shipments.cargo_type` → `cfg_cargo_types.value`, `.status` → `cfg_statuses.value`, etc.
- TaskFlow `tasks.from` / `.to` hold `staff.id` numbers.
