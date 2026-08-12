# [iqdash-available-quota-satu-angka] 2026-08-12 — Available Quota: tiga angka jadi satu

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** *Laporan Kendala Data / Tooling* dari Sales Team GP (11 Agu 2026) —
  "tiga angka Available yang berbeda di halaman yang sama dengan filter periode
  yang sama persis", plus catatan ketidaksesuaian yang sudah terlanjur
  tercantum di dua laporan BOD berturut-turut (SOMR & SOHR H1 2026).

## Duduk perkaranya

Tim menyaring 01 Jan – 30 Jun 2026 dan mendapat:

| Tampilan | Available | Yang tertulis |
|---|---:|---|
| Kartu AVAILABLE QUOTA (Overview) | 11.058 MT | "18 perusahaan with PERTEK Terbit" |
| Modal "↗ detail" dari kartu itu | 12.780 MT | 7 perusahaan · "Obtained − Utilized" |
| Tab Available Quota → Table | ±13.000 MT | 27 perusahaan (dijumlah manual) |

Poin mereka yang paling tajam: **subset 7 perusahaan lebih besar daripada set
18 perusahaan yang seharusnya jadi induknya.** Itu memang mustahil — dan
sebabnya bukan "kurang beberapa perusahaan", melainkan ketiga angka itu tidak
pernah berasal dari populasi maupun rumus yang sama.

Ditelusuri di kode, ada **enam** pembangun permukaan Available Quota, masing-
masing menyusun kolam dan rumusnya sendiri. Tiga penyimpangan yang berbeda:

### 1. Kartu memasangkan angka dengan jumlah company milik metrik lain

`03-kpis.js` menulis nilainya dari `reportAvailableTotal().mt` tapi baris
unit-nya dari `obtCoSet.size` — jumlah company kartu **Obtained**. Jadi kartu
berbunyi "11.058 MT · 18 companies" padahal saldo itu milik 8 company.
**Angka 18 tidak pernah punya 11.058 MT di belakangnya.** Inilah "superset"
palsu yang membuat perbandingannya terlihat mustahil; tanpa ini, tim akan
melihat 8 lawan 8 dan langsung tahu yang berbeda cuma rumusnya.

### 2. Modal & tabel memakai KOLAM yang berbeda dari kartu

Kartu menyaring `kpiPool()` dengan gerbang **"kuota sudah terbit s/d akhir
periode"** (`canonicalObtainedFiltered` di dalam `_asOfPeriod`) — aturan yang
dipasang 2026-08-05 setelah koreksi tanggal MOI SNSD. Modal dan tabel memakai
`canonicalObtained` **sepanjang waktu**, tanpa gerbang itu, sehingga company
yang PERTEK-nya baru terbit *sesudah* jendela ikut terhitung.

### 3. Modal & tabel memakai RUMUS yang berbeda dari kartu

Kartu memakai **saldo kumulatif** (`cumulativeAvailable`). Modal menurunkan
sendiri dari `scopedAvailByProd()` = obtained periode − utilisasi periode.
Tabel lebih parah lagi: ia **mencampur dua basis dalam satu baris** — obtained
dari `getObtainedByProdAgg()` (all-time) dikurangi utilisasi dari
`scopedUtilByProd()` (periode) untuk produk yang tidak ada di `ap`. Itu sumber
angka yang paling menggelembung.

### Salinan keempat — yang paling berbahaya

Menelusuri ini menemukan `14-export.js` juga punya salinannya sendiri untuk
tabel per-produk **di PDF yang dikutip ke BOD**: memakai `filteredSPI()` (tanpa
PENDING) dan membaca `co.availableByProd` **mentah** — kolom stats yang tidak
ikut diperbarui saat utilisasi bertambah (persis kasus ADP 2026-08-10: tertulis
sisa 100 MT padahal 350/350 sudah terpakai). Jadi tabel per-produk di PDF bisa
menjumlah lebih besar daripada headline Available di PDF yang sama.

Popup company-per-produk juga masih memakai `filteredSPI()` sementara kartu
produk di atasnya memakai `kpiPool()` — kartu bisa menulis "N co." lalu
popup-nya mendaftar lebih sedikit. Kelas bug yang sudah dua kali diperbaiki di
permukaan AVQ lain (2026-08-07, 2026-08-10) dan terlewat di sini.

## Perubahan

Bukan menambal enam permukaan, tapi **menghapus lima salinan**. Satu kolam,
satu rincian, di `02-period-filter.js` — bersebelahan dengan
`reportAvailableTotal()` yang sudah jadi sumber tunggal untuk angka totalnya:

| Fungsi baru | Isinya |
|---|---|
| `availablePool()` | Kolam company — syarat periode yang sama persis dengan kartu. `reportAvailableTotal()` kini juga dibangun di atasnya, jadi keduanya tidak mungkin berbeda. |
| `cumulativeAvailByProd(co)` | Saldo kumulatif per produk, **dinormalkan** supaya jumlahnya persis `cumulativeAvailable(co)`. Sisa pembagian dibebankan ke produk terakhir, bukan `Math.round()` per baris. |
| `availableQuotaRows()` | Satu baris per (company, produk) — HS code, obtained, utilized, available. Semua **kumulatif**, jadi "Obtained − Utilized" benar-benar berlaku di baris maupun totalnya. |

Enam permukaan kini merender dari `availableQuotaRows()`:
`refreshAvqDrill` (03) · `buildAvailableQuota` (04) · `buildAvqTable`,
`buildAvqProdGrid`, `buildAvqProdChart`, `openProdCoPopup` (19) ·
rincian per-produk PDF (14).

### Yang juga dibereskan sekalian

- **Kartu Overview** — jumlah company kini dari `reportAvailableTotal().companies`,
  labelnya "companies with balance" (bukan "with PERTEK Terbit").
- **Baris TOTAL di tab Table** (`<tfoot>`) — tim sebelumnya menjumlah kolom
  Available sendiri untuk laporan BOD. Angkanya kini dicetak dari sumber yang
  sama dengan kartu. Kalau filter HS aktif, barisnya menyebutkan itu.
- **Basis metrik ditulis terang-terangan.** Permintaan tim poin 1: kalau memang
  metrik berbeda, beri label berbeda. Di halaman Available Quota, Available
  adalah **saldo kumulatif** sementara Obtained & Utilized adalah **aktivitas di
  dalam periode** — ketiganya sengaja beda basis, jadi `Available ≠ Obtained −
  Utilized` selama filter aktif. Sebelumnya tidak ada satu tulisan pun yang
  mengatakannya. Kini ada catatan permanen di bawah keempat kartu, dan unit tiap
  kartu berubah bunyi saat periode aktif.
- **Header modal** menyebut "(all-time)" dan punya tooltip basisnya.
- `grid._prodMap` dihapus — state yang hanya ditulis, tidak pernah dibaca.

## Verifikasi

Dijalankan atas **data produksi** (`cache/iqdash_data.json`, 10 Agu 2026 17:22 —
jendela yang sama dengan penarikan tim), kode HEAD vs kode baru:

**H1 2026 (01 Jan – 30 Jun) — periode yang mereka laporkan**

| | Sebelum | Sesudah |
|---|---:|---:|
| Kartu Overview | 11.118 MT · label "18 companies" | **11.118 MT · 8 companies** |
| Modal "↗ detail" | **12.780 MT** · 8 co. | **11.118 MT · 8 companies** |
| Tab AVQ → Table | 12.780 MT · 8 co. | **11.118 MT · 8 companies** |
| Tab AVQ → Chart | 11.118 MT · 8 co. | **11.118 MT · 8 companies** |
| | *2 angka + jumlah company keliru* | *1 angka; Σ rincian − kartu = 0* |

Angka **12.780 MT ter-reproduksi persis** seperti yang tim tulis, begitu juga
label "18 companies". Total kartu meleset tipis dari 11.058 yang mereka catat
(11.118) karena snapshot cache-nya beberapa jam lebih tua — persis efek yang
laporan mereka sendiri peringatkan ("di-update beberapa kali per hari").

Diuji juga di periode lain, dan penyimpangannya ternyata **jauh lebih parah di
luar H1** — H1 kebetulan periode yang paling "ringan":

| Periode | Kartu (sebelum) | Modal/Tabel (sebelum) | Sesudah (semua) |
|---|---:|---:|---:|
| All Time | 11.238 · "34 co." | 11.118 · 9 co. | **11.238 · 9 co.** |
| Q1 2026 | 5.240 · 5 co. | 5.780 · 5 co. | **5.240 · 5 co.** |
| Q3 2026 | 6.405 · "7 co." | **200** · 5–6 co. | **6.405 · 6 co.** |

Q3 meleset **32×** (200 MT vs 6.405 MT). Kalau tim mengecek Q3 alih-alih H1,
laporannya akan berbunyi jauh lebih gawat.

**Tes**

Baru: `iqdash/tests/test_avq_single_source.cjs` — dua lapis.
*Nilai*: Σ `availableQuotaRows()` harus persis `reportAvailableTotal().mt` dan
jumlah company uniknya persis `.companies`, di All Time maupun periode; Σ per
produk = saldo company; Σ Obtained − Σ Utilized = Σ Available.
*Struktur*: keenam pembangun permukaan tidak boleh lagi menyebut
`scopedAvailByProd` / `kpiPool` / `filteredSPI` / `availableByProd` mentah, dan
kartu tidak boleh lagi memakai `obtCoSet` untuk jumlah company-nya.

Tes nilai saja tidak cukup, dan itu pelajaran dari 2026-08-05 yang berlaku lagi
di sini: tanpa filter periode setiap salinan runtuh ke angka yang sama, jadi
salinan baru bisa lahir dan lolos tanpa terlihat.

Fixture-nya sengaja memuat kasus SNSD (PENDING, PERTEK terbit 04/08 — sesudah
H1), ADP (saldo nol), produk yang habis berdampingan dengan yang bersisa, dan
company yang stats per-produknya kosong.

**28 suite lulus, 0 gagal** (14 node + 14 PHP).

## Jawaban untuk 3 permintaan tim

1. **Mana yang jadi acuan resmi?** Kartu Overview — dan sekarang tidak perlu
   memilih lagi: modal, tabel, chart, grid per produk, popup, dan tabel PDF
   semuanya mengeluarkan angka yang sama persis. Untuk H1 2026 pada data 10 Agu:
   **11.118 MT · 8 perusahaan**. Perlu ditarik ulang sesudah deploy karena data
   terus berubah.
2. **Selaraskan atau dokumentasikan aturannya.** Diselaraskan. Aturannya:
   *Available = saldo kumulatif (obtained all-time − utilisasi all-time), untuk
   company yang aktif di periode DAN kuotanya sudah terbit s/d akhir periode.*
   Filter periode memilih **company mana** yang dihitung, bukan memotong
   saldonya — saldo itu stock, bukan aktivitas. Aturan ini sekarang tertulis di
   halamannya sendiri, bukan cuma di kode.
3. **Satu angka untuk dikutip sementara?** Tidak perlu angka sementara lagi.
   Catatan ketidaksesuaian di SOMR/SOHR bisa dicabut setelah deploy + verifikasi.

## Tindak lanjut

- **Deploy** (`deploy.sh` / git-ftp). Cache-busting `?v=` otomatis dari
  `filemtime` di `iqdash/index.php`, jadi tidak ada yang perlu dinaikkan manual.
- **Verifikasi bersama tim mengikuti §2 laporan mereka, dua kali dengan jeda
  beberapa jam** — persis seperti yang mereka minta, karena dashboard-nya
  di-edit beberapa kali sehari.
- Belum disentuh (di luar cakupan laporan, tapi masih membaca
  `co.availableByProd` mentah dan layak ditinjau berikutnya):
  `07-tables-main.js`, `08-drawer.js`, `17-ou-chart.js`, `18-sales-priority.js`.
