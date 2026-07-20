# Migrasi data Neon → Google Sheets

Script: `tools/migrate_neon_to_sheets.js`

Script ini **membuat tab + header** di kedua spreadsheet, lalu **menyalin semua data**
dari dua database Neon (CIL & TaskFlow) ke Google Sheets, sambil mengubah bentuk
relasional Neon menjadi bentuk datar yang dipakai aplikasi PHP.

> **Kalau kamu migrasi, kamu TIDAK perlu `setup.php`** — script ini sudah membuat
> tab-nya sekaligus. `setup.php` hanya untuk mulai kosong tanpa data Neon.

---

## Kenapa harus dijalankan di komputermu (bukan di Cowork)

Sandbox Cowork tidak punya akses jaringan ke Neon **maupun** Google (DNS-nya diblok).
Jadi migrasi harus dijalankan di mesin yang jaringannya terbuka — komputermu sendiri,
tempat folder `project_dashboard` lengkap berada.

---

## Langkah

**1. Prasyarat**
- Node.js **≥ 18** (cek: `node -v`)
- Kedua spreadsheet sudah di-**Share** ke `salesconnect@eagle1-492706.iam.gserviceaccount.com` sebagai **Editor**
- File `salesconnect/secure/service_account.json` ada

**2. Install driver Postgres** (sekali saja)
```bash
cd project_dashboard/salesconnect
npm install pg
```

**3. Jalankan**
```bash
node tools/migrate_neon_to_sheets.js
```

Script otomatis membaca kredensial Neon dari `../cil/.env` dan `../taskflow/.env`
(kamu tidak perlu menyalin password ke mana pun), dan kunci Google dari
`secure/service_account.json`.

**4. Output yang diharapkan**
```
Service account: salesconnect@eagle1-492706.iam.gserviceaccount.com
Google auth OK

── CIL ──
CIL: connected to Neon
  ✓ companies: 11 row(s)
  ✓ salespeople: 8 row(s)
  ✓ records: N row(s)
  ✓ discussions: M row(s)
  ✓ complaints: K row(s)
  ✓ complaint_responses: J row(s)

── TaskFlow ──
TaskFlow: connected to Neon
  ✓ staff: 7 row(s)
  ✓ tasks: T row(s)

✅ Migration complete.
```

**5. Verifikasi**
- Buka kedua Google Sheet → cek tab & isinya.
- Buka SalesConnect → login → cek CIL & TaskFlow menampilkan data yang sama.

---

## Apa yang ditransformasi

| Neon (relasional) | → | Google Sheets (datar) |
|---|---|---|
| `company_id`, `sales_rep_id` (FK angka) | → | disimpan sebagai **nama** di kolom `company` / `sales_rep` |
| `comm_participants` (banyak baris) | → | 1 sel `participants` berisi **JSON array** |
| `comm_discussions` + `discussion_points` (2 tabel) | → | 1 tab `discussions` datar: `record_id, disc_order, topic, point_order, point` |
| `complaint_responses` | → | tab `complaint_responses` (nama responder di kolom `by`) |
| tanggal/jam | → | teks `YYYY-MM-DD` / `HH:MM` (via `to_char`, anti masalah timezone) |

Kolom `deleted` diisi `FALSE` untuk semua baris (dipakai soft-delete di aplikasi bila diaktifkan).

---

## Catatan & keamanan

- **Idempotent tapi mengganti**: tiap tab di-`clear` lalu ditulis ulang. Aman dijalankan berkali-kali; setiap run = salinan terbaru dari Neon. Jangan jalankan setelah tim mulai input di Sheets, karena input baru di Sheets akan tertimpa data Neon.
- **Angka ID CIL** (record/complaint) dipertahankan apa adanya sebagai teks.
- Script hanya **membaca** Neon (SELECT), tidak mengubah Neon.
- Jangan commit `secure/service_account.json`, `.env`, atau `node_modules/` ke Git.

---

## Opsional: bikin terasa "realtime"

Google Sheets bersifat *pull* — perubahan orang lain baru terlihat saat halaman
memuat ulang. Yang sudah aku setel: cache baca server = **10 detik** (`config.php → cache_ttl`),
jadi reload menampilkan data maksimal 10 detik lama.

Untuk UI yang auto-update tanpa reload manual, perlu **polling** di frontend
(fetch ulang tiap ~10–15 detik). Ini belum aktif — bisa aku tambahkan kalau kamu mau.
Realtime instan (push) tidak mungkin di stack Sheets + shared hosting.
