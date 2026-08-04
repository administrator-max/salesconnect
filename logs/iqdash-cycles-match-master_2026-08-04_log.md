# [iqdash-cycles-match-master] 2026-08-04 — MIN/SMS + rapikan `cycles` agar cocok master (Langkah 1)

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Sifat:** penulisan DATA ke Google Sheets. Tidak ada perubahan kode.
- **Konteks:** langkah 1 dari rencana 5 langkah menghapus penyebab
  "dashboard selalu tidak sama dengan master, harus diperbaiki manual".

## Ringkasan
Dua koreksi yang diputuskan pemilik data, lalu perapian tab `cycles` sehingga
obtained yang dihitung **dari cycles** cocok dengan master per company.

Sesudahnya keempat KPI cocok master **persis**:

| | live | master |
|---|---|---|
| Submitted | 277.545 | 277.545 |
| Obtained | 34.840 | 34.840 |
| Utilized | 22.547 | 22.547 |
| Available | 12.293 | 12.293 |

## 1. Koreksi dari pemilik data
- **MIN** utilisasi **250 → 247** (ikut master; realisasi PIB 246,704).
  Available otomatis 353. `company_product_stats` ikut dihitung ulang oleh
  endpoint, jadi stats sekarang juga 247/353.
- **SMS** lot GI ALLOY Lot 1: ETA JKT diisi **18/09/2026**. Ini lot terakhir
  yang ber-MT tanpa tanggal.
- **MIN Obtained #2 / revisi 353 MT**: diputuskan **tidak diubah**.

## 2. Kenapa `cycles` perlu dirapikan
`canonicalObtained()` (dipakai saat TANPA filter) mengembalikan nilai **ledger**
apa adanya, sedangkan `canonicalObtainedFiltered()` (dipakai saat DIFILTER)
menghitung dari **cycles**. Dua sumber, tak pernah dicocokkan — begitu filter
periode dinyalakan, angkanya berpindah sumber. Inilah sebab keluhan
"hasil filter tidak sama dengan hitungan dari master".

Sebelum perapian: 8 company punya cycles ≠ ledger, dan **di semua kasus ledger
yang cocok master** — total dari cycles 34.340 vs master 34.840.

## 3. Yang diperbaiki (9 company)

**a. Pencatatan ulang revisi yang terhitung dua kali — cycle dihapus.**
Ketiganya dikonfirmasi pemilik data sebagai revisi (realokasi net-nol), bukan
kuota baru:

| Company | Cycle dihapus | Yang sebenarnya terjadi (master) |
|---|---|---|
| BDG | Obtained #2 1.000 | Revision −650 → GL BORON, −350 → GI BORON |
| SPA | Obtained #2 515 | Revision −401 BORDES → +401 GI BORON (sisa 114 BORDES) |
| SMS | Obtained #2 150 | Revision −150 SHEETPILE → +150 GI BORON, terpakai habis |

**b. `from_rev_req` keliru `TRUE`** pada Obtained #2 yang sebenarnya kuota asli
(master menghitungnya): **ADP, BHG, HKG, JKT, MSN** → di-set `false`.

**c. JKT Obtained #2 `mt` 2.700 → 100.** 2.700 adalah angka Submit #2 yang
tersalin ke baris Obtained. Master: Obtained #2 = 100.

**d. GNG Obtained #3 = 200 MT ditambahkan** (GL BORON, Submit MOT 06/07/2026,
SPI Perubahan 2 22/07/2026). Ada di master, belum pernah masuk sistem —
**terlewat pada backfill 2026-08-03** karena pekerjaan itu dibatasi pada cycle
*Submit* saja. Ledger menutupinya sehingga audit kemarin tetap tampak bersih.

## Verifikasi
- Company dengan cycles ≠ ledger: **8 → 1**.
- Setiap company yang disentuh mendarat **tepat** di angka ledger/master.
- Audit master vs live: **0 selisih** untuk 34 company × 4 ukuran.
- `cycles` 142 → 140 baris (−3 hapus, +1 tambah); tidak ada company lain
  kehilangan cycle.
- **PHP 345 assertion, 0 gagal; 5 suite JS, 0 gagal.**
- Ingat: harness `ok()` tetap exit 0 walau ada FAIL — hitung baris `FAIL`.

## Sisa / risiko
- **GKL Obtained #2 (600 MT) — satu-satunya cycles ≠ master yang tersisa.**
  Master menghitungnya (PERTEK Perubahan terbit 31-Jul-26) tapi SPI-nya masih
  TBA, sedangkan `_isObtainedTerbit()` mensyaratkan tanggal pada cycle Obtained
  itu sendiri. **Sengaja tidak ditambal di sini** — akan hilang sendiri di
  langkah 3 saat sandaran periode Obtain dikembalikan ke PERTEK sesuai
  definisi pemilik data. Menambal sekarang berarti menulis tanggal yang tidak
  ada di master.
- MIN Obtained #2 (600 MT) tetap tanpa tanggal — sesuai keputusan pemilik data.
- Selisih cycle yang tersisa semuanya 0 MT (AMP, CGK, GAS, MJU, SMS revision).

## Langkah berikutnya (belum dikerjakan)
2. **Migrasi `Utilization (date)`** dari master ke lot per produk. Prasyarat
   mutlak: master punya tanggal utilisasi untuk ~30 company, tapi di sistem
   tanggal itu tidak punya tempat yang terisi — utilisasi tersimpan sebagai
   agregat tanpa tanggal di `company_product_stats`, dan hanya 8 lot yang
   punya MT utilisasi sama sekali. Tanpa ini, Utilized **tidak bisa** difilter.
3. **Samakan definisi filter** dengan spesifikasi pemilik data:
   Submit → Submit MOI/Perubahan · **Obtain → PERTEK/PERTEK Perubahan**
   (sekarang keliru bersandar pada SPI) · Utilized → Utilization (date) ·
   **Realized → `realizations.volume` per tanggal PIB** (sekarang keliru
   memakai `ra_records.berat` per tanggal kedatangan) · Available → Obtain −
   Utilized.
   Catatan: alasan kode dulu pindah dari PERTEK ke SPI adalah "PERTEK sering
   berisi NOMOR, bukan tanggal" — 20 cycle itu sudah diperbaiki 2026-08-03,
   jadi penghalangnya sudah tidak ada.
4. **Cabut pintasan ledger** di `canonicalObtained()` supaya All Time dan
   terfilter memakai rumus yang sama. Hanya boleh setelah langkah 1–3 selesai.
5. **Tes penjaga** yang membandingkan kelima ukuran dashboard dengan hitungan
   langsung dari master untuk beberapa periode.
