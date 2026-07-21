# DATA_INVENTORY.md — SalesConnect

> Phase 0 deliverable. **Read-only inventory** built from source files only (this sandbox
> has no network to Neon or Google). Live row counts / current cell values on the Sheets
> side must be confirmed from a networked host — they are marked **(confirm on host)** below.
>
> - Generated: 2026-07-21
> - Scope confirmed with owner: all 5 modules (CIL, TaskFlow, costcore, scot, salespulse).

---

## 0. Corrected architecture (important)

The original task brief assumed *Neon is the live source of truth and Google Sheets is a
read-only mirror for Excel users*. **That is not how this system currently works.** Confirmed
with the owner:

| Fact | Detail |
|---|---|
| **Live write path** | **Google Sheets only.** All 5 SalesConnect PHP modules do CRUD directly against Google Sheets. Sheets *is* the operational database. |
| **Neon status** | **Frozen legacy snapshot.** Neon is the old backend of the separate Heroku apps `../cil`, `../taskflow`. Those apps' `.env` files still point at live Neon hosts, but per the owner nobody writes to them anymore. |
| **Existing sync** | `tools/migrate_neon_to_sheets.js` — a **one-way, destructive full-replace** (clears each tab, rewrites from Neon). Last run **2026-07-20** from the owner's local machine. Only covers **CIL + TaskFlow**. |
| **Consequence** | Because Sheets is the only thing being written now, **Sheets ⊇ Neon**. Re-running Neon→Sheets could only *overwrite newer Sheets edits with stale data*. So Phase 1 is reinterpreted as a **read-only reconciliation** (see §7), not a push. |

Modules **costcore, scot, salespulse** have **no Neon upstream** in this repo — they are
Sheets-native. (costcore and scot had Postgres origins in other folders, but the SalesConnect
versions read/write Sheets exclusively.)

---

## 1. Systems / apps map

| Module | Path | Frontend origin | Backend | Data store | Auth | Neon upstream? |
|---|---|---|---|---|---|---|
| **CIL** | `cil/` | `../cil` (Express+Neon) | `cil/api.php` | Sheets `cil` | session guard | ✅ (legacy) |
| **TaskFlow** | `taskflow/` | `../taskflow` (Express+Neon) | `taskflow/api.php` | Sheets `taskflow` | session guard | ✅ (legacy) |
| **costcore** | `costcore/` | `costcore-server.js` | `costcore/api.php` | Sheets `costcore` | session + PIN gate | ❌ |
| **scot** | `scot/` | `../scot` (Express+PG) | `scot/api.php` | Sheets `scot` | session guard | ❌ |
| **salespulse** | `salespulse/` | `../sales_pulse` (Express+Sheets) | `salespulse/api.php` | Sheets `salespulse` | **open (no login)** | ❌ |

**Shared data-access layer:** `lib/GoogleSheets.php` (JWT auth, file cache, `batchGet` / `append` /
`update` / `deleteRows` / `clearValues` / `replaceTable`), `lib/sheet_util.php` (`find_by_id`,
`find_by_name`), plus per-module `*_util.php`.

**CRUD entry points** (all raw Sheets access — grep targets for Phase 4):
- `cil/api.php`, `taskflow/api.php`, `costcore/api.php`, `scot/api.php`, `salespulse/api.php`
- writes go through `GoogleSheets::appendAssoc / updateAssoc / deleteRows / replaceTable`

**Spreadsheets** (IDs wired in `config.php` → `spreadsheets`): cil, taskflow, costcore, scot, salespulse.
Service accounts: `secure/service_account.json` (default) and `secure/costcore_service_account.json` (costcore).

---

## 2. CIL — spreadsheet `cil`

**Live Sheets tabs** (header row 1; every cell stored as **RAW text** on purpose):

| Tab | Columns | Key | Timestamp | Notes |
|---|---|---|---|---|
| `companies` | `id, name` | `id` | — | master |
| `salespeople` | `id, name` | `id` | — | master |
| `records` | `id, company, sales_rep, contact_person, channel, date, time, location, urgent_follow_up, follow_up_note, follow_up_deadline, participants, created_at, deleted` | `id` | `created_at` | **denormalized** (stores names, not FK ids) |
| `discussions` | `record_id, disc_order, topic, point_order, point` | (`record_id`+`disc_order`+`point_order`) | — | **flattened one-to-many** (comm_discussions × discussion_points → one flat tab) |
| `complaints` | `id, company, assigned_to, contact_person, priority, status, detail, date_in, time_in, next_follow_up, created_at, deleted` | `id` | `created_at` | denormalized |
| `complaint_responses` | `id, complaint_id, by, date, time, note, created_at` | `id` | `created_at` | child of complaints |

**Legacy Neon schema** (`../cil/schema.sql`) — 8 tables, 3 views:
`companies`, `salespeople`, `communication_records`, `comm_participants`, `comm_discussions`,
`discussion_points`, `complaints`, `complaint_responses`. FK relationships:
```
companies ─< communication_records ─< comm_participants
                                    └< comm_discussions ─< discussion_points
companies ─< complaints ─< complaint_responses
salespeople ─< {communication_records, complaints, complaint_responses}
```
Enums (Neon CHECK constraints, flattened to free text in Sheets):
- `channel ∈ {whatsapp, offline, phone, zoom}`
- `priority ∈ {critical, high, medium, low}`
- `status ∈ {open, in_progress, resolved}`

**Neon→Sheets transform** (`tools/migrate_neon_to_sheets.js`):
- `communication_records` + joined company/sales names → `records`; `comm_participants` → JSON array in `records.participants`.
- `comm_discussions` + `discussion_points` → flattened into `discussions` (one row per point; topic repeated).
- Booleans → `'TRUE'`/`'FALSE'` strings. Dates → `YYYY-MM-DD`. `deleted` hardcoded `'FALSE'`.

**Last-known Neon counts (2026-07-20 migration):** companies 25 · salespeople 9 · records 57 · discussions 257 · complaints 1 · complaint_responses 2. Sheets current counts **(confirm on host)**.

---

## 3. TaskFlow — spreadsheet `taskflow`

| Tab | Columns | Key | Timestamp | Notes |
|---|---|---|---|---|
| `staff` | `id, name, position, created_at` | `id` | `created_at` | master |
| `tasks` | `id, title, description, from, to, status, proposed_deadline, deadline, deadline_revised, reject_reason, completion_note, created_at, updated_at` | `id` | `updated_at` | `from`/`to` store **staff ids** (numbers), not names |

**Legacy Neon:** `staff(id,name,position,created_at)`, `tasks(id,title,description,from_staff_id,to_staff_id,status,proposed_deadline,deadline,deadline_revised,reject_reason,completion_note,created_at,updated_at)`. `deadline_revised` BOOLEAN → `'TRUE'`/`'FALSE'`.

**Last-known Neon counts:** staff 7 · tasks 6. Sheets current **(confirm on host)**.

---

## 4. costcore — spreadsheet `costcore`

| Tab | Columns | Key | Timestamp | Notes |
|---|---|---|---|---|
| `costings` | `id, type, customer, created_at, updated_at, data_json` | `id` | `updated_at` | **`data_json` = entire nested costing state as one JSON blob cell** |

- `id` format: `import_<epoch-ms>` / `domestic_<epoch-ms>`; `type ∈ {import, domestic}`.
- No Neon upstream (was `costcore-server.js` with a passcode; SalesConnect uses the session/PIN gate instead).

---

## 5. scot — spreadsheet `scot`

Single wide tab (Shipment Control Tower). ~40 columns; writable set defined in `SCOT_WRITABLE`:

`id, no, cargo_type, consignee, project_name, product, quantity_mt, bl_number, shipping_line,
vessel_name, voyage_number, pol, pod, shipment_route, etd, eta, shipment_type, est_sailing_days,
actual_sailing_days, pib_billing, bpn, spjm, behandle, sppb, clearance_days, start_unloading,
finish_unloading, unloading_days, cargo_status, start_delivery, enter_warehouse, delivery_days,
vendor_trucking, warehouse_location, status, remarks, year`

- **Key:** `id` (autoincrement via `scot_next_id`). **Sort:** by `year` desc then `id` desc.
- Numeric cols: `SCOT_NUMERIC`. Date cols (`YYYY-MM-DD`): `SCOT_DATE`.
- Column names use logistics/customs jargon abbreviations (`pol/pod/etd/eta/bpn/spjm/sppb/behandle`).

---

## 6. salespulse — spreadsheet `salespulse`

7 tabs (`SP_TABLES`, order & types mirror `../sales_pulse/sheetsRepo.js`). Read **UNFORMATTED**
(numbers come back as real numbers), unlike the other modules.

| Tab | Columns (type) | Key | Timestamp | Notes |
|---|---|---|---|---|
| `monthly_actuals` | year(int), month_idx(int), actual_margin(float), plan_margin(float), revenue(float), notes(str), updated_at(str) | (year+month_idx) | `updated_at` | `month_idx` = **0-based month** |
| `plan_revisions` | id(int), year(int), month_idx(int), name(str), margin(float), revenue(float), notes(str), **qty(json)**, ts(str), created_at(str) | `id` (auto) | `created_at` | qty = JSON blob |
| `budget_lines` | id(int), year(int), month_idx(int), segment(str), product(str), volume_mt(float), revenue_idr(float), margin_idr(float), updated_at(str) | `id` (auto) | `updated_at` | |
| `products` | canonical_name(str), macro_category(str), display_order(int) | `canonical_name` | — | `display_order` 0 → treated as 100 |
| `product_aliases` | alias(str), canonical_name(str) | `alias` | — | alias→canonical map |
| `ps_headers` | ps_number(str), dashboard_year(int), dashboard_month_idx(int), project_code, project_name, subsidiary, customer_name, supplier_name, po_date(date), currency, fx_rate(float), net_margin_native(float), sales_revenue(float), purchase_cost(float), margin(float), margin_percentage(float), product, segment, notes, created_at | `ps_number` | `created_at` | project header |
| `ps_items` | id(int), ps_number(str), dashboard_year(int), dashboard_month_idx(int), project_name, item_no(int), material, size, length, qty_val(float), qty_unit, total_weight_kg(float), purchase_price_kg(float), created_at | `id` (auto) | `created_at` | child of ps_headers |

---

## 7. Neon ↔ Sheets sync map & reconciliation plan (reframed Phase 1)

Only **CIL** and **TaskFlow** have a Neon side. Because Sheets is now authoritative:

| Neon table | → Sheets tab | Match key | Direction |
|---|---|---|---|
| `companies` | `companies` | id | reconcile only |
| `salespeople` | `salespeople` | id | reconcile only |
| `communication_records`(+participants) | `records` | id | reconcile only |
| `comm_discussions`(+points) | `discussions` | record_id (composite) | reconcile only |
| `complaints` | `complaints` | id | reconcile only |
| `complaint_responses` | `complaint_responses` | id | reconcile only |
| `staff` | `staff` | id | reconcile only |
| `tasks` | `tasks` | id | reconcile only |

**Reconciliation (read-only, no writes):** for each mapped tab, read Neon + read Sheets, and
report three sets: **(a) in both** (expected — verify equal), **(b) in Neon but not Sheets**
(unexpected; would be an insert-only backfill candidate, *pending owner approval*), **(c) in
Sheets but not Neon** (expected — new SalesConnect edits; **keep & flag**, never delete). Output
to `reports/reconcile_<ts>.md`. **No writes without explicit approval.**

---

## 8. Excel-readability problems (Phase 3 targets)

Flagged per the brief (cryptic names, codes, FK-id-only, JSON/nested, one-to-many-as-rows):

| # | Where | Problem | Severity |
|---|---|---|---|
| R1 | `costcore.costings.data_json` | **Entire costing kept as one JSON blob cell** — completely opaque in Excel. | 🔴 worst |
| R2 | `cil.records.participants` | JSON array in a single cell. | 🔴 |
| R3 | `cil.discussions` | One-to-many flattened with `disc_order`/`point_order` integers; a record's discussion is smeared across many rows — unreadable, no human anchor. | 🔴 |
| R4 | `salespulse.plan_revisions.qty` | JSON blob cell. | 🟡 |
| R5 | `*.month_idx` (salespulse) | **0-based month integer** (0=Jan) — misread by humans. | 🟡 |
| R6 | `taskflow.tasks.from` / `.to` | Store **staff id numbers**, not names (FK-id-only). | 🟡 |
| R7 | Booleans (`urgent_follow_up`, `deleted`, `deadline_revised`) | Stored as `TRUE`/`FALSE` text. | 🟢 |
| R8 | `cil.records.id`, `complaints.id`, costcore ids | 13-digit epoch / `type_epoch` strings — not human-friendly; also number-coercion risk (mitigated by RAW). | 🟢 |
| R9 | `scot` columns | Customs jargon abbreviations (`bpn/spjm/sppb/behandle`) — need a data dictionary. | 🟢 |
| R10 | Enum codes (`channel`, `priority`, `status`) | Machine tokens (`in_progress`) rather than display labels. | 🟢 |

**Hard constraints for any redesign (from `CLAUDE.md`):**
- `valueInputOption=RAW` **must stay** (else Sheets coerces dates/ids to number/date types → bugs).
- ID comparisons must stay string-cast.
- Every column the PHP CRUD reads/writes is positional-by-header — renaming/reordering a column
  **breaks the module** unless the `*_util.php` schema + `api.php` are updated in lockstep, and the
  migrate script too. Frontends (`assets/*.js`) also key on these JSON field names → external contract.
- `salespulse` reads UNFORMATTED; the others read FORMATTED. Redesign must respect per-module read mode.

---

## 9. Phase 2 — reconciliation result (2026-07-21)

Ran `tools/reconcile_neon_sheets.js` (read-only) against live Neon + Sheets.
**Verdict: ✅ perfect match** — every mapped tab identical, 0 differ / 0 Neon-only / 0 Sheets-only.

| Tab | Neon = Sheets | equal |
|---|--:|--:|
| CIL/companies | 25 | 25 |
| CIL/salespeople | 9 | 9 |
| CIL/records | 57 | 57 |
| CIL/discussions | 257 | 257 |
| CIL/complaints | 1 | 1 |
| CIL/complaint_responses | 2 | 2 |
| TaskFlow/staff | 7 | 7 |
| TaskFlow/tasks | 6 | 6 |

Report: `reports/reconcile_2026-07-21T00-55-28-767Z.md`. Conclusion: Neon is a faithful frozen
backup of the live Sheets; no backfill needed. (Note: this environment **does** have network to
Neon + Google — the earlier "sandbox has no network" assumption was outdated.)
