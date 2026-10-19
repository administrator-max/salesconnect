# Insiden — seluruh SalesConnect error 500 (upload versi lama ke server)

**Tanggal:** 2026-10-19
**Modul:** semua (lib/, CIL, TaskFlow, Cost Core, Sales Pulse, SCOT)

## Gejala

Semua halaman ber-login (`/`, `login.php`, `diag.php`, IQ Dash, API) → HTTP 500.
File statis normal. `/cil/` dan `/taskflow/` justru tampil TANPA login.

## Penyebab

Pukul **14:04** (waktu server) seseorang mengupload salinan LAMA (± Juli 2026) ke
server — bukan lewat `deploy.sh`, repo tidak berubah sejak 09-Okt. Tertimpa:
`lib/*` (mis. `auth.php` 1.271 byte vs 23.576), `cil`, `taskflow`, `costcore`,
`salespulse`, `scot`; `lib/costcore_gate.php` (dihapus 26-Agu) muncul lagi.
`auth.php` lama tidak punya fungsi yang dipanggil `tool_guard.php` → fatal di setiap
halaman ber-login; `cil/index.php` & `taskflow/index.php` lama belum berpenjaga →
terbuka tanpa login. IQ Dash, CRM Projects, file root, `config.php` tidak tersentuh.

## Pemulihan

`./deploy.sh lib cil taskflow costcore salespulse scot` dari commit 310417e (versi
yang berjalan sampai 14:04) — 61 file, 0 gagal. Disetujui pengguna.

## Verifikasi

Semua halaman → 302 ke login; `login.php` 200; API IQ Dash/CIL/TaskFlow → 401;
ukuran `lib/*` di server = repo.

## Tindak lanjut

- Cari siapa yang mengupload 14:04 dan dari mana (zip `salesconnect_*_deploy.zip`
  bertanggal Juli ada di folder repo — kandidat kuat).
- `lib/costcore_gate.php` usang masih di server (tidak dipakai) — hapus bila disetujui.
- Deploy HANYA lewat `./deploy.sh` dari repo; jangan upload folder/zip manual.
