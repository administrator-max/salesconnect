# New Submission — jalan masuk untuk perusahaan tanpa historical data

**Tanggal:** 2026-08-14
**Permintaan:** tim Sales, kasus SUJU
**Commit:** `471c4c3` (fitur) · `1fc7c80` (badge)
**Deploy:** `./deploy.sh iqdash` — 36 file, 0 gagal, dua kali

---

## Masalahnya

Panel **Revision Request ke CorpSec** dibangun dari produk yang **sudah
obtained** (`getObtainedByProd`). Perusahaan yang belum pernah punya kuota —
SUJU — karena itu tidak punya satu baris pun untuk ditumpangi permintaannya.
Panelnya berhenti di *"Select a company above to see its products."* /
*"No products found."* dan Sales tidak bisa mengajukan apa pun lewat dashboard.

## Alur yang sekarang jalan

```
New Company → Sales Input Product & MT → Konfirmasi CorpSec
  → Status: Submit → Active Application: New Submission → Total Submission (MT)
```

| Tahap | Di mana | Apa yang terjadi |
|---|---|---|
| Sales input | Sales → Request ke CorpSec | Pilih produk dari **master produk** (28 produk), isi Qty (MT), `+ Add Product` untuk baris berikutnya |
| Simpan | tombol Save | `collectNewSubmissionData()` → `co.newSubmission` (status `pending`) |
| Konfirmasi | CorpSec → Revision Management | Satu baris konfirmasi **per produk**, qty pre-filled persis dari Sales, bisa ✓/✕ sendiri-sendiri |
| Hasil | otomatis | Siklus `Submit #N` lahir → status perusahaan `Submit` |

Selama masih `pending`, **tidak ada satu angka pun yang bergerak**. Itu memang
yang diminta: Active Application dan Total Submitted baru berubah setelah
CorpSec mengonfirmasi.

## Kenapa angkanya ikut jalan tanpa rumus baru

Tidak ada satu total pun yang dihitung ulang. Seluruh dampaknya lewat **satu
siklus** yang ditulis `nsRebuildFromConfirmed()`:

```
type        Submit #N          ← nomornya MENAMBAH, tidak pernah menimpa
mt          Σ produk confirmed
products    {PRODUK: MT}       ← nama dikanonikkan (GI BORON → GI ALLOY)
submitDate  tanggal konfirmasi ← Submit MOI; ini yang dibaca filter periode
releaseDate TBA                ← PERTEK memang belum terbit
```

Dari situ semuanya menyusul sendiri, dari sumber yang sudah ada:

- `reportSubmittedTotal()` menjumlahkan siklus `Submit #N` bertanggal Submit MOI
  → **Total Submitted** naik, dan ikut tersaring benar oleh filter periode.
- `outstandingStage()` melihat Submit menggantung tanpa Obtained pasangannya;
  `activeApplicationStage()` melihat obtained masih 0 → golongan **`new`**
  → muncul di **Active Application → New Submission** sampai PERTEK terbit.
- Siklusnya muncul apa adanya di **SPI/PERTEK tracking** (Cycle History, tabel
  SPI, drawer) karena itu siklus biasa, bukan bentuk khusus.
- **Obtained / Utilized / Available tidak bergerak** — submit bukan kuota.

## Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `11-shipment.js` | Formulir Sales (`buildNewSubmissionForm`, `+ Add Product`, hapus baris, total hidup), `collectNewSubmissionData()`. Terkunci sendiri begitu CorpSec konfirmasi. |
| `13-rev-mgmt.js` | Model data + panel konfirmasi CorpSec per produk, `nsConfirm` / `nsBatal` / `nsRebuildFromConfirmed`. Status diturunkan `rrSyncReqStatus` — mesin yang sama dengan konfirmasi revisi. |
| `16-storage.js` | `newSubmission` dititipkan di amplop `rev_note`; amplopnya kini dibuat juga ketika hanya `newSubmission` yang terisi. |
| `01-data.js` | Membongkar amplop itu saat load — termasuk `_revisionType` yang selama ini ikut terbuang tiap reload. |
| `10-edit-form.js` | Kunci peran untuk isian baru (Sales & CorpSec). |
| `04-charts.js` + `style.css` | Badge **🆕 New Submission** (lihat di bawah). |

Siklusnya ikut dikirim lewat `patchCyclesToServer` — `patchToServer` tidak
membawa `cycles`, jadi tanpa itu `Submit #N` hilang begitu halaman dimuat ulang.

## Badge yang ikut diperbaiki

`revisionStatus()` memulangkan `'clean'` untuk `revType: 'none'`, jadi
perusahaan yang baru punya `Submit #1` jatuh ke fallback paling bawah
`statusBadge()`: **"✅ SPI Issued"** — untuk perusahaan yang justru belum punya
SPI sama sekali. Tabel SPI akan bilang SPI sudah terbit sementara Active
Application bilang New Submission.

Cabang barunya membaca `activeApplicationStage()`, **sumber yang sama** dengan
Active Application, jadi keduanya tidak bisa berbeda.
Hari ini tidak ada perusahaan yang badgenya berubah (golongan `new` masih
kosong) — diverifikasi 41 dari 41 sama persis sebelum dan sesudah deploy.

## Verifikasi

**Uji otomatis** — `iqdash/tests/test_new_submission.cjs`, 59 assertion.
19 suite node + 15 suite PHP lulus, 0 gagal.
(`smoke_crud_live.php` menolak jalan tanpa `--run-live-crud`; itu pengaman, bukan kegagalan.)

**Di dashboard live**, alur SUJU dijalankan utuh lalu **dipulihkan** — tidak ada
data uji yang ditulis ke sheet:

| | |
|---|---|
| Formulir Sales | routing benar · 28 produk dari master · + Add Product · hapus baris · total 3.000 MT |
| Panel CorpSec | 2 baris konfirmasi, `GI ALLOY 2,000` + `SEAMLESS PIPE 1,000` — persis breakdown Sales |
| Saat `pending` | Total Submitted **272.345 → 272.345** · Active Application **null** |
| Setelah konfirmasi | siklus `Submit #1` 3.000 MT · `revStatus: "Submit"` |
| Total Submitted | **272.345 → 275.345** (34 → 35 perusahaan) |
| Active Application | SUJU → **New Submission**, total 6 → 7 |
| Obtained / Available | **tidak bergerak** (34.740 / 11.178) |
| Setelah dipulihkan | kembali 272.345, 0 siklus |

**Audit menyeluruh sesudah deploy:**

- 25 builder × 3 periode + panel CorpSec/Sales + drawer untuk 41 perusahaan →
  **0 error**, dan tidak ada perusahaan yang "ketularan" `newSubmission`.
- 12 periode × identitas Available (Σ baris = kartu · Σ per-produk = kartu ·
  jumlah perusahaan = kartu) dan Active Application (Σ golongan = total,
  perusahaan unik = total) → **nol selisih**.
- Penamaan produk di siklus: **0** sisa `GI BORON` / `GL BORON` / `SHEETPILE`.
- Kartu Overview = `reportSubmittedTotal()` ✔ · modal Active Application
  konsisten dengan `activeApplications()` ✔

```
Tanpa filter sub 272345 · obt 34740 · util 23782 · avail 11178 (8 co) · AA 6
H1 2026      sub 66745 · obt 19640 · util 12525 · avail 10958 (6 co) · AA 3
Q3 2026      sub  8600 · obt  1380 · util  4385 · avail  6445 (6 co) · AA 6
2026 penuh   sub 75345 · obt 21020 · util 16910 · avail 11178 (8 co) · AA 6
```

---

## Temuan data yang perlu keputusan (bukan bug kode, sudah ada sebelumnya)

Dua siklus Submit yang total MT-nya tidak sama dengan rincian per produknya.
Kartu headline memakai `mt`, kolom per-produk memakai `products` — jadi barisnya
tampil beda di drill Obtained.

| Perusahaan | Siklus | Submit MOI | Total siklus | Σ per produk | Selisih |
|---|---|---|---|---|---|
| **HDP** | Submit #3 | 30/06/2026 | 3.000 MT | 0 (rincian **kosong**) | −3.000 |
| **LCP** | Submit #2 | 21/05/2026 | 2.725 MT | GL ALLOY 3.000 | +275 |

Mana yang benar perlu dikonfirmasi ke master sebelum diperbaiki — saya tidak
menebaknya.
