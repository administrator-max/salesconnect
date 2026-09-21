# SCOT — shipment aktif yang belum dijadwalkan tidak lagi hilang saat difilter

**Tanggal:** 2026-09-21
**Modul:** SCOT (Shipment Control Tower)

## Ringkasan

Laporan tim: "active shipment tidak muncul, sudah di-refresh".

Datanya ternyata sehat (30 shipment aktif, semua valid), API tidak di-cache, dan
tab In Progress menampilkan ke-30-nya. Penyebabnya ada di **filter periode**:
**17 dari 30 shipment aktif belum punya tanggal sama sekali** (tidak ada ETD, ETA,
maupun Start Delivery) — semua 12 Contract + 5 On Going (Fine Steel #02,
Transcoal Minergy #01, SUMEC 2, Arsen SSP #50, Sumec 1A).

Filter periode mencocokkan shipment lewat `eta || etd || start_delivery`. Tanpa
tanggal, shipment itu tidak cocok dengan periode mana pun, jadi **hilang begitu
tim memilih bulan, tahun, atau rentang tanggal**. Contoh nyata dengan data live,
Executive Summary filter **Sep 2026**:

| | Sebelum | Sesudah |
|---|---|---|
| Contract | **0** | 12 |
| On Going | 13 | 18 |

## Aturan baru

Shipment **aktif** (status bukan `Done`) yang **belum dijadwalkan** dianggap
**berjalan sejak diinput (`created_at`) sampai hari ini**, dan muncul di setiap
periode yang beririsan dengan rentang itu.

- Sep 2026 → ke-17-nya muncul.
- Aug 2026 → hanya yang sudah diinput sebelum 31 Agustus (7 shipment).
- 2025 → tidak ada.

Kenapa bukan "muncul di SEMUA periode": Contract yang baru diinput 16 September
akan ikut terhitung di laporan Juni atau 2025, padahal saat itu shipment tersebut
belum ada. Kenapa bukan "hanya periode yang memuat hari ini": Contract yang sudah
menunggu sejak Agustus memang aktif di Agustus, jadi harus terlihat saat tim
melihat ke belakang.

Shipment `Done` tanpa tanggal **tidak** diubah — tetap tidak masuk periode mana pun,
karena itu data historis, bukan pekerjaan yang sedang jalan.

**Shipment yang punya tanggal memakai aturan lama persis.** Tidak ada satu pun
angka shipment bertanggal yang berubah.

## Perubahan

1. **`state.js`** — satu definisi untuk semua layar: `refDate()`,
   `isUnscheduled()`, `unscheduledStart()`, `unscheduledOverlaps()`.
2. **`filters.js`** — `fpRange()` menerjemahkan periode terpilih jadi
   `[from, to]`. `getFp()` menilai shipment belum dijadwalkan lewat irisan rentang
   hidupnya; shipment bertanggal tetap lewat logika lama. Berlaku untuk
   Executive Summary, Analytics, dan Consignee Detail (ketiganya memakai `getFp`).
3. **`ui.js` — `rConsSummary()`** — ringkasan Consignee punya pilihan tahun/bulan
   sendiri (tidak lewat `getFp`), jadi aturan yang sama dipasang di sana juga,
   termasuk kombinasi "bulan tertentu di tahun mana pun".
4. **Penanda "📅 Belum dijadwalkan"** di kartu shipment (In Progress) dan di baris
   popup detail KPI.
5. **Catatan kuning di Executive Summary**: "N shipment aktif belum dijadwalkan —
   tetap dihitung di setiap periode, sejak diinput sampai hari ini". Bisa diklik →
   daftar shipment-nya → klik satu → langsung ke editor untuk mengisi ETD/ETA.
   Catatan hanya muncul kalau ada yang belum dijadwalkan di periode itu.
6. **`style.css`** — `.us-badge`, `.us-note`. **`index.html`** — elemen `#exec-note`.

## File yang disentuh

- `scot/assets/state.js`, `scot/assets/filters.js`, `scot/assets/ui.js`
- `scot/assets/index.html`, `scot/assets/style.css`

Tidak ada perubahan backend maupun spreadsheet.

## Verifikasi

Tampilan SCOT asli dijalankan lokal dengan **213 baris data live** (dibaca dari
spreadsheet produksi, baca-saja), 7 periode diuji di Executive Summary. Untuk tiap
periode, jumlah shipment bertanggal dihitung ulang dengan **implementasi aturan lama
yang ditulis terpisah**, lalu dibandingkan:

| Periode | Total | Bertanggal (aturan lama) | Belum dijadwalkan | Cocok |
|---|---|---|---|---|
| All Time | 213 | 196 | 17 | ✅ |
| Sep 2026 | 43 | 26 | 17 | ✅ |
| Aug 2026 | 20 | 13 | 7 | ✅ |
| Jun 2026 | 20 | 19 | 1 | ✅ |
| 2026 | 124 | 107 | 17 | ✅ |
| 2025 | 89 | 89 | 0 | ✅ |
| 1–15 Sep | 21 | 14 | 7 | ✅ |

- Ringkasan Consignee memberi total yang sama dengan Executive Summary untuk
  Sep 2026 (43), Aug 2026 (20), dan 2025 (89).
- 17 kartu di In Progress bertanda "Belum dijadwalkan"; tidak ada satu pun di
  Completed.
- Catatan kuning → popup 17 baris → klik baris → editor terbuka.
- `node --check` lolos; tidak ada error console.

## Sisa / risiko

- **Angka KPI per periode berubah** (naik) untuk periode yang memuat shipment
  belum dijadwalkan. Itu memang tujuannya, tapi siapa pun yang membandingkan
  dengan laporan lama akan melihat selisih — catatan kuning menjelaskannya.
- `created_at` disimpan dalam UTC, jadi shipment yang diinput antara 00:00–07:00
  WIB tercatat di tanggal sebelumnya. Hanya berpengaruh di tepi periode.
- Kartu Contract masih menampilkan "✓ On Time" (perilaku lama: penanda tepat
  waktu muncul untuk semua status selain On Going). Tidak diubah di sini.
- Perbaikan sesungguhnya tetap di data: 5 shipment On Going di atas seharusnya
  sudah punya ETD/ETA.
