# Cost Core module in SalesConnect — Design (2026-07-09)

## Goal
Add cost_core as a THIRD module in the SalesConnect PHP Tools Centre (next to CIL & TaskFlow),
backed by Google Sheets, behind the single SalesConnect login. Run locally + verify in
Claude-in-Chrome BEFORE deploying to Niagahoster.

## Source of truth
Port the ALREADY-Sheets-backed version in `../costcore_html` (not the Neon version):
- Frontend: `costcore_html/index.html` (single file, does all costing math + Excel/PDF client-side).
- Node API (`costcore-server.js`) defines the contract we mirror in PHP.
- Sheet `1yDWF5Q3YarCWqvXGCXY0lSk0kCdP-6VrqiL2FfvD3rU`, tab `costings`:
  columns id | type | customer | created_at | updated_at | data_json  (whole costing = JSON in data_json).
  Already holds 60 rows -> NO migration.
- Its own service account `costcore@eagle1-492706.iam.gserviceaccount.com`.

## Decisions (approved)
- Single login: strip Cost Core passcode (1984) + shared-secret + bearer; rely on SalesConnect session guard.
- Use Cost Core's own service account (sheet already shared to it) -> no manual Google step.
- Scope = Sheets version: costing calc + CRUD + client Excel/PDF. NO roles, NO Drive export.
- costcore_html standalone stays; both hit the same sheet.

## Files
NEW:
- costcore/index.php  = adapted index.html, prepended with guard.php
- costcore/api.php    = REST backend (session-guarded) -> costcore sheet
- costcore/.htaccess  = rewrite api/(.*) -> api.php?_route=$1 (copy of cil/.htaccess)
- secure/costcore_service_account.json  (web-blocked, gitignored)
CHANGED:
- lib/GoogleSheets.php : constructor accepts optional service-account path (default = config main SA). Backward-compatible.
- config.php : add spreadsheets['costcore'] + 'costcore_service_account' path.
- router.dev.php : add 'costcore' to the api-rewrite regex (local test only).
- index.php (landing) : add "Cost Core" card linking costcore/.

## API (mirror, session-guarded; routes relative to costcore/api/)
- GET  costings/{import|domestic}     -> list [{id,customer,created_at}] desc by created_at
- GET  costings/load/{id}             -> parsed data_json object (404 if missing)
- POST costings {type,customer,data}  -> {id}  (id = `${type}_${ms}`)
- PUT  costings/{id} {customer,data}  -> {success}
- DELETE costings/{id}                -> {success}
id regex ^(import|domestic)_\d+$. Uses find_by_id + updateAssoc/deleteRows/appendAssoc (surgical, not rewrite-all).

## Frontend adaptation (costcore/index.php)
Replace the runner/auth block (lines ~205-256) with:
- API_BASE="." (page at /costcore/ -> "./api/..."), apiHeaders -> Content-Type only (no x-cc-key/bearer).
- Boot straight to app on DOMContentLoaded: showApp(); render(). No passcode screen.
- showLock() -> redirect to ../logout.php; header "Lock" button (line 488) -> showLock() (drop AUTH ref).
Cookies flow automatically (same-origin fetch). Session expiry -> API 401 (user reloads -> guard -> login).

## Inherits
Same GoogleSheets class -> automatic 429/503 retry+backoff.

## Verify
Local (PHP 8.3 + router.dev.php): login SalesConnect -> Cost Core CRUD roundtrip (create/list/load/update/delete), self-cleaning.
Then Claude-in-Chrome visual check. Then FTP deploy new files + config/lib/GoogleSheets + landing, verify live.
