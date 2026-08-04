# [iqdash-aadc-pertek-date] 2026-08-04 — PERTEK AADC 1 Juli 2026; kelima ukuran H1 cocok master

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Sifat:** penulisan DATA (satu cycle). Tidak ada perubahan kode.

## Ringkasan
Satu tanggal diperbaiki, dan selisih terakhir antara dashboard dan master
tertutup. PERTEK Submit #1 AADC: **14/04/2026 → 01/07/2026**, dikonfirmasi
pemilik data.

| KPI H1 2026 | Sebelum | Sesudah | Master |
|---|---|---|---|
| Total Submitted | 74.945 | 74.945 | 74.945 ✓ |
| **SPI / PERTEK Obtained** | 19.860 | **19.710** | **19.710** ✓ |
| Total Utilized | 17.300 | 17.300 | 17.300 ✓ |
| Available Quota | 11.693 | 11.693 | 11.693 ✓ |

Total sepanjang waktu **tidak bergeser** (obtained 34.840 · utilized 22.547 ·
available 12.293) — tanggal hanya menentukan AADC masuk periode yang mana,
bukan jumlahnya.

## Kenapa sempat berputar
Sel PERTEK AADC di master berisi **`1-Jul-16`** (serial Excel 42552 = 1 Juli
**2016**). Jelas salah ketik, tapi salah ketiknya bisa dibaca dua cara, dan
hasilnya berlawanan:

- `1-Jul-**26**` — tahun keliru → PERTEK 1 Juli 2026, **di luar** H1 → 19.710
- `14-Apr-26` — sesuai catatan di baris yang sama → **di dalam** H1 → 19.860

Data dashboard mendukung pembacaan kedua di **tiga tempat** sekaligus (tanggal
rilis cycle, `revNote` *"PERTEK TERBIT 14/04/2026"*, `statusUpdate`
*"14/04/26 PERTEK TERBIT"*), dan pemilik data pada 4 Agustus juga sempat
menyebut 14 April 2026. Karena itu 14/04/2026 sempat dianggap benar.

Setelah pemilik data menegaskan total H1 **19.710** adalah final, tanggal yang
konsisten dengan angka itu hanyalah **1 Juli 2026** — dan itu dikonfirmasi.

**Pelajaran:** ketika sebuah angka total tidak mau cocok, jangan langsung
mengubah ATURAN. Di sini tiga putaran perubahan aturan dicoba (sandaran SPI,
sandaran "semua PERTEK termasuk Perubahan") dan semuanya membuat angka makin
jauh; yang salah ternyata **satu sel tanggal**. Aturan Obtained yang sudah ada
— sandarkan pada PERTEK dari Submit pasangannya — terbukti mereproduksi master
untuk seluruh 34 company.

## Verifikasi
- Obtained H1 dari master (aturan sekarang) = **19.710**; dashboard = **19.710**.
- Per company: **0 selisih**.
- Total sepanjang waktu tidak berubah.

## Sisa
Dua catatan teks pada AADC **masih menyebut 14/04/2026** dan kini bertentangan
dengan tanggal cycle-nya:
- `revNote` = *"PERTEK TERBIT 14/04/2026 — SPI belum terbit"*
- `statusUpdate` = *"14/04/26 PERTEK TERBIT"*

Sengaja **tidak** diubah — keduanya teks naratif milik tim, bukan field
perhitungan, dan tidak memengaruhi angka mana pun. Sebaiknya tetap dirapikan
agar tidak menyesatkan pembaca drawer.

Di file master, sel `1-Jul-16` sebaiknya dibetulkan jadi `1-Jul-26`.
