# IQ Dash — Obtained & utilisasi per produk untuk company dua tahun (2026 + 2027)

**Tanggal:** 2026-10-09
**Modul:** IQ Dash (Import Quota Monitor) — klien + server

## Ringkasan

Disetujui tim: siapkan input Obtained per produk untuk PT yang memegang kuota 2026
dan 2027 sekaligus (EMS), sebelum PERTEK 2027 terbit. Sekalian dikoreksi data EMS
2027: produk kedua GL ALLOY 4.000 (bukan GI ALLOY).

## Temuan yang dibereskan

1. **Server menghitung utilisasi stats dari SEMUA lot company** (baca: ledger +
   sinkron utilisasi; tulis: recompute dari lot). Lot 2027 akan menaikkan
   utilisasi 2026. Disimulasikan: lot 2027 GL 500 MT → EMS 2026 2.100 → 2.600
   (kode lama), tetap 2.100 (kode baru).
2. **"Catat Terbit" (record-obtained)** menambah MT ke company_product_stats
   (milik tahun pertama → Available 2026 naik) dan MENGGANTI seluruh produk siklus
   tiap panggilan per produk (dua produk → hanya yang terakhir tersisa).
3. **Form utama mematok "Submit #1"/"Obtained #1"** — di irisan 2027 siklusnya
   Submit #4, sehingga tanggal PERTEK & Obtained 2027 tidak tersimpan ke mana pun.
4. **Nomor siklus berikutnya dihitung dari irisan** (rrObtainedTypeFor,
   nsCycleType, raCycleType) — bisa memakai ulang nomor milik tahun lain, yang
   lalu didedup server.
5. Simpan Obtained/ETA per produk untuk company dua tahun ditolak seluruhnya.

## Perubahan

- `iqdash_data.php` — `IQ_TAHUN_BAWAAN`, `iq_tahun_baris()`, `iq_tahun_primer()`,
  `iq_dengan_data_tahun_primer()`: ledger & sinkron utilisasi hanya melihat lot /
  utilCycles tahun pertama; payload tetap membawa semua lot.
- `iqdash_write.php` — recompute utilisasi stats dari lot hanya memakai lot tahun
  pertama.
- `16-storage.js` — irisan tahun lain: _obtainedStats/_etaWrite tidak dikirim
  (angka per produk tahun itu dari siklus/lot); tahun pertama tetap dikirim.
- `13-rev-mgmt.js` — saveEdit: siklus "pertama" company dua tahun = siklus pertama
  di tahun itu; Obtained pasangannya dibuat bila belum ada (Submit #4 →
  Obtained #4, quotaYear tahun tampil). Catat Terbit tahun lain menulis siklus
  langsung dengan semua produk (tanpa record-obtained). Nomor siklus dari siklus
  semua tahun.
- `index.html` — versi 13-rev-mgmt & 16-storage dinaikkan.
- `tools/ems_2027_gi_jadi_gl_2026-10-09.php` — koreksi EMS 2027 (diterapkan,
  backup di backups/).

## Verifikasi

- Payload server dibangun ulang: 41 company identik sebelum/sesudah (belum ada lot
  2027 ber-MT).
- Simulasi server lot 2027: utilisasi 2026 tidak berubah, lot tetap terkirim.
- E2E pratinjau (PATCH dicegat): CorpSec 2027 isi PERTEK 01/11/2026 + Obtained SP
  1.000 + GL 2.000 → Submit #4 bertanggal, Obtained #4 bertahun 2027; muat ulang →
  2027 Obtained 3.000 / Available 3.000; Sales lot GL 500 → Utilized 500 /
  Available 2.500 / Pending 500. Total 2026 identik sebelum & sesudah; kolom &
  utilisasi 2026 EMS utuh; tidak ada POST record-obtained.
- 51 uji `.cjs` lulus; uji PHP gagal identik di kode lama & baru (router butuh
  login, ledger mematok Agustus).
