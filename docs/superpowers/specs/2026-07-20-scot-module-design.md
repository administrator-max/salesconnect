# SCOT Module (Shipment Control Tower) — Design Spec

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan
**Scope:** Port the standalone `scot` app (Node/Express + Google Sheets) into a SalesConnect PHP module at `salesconnect/scot/`, reusing the existing frontend and the existing Google Spreadsheet.

---

## 1. Overview

`scot` is a Shipment Control Tower: a vanilla-JS SPA over ~13 REST endpoints, backed by Google Sheets (already migrated off Postgres on 2026-07-17). We re-implement its backend as a PHP REST API following the SalesConnect module pattern (shared `lib/GoogleSheets.php`), reuse the frontend almost as-is, and deploy via the existing GitHub→FTP CI.

### Decisions (locked)
- **Start with scot** (sales_pulse is a separate, later spec).
- **Access: OPEN** — no login gate (same as CIL/TaskFlow). `index.php` does NOT include `guard.php`.
- **Reuse the existing spreadsheet** `1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM` (tabs `shipments`, `documents` already populated). No data migration.
- **SSE → polling**: drop `GET /api/stream`; frontend refetches `/api/shipments` every **15 s**.
- **OCR via Gemini only** (user has no Claude key): synchronous HTTP call, no tesseract/poppler. Key in `config.php`.
- **Excel import/export** stays client-side (SheetJS CDN) — no backend work.
- Landing card: **🚢 Shipment Control Tower** → `scot/`.

---

## 2. Module layout

```
salesconnect/scot/
├── index.php        # serves the SPA shell (converted from public/index.html); NO login guard
├── api.php          # REST backend → Google Sheets (this spec's core)
├── .htaccess        # rewrite api/* → api.php?_route=... (copy of taskflow/.htaccess)
└── assets/
    ├── main.js ui.js forms.js state.js filters.js alerts.js ai.js   # reused, minimal edits
    ├── style.css
    └── assets/…     # images/fonts from scot public/assets
```

Landing `index.php` (root) gains a 4th card linking to `scot/`.

---

## 3. Data model (reused spreadsheet)

Spreadsheet ID configured as `spreadsheets['scot']`. Two tabs, header row 1 is the contract.

- **`shipments`** — 39 columns A→AM, exact order:
  `id, no, cargo_type, consignee, project_name, product, quantity_mt, bl_number, shipping_line, vessel_name, voyage_number, pol, pod, shipment_route, etd, eta, shipment_type, est_sailing_days, actual_sailing_days, pib_billing, bpn, spjm, behandle, sppb, clearance_days, start_unloading, finish_unloading, unloading_days, cargo_status, start_delivery, enter_warehouse, delivery_days, vendor_trucking, warehouse_location, status, remarks, year, created_at, updated_at`
- **`documents`** — 6 columns: `id, shipment_id, doc_type, file_name, storage_url, uploaded_at`

### Coercion rules (must match exactly, in api.php shaping)
- **Numeric fields** → JSON numbers: `id, no, quantity_mt, est_sailing_days, actual_sailing_days, clearance_days, unloading_days, delivery_days, year`.
- **Date fields** → `YYYY-MM-DD` strings (sliced to 10 chars): `etd, eta, pib_billing, bpn, spjm, behandle, sppb, start_unloading, finish_unloading, start_delivery, enter_warehouse`.
- Empty cell → `null` in output.
- **Write input**: empty string `''` → `null`/blank cell. All cells written `valueInputOption=RAW` (already the lib default).
- **Sort (GET response)**: `year DESC (nulls last), then id DESC`.
- **Input whitelist** (POST/PUT/bulk) — only these 35 columns writable; `id/created_at/updated_at` server-managed; anything else dropped:
  `no, cargo_type, consignee, project_name, product, quantity_mt, bl_number, shipping_line, vessel_name, voyage_number, pol, pod, shipment_route, etd, eta, shipment_type, est_sailing_days, actual_sailing_days, pib_billing, bpn, spjm, behandle, sppb, clearance_days, start_unloading, finish_unloading, unloading_days, cargo_status, start_delivery, enter_warehouse, delivery_days, vendor_trucking, warehouse_location, status, remarks, year`.

---

## 4. REST API contract (`scot/api.php`)

Routes relative to `/scot/api/` (via `.htaccess` `?_route=`). JSON responses; error shape `{error: "message"}` with proper status.

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `shipments` | Full array, shaped + sorted year/id DESC. |
| POST | `shipments` | Sanitize→whitelist; assign `id`/`no` = max+1 (under lock); set `created_at`/`updated_at`; append; return created row. |
| PUT | `shipments/:id` | Partial merge (whitelisted); bump `updated_at`; update row; 404 if missing. |
| DELETE | `shipments/:id` | Delete row; `{success:true}`; 404 if missing. |
| POST | `shipments/bulk` | `{updates:[{id,data}], inserts:[{...}]}` → apply under one lock; `{success:true, inserted, updated}`. |
| POST | `shipments/:id/documents` | `{storage_url, doc_type, file_name}` → append doc (id=max+1); return row. |
| GET | `shipments/:id/documents` | Array for shipment, sorted `uploaded_at` DESC. |
| GET | `documents/:docId` | **302 redirect** to `storage_url`; 404 if missing. |
| DELETE | `documents/:docId` | Delete; `{success:true}`; 404 if missing. |
| POST | `ocr` | multipart `file` → **synchronous** Gemini call; write result to cache keyed by `jobId`; return `202 {jobId, status:"processing"}` (kept for frontend compat; result already stored). |
| GET | `ocr/:jobId` | Read cached result: `{status:"done", method, source, fields, confidence, textPreview}` or `{status:"error", error}`; 404 if expired. |
| GET | `health` (or root) | `{ok:true, source:"google-sheets"}`; 503 on Sheets failure. |

**Dropped:** `GET /api/stream` (SSE). No server-push; frontend polls.

---

## 5. Concurrency & IDs

PHP-FPM has no cross-request in-memory mutex. To prevent interleaved writes and duplicate `max+1` IDs:
- Wrap every **write path** (POST/PUT/DELETE/bulk/document writes) in an exclusive **`flock`** on a lock file in `cache/` (e.g. `cache/scot.lock`).
- Compute `id`/`no` (shipments) and `id` (documents) as `max(existing)+1` **inside** the lock, immediately before append.
- Reads are unlocked (served through the existing short-TTL file cache).

Accepted residual risk: lock is per-server (fine for single shared host). Documented in the module log.

---

## 6. OCR (Gemini, synchronous)

- `POST scot/api/ocr`: accept one file (PDF/PNG/JPEG/WebP/TIFF, ≤ ~12 MB inline limit). Base64-encode, POST to `generativelanguage.googleapis.com` (`gemini-2.5-flash` default) with a structured-extraction prompt returning the whitelisted OCR field keys + confidence.
- Runs **synchronously** within the request; result cached to a file keyed by a generated `jobId` (short TTL, ~10 min). Response still `202 {jobId}` so the existing `forms.js` submit→poll flow is unchanged; the subsequent `GET ocr/:jobId` returns the stored result.
- Config: `gemini_api_key`, optional `gemini_model`. If key missing → OCR endpoint returns `{status:"error", error:"OCR not configured"}` gracefully; the rest of the app works.
- No local tesseract/poppler; large files or Gemini errors → clean error, no crash. PHP `max_execution_time` risk noted (tune if needed).

---

## 7. Frontend reuse & edits

Reuse `public/*` from scot with **surgical** edits only:
1. **API base**: change absolute `/api/...` → relative `api/...` across the JS (so paths resolve under `/scot/`), mirroring the CIL conversion.
2. **Remove SSE**: delete the `new EventSource('/api/stream')` block in `main.js`; add `setInterval(fetchShipments, 15000)` (pause while a modal/edit is open, matching existing "defer refetch during modal" behaviour).
3. Everything else (8 tabs, client-side analytics/alerts/AI-chat, Excel import/export via SheetJS CDN, Flatpickr) unchanged.

`index.php` = the original `index.html` body, served by PHP (no login guard), with asset paths pointed at the module's `assets/`.

---

## 8. Config, prerequisites, deploy

- **`config.php`** additions: `spreadsheets['scot'] => '1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM'`, `gemini_api_key => '...'`, optional `gemini_model`. (`config.sample.php` updated with placeholders; real values not committed.)
- **Prerequisite (manual):** share the scot spreadsheet as **Editor** with `salesconnect@eagle1-492706.iam.gserviceaccount.com` (else 403).
- **`.git-ftp-ignore`/`.gitignore`**: unaffected (module code deploys; docs/logs excluded from FTP).
- **Deploy**: commit + push to `main` → existing GitHub Actions git-ftp workflow uploads to Niagahoster automatically.
- **Changelog**: add `logs/add-scot-module_2026-07-20_log.md` per project rule.

---

## 9. Verification

- PHP lint (`php -l`) all new files.
- Local/host smoke test once the sheet is shared: `GET /scot/api/shipments` returns JSON array; create→update→delete a test shipment; add/list/redirect/delete a document; OCR a sample PDF (if key set); confirm 15s polling refresh; confirm Excel import/export.
- Confirm JSON field names/types/sort match the original exactly (frontend renders unchanged).

---

## 10. Risks / notes

- **Sheets rate limit** (~60 read/min/user): mitigated by existing file cache (`cache_ttl`). 15s polling × concurrent users can add up — watch quota; raise `cache_ttl` if needed.
- **No transactions**: multi-tab writes (none here beyond single-tab) and `flock` scope is single-host.
- **OCR timeout** for large files under PHP `max_execution_time`.
- **Out of scope:** sales_pulse (separate spec), any auth, real-time push, server-side Excel parsing.
