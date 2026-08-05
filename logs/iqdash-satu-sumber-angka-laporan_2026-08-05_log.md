# [iqdash-satu-sumber-angka-laporan] 2026-08-05 — Overview / U&R / Available Quota tidak lagi berbeda saat difilter

- **Tanggal:** 2026-08-05
- **Oleh:** Claude Code
- **Pemicu:** tim melaporkan tiga menu menampilkan angka berbeda untuk label yang
  sama begitu periode difilter (01 Jan – 30 Jun 2026).

## Yang dilaporkan

| | Overview | Utilization & Realization | Available Quota |
|---|---|---|---|
| **Total Utilized** | 17.300 | **13.600** | **18.447** |
| **Total Obtained** | 19.710 | 19.710 | **30.140** |
| **Total Realized** | 15.438,208 | **11.395,405** | — |

Tanpa filter ketiganya cocok. **Itu justru inti masalahnya:** setiap salinan
runtuh ke nilai yang sama ketika tidak ada jendela untuk diiris, jadi
pemeriksaan yang hanya melihat tampilan All Time tidak akan pernah menangkap
kelas bug ini.

## Sebab — bukan satu, melainkan lima salinan

Kelima angka ini muncul di **empat permukaan** (Overview · U&R · Available
Quota · PDF Summary). Masing-masing menghitungnya **sendiri**, dan tiap salinan
menyimpang dengan caranya sendiri:

| Permukaan | Yang salah | Akibat |
|---|---|---|
| **U&R — Utilized** | mengumpulkan `filteredSPI()` saja | company yang PERTEK-nya di luar jendela tapi **kargonya masuk** di dalamnya terbuang utuh. Persis itulah yang seharusnya dikembalikan `utilizationPool()` — **3.700 MT** |
| **U&R — Realized** | menjumlah `ra_records.berat` | ringkasan satu baris per company yang dijaga manual, bukan baris PIB yang disebut spesifikasi laporan |
| **AVQ — Obtained/Utilized** | angka **sepanjang waktu** (`canonicalObtained`, `co.utilizationMT`) | dicetak di samping daftar company yang **ter-filter periode**: kartunya menggambarkan populasi yang berbeda dari baris di bawahnya |
| **PDF — Submitted** | `canonicalSubmittedFiltered()` | fungsi berbeda dari penelusuran Submit #N milik Overview |
| **PDF — Obtained** | `canonicalObtainedFiltered()` **tanpa syarat** | saat periode TIDAK aktif, PDF tetap menerapkan patokan periode yang tidak dipakai kartu |
| **PDF — Realized** | `ra_records.berat` per `arrivalDate` | celah yang sama dengan U&R |

Tidak satu pun dari ini adalah **aturannya** yang keliru. Yang keliru adalah
aturan yang benar disalin berkali-kali lalu menyimpang sendiri-sendiri —
kegagalan yang sama persis dengan pemisahan ledger/cycles dan duplikasi aturan
obtained sebelumnya.

## Perbaikan

**`02-period-filter.js`** — lima fungsi baru, **satu implementasi tiap angka**:
`reportSubmittedTotal()` · `reportObtainedTotal()` · `reportUtilizedTotal()` ·
`reportRealizedTotal()` · `reportAvailableTotal()`, masing-masing mengembalikan
`{ mt, companies }`. Plus `allCompaniesPool()` untuk Submitted/Obtained yang
melakukan uji tanggal per-**cycle** di dalamnya (menyaring per company lebih
dulu akan menerapkan jendela dua kali).

Isinya **dipindahkan apa adanya dari Overview** — implementasi Overview-lah yang
sudah diverifikasi cocok dengan master untuk H1 2026, jadi itu yang jadi acuan,
bukan ditulis ulang.

Keempat permukaan sekarang **memanggil**, tidak ada yang menurunkan sendiri.

**⑤ Remaining Quota (U&R)** kini memakai saldo kumulatif yang sama dengan kartu
Available di dua halaman lain. Subjudulnya "Obtained − Utilized" tetap jujur —
memang begitu `cumulativeAvailable()` didefinisikan. Sebelumnya ia menurunkan
(obtained periode − utilized periode), yaitu angka **ketiga** untuk konsep yang
sudah disepakati dua halaman lain.

## Temuan susulan saat verifikasi

**Gauge** (`buildGauge` di `04-charts.js`, `updateOverviewStats` di
`15-leadtime.js`) — **dua fungsi menulis elemen yang sama**, dan yang jalan
belakangan menang. Keduanya menjumlah `ra_records`, penyakit yang sama.
Sudah diseragamkan, **tetapi**: elemen `gaugeRealMT` / `gaugeRemainMT` /
`.gauge-pct` **sudah tidak ada lagi di `index.html`**. Jadi kedua jalur itu
menulis ke elemen yang sudah dihapus — perubahan ini merapikan kode, **tidak
memperbaiki apa pun yang terlihat**. Dicatat supaya tidak disalahartikan
sebagai perbaikan tampilan.

Kedua fungsi itu juga memakai `toLocaleString(undefined, …)` — `undefined`
mengikuti locale **browser**, jadi di mesin id-ID `15438.208` tampil `15.438`.
Itu persis bug yang dijaga `MT_LOCALE` di `00-num.js`. Diganti `fmtMt()`.

## Tes

**`tests/test_metrics_single_source.cjs`** (baru, 35 pernyataan) — sengaja
**bukan** tes nilai (nilainya berubah tiap kali tim menginput), melainkan tes
**struktur**:

- kelima helper terdefinisi, dan **hanya** di `02-period-filter.js`
- tiap permukaan memanggilnya
- bahan mentah (`cumulativeAvailableTotal`, `utilizationPool`) **tidak boleh**
  dipanggil langsung dari permukaan — begitulah salinan-salinan itu lahir
- tidak ada permukaan yang menjumlah `.berat` sebagai total Realized

Komentar dibuang dulu sebelum diperiksa, karena docblock memang menyebut nama
fungsi lama sebagai catatan sejarah.

Tes ini **langsung menemukan** satu salinan yang saya lewatkan (`buildGauge`).

## Verifikasi live — lintas periode, bukan hanya yang dilaporkan

Overview / U&R / Available Quota, keempat angka, **identik** di:

| Periode | Obtained | Utilized | Available | Realized |
|---|---|---|---|---|
| All Time | 34.960 | 22.547 | 12.413 | 15.438,208 |
| **H1 2026** | **19.710** | **17.300** | **11.693** | **15.438,208** |
| Q1 2026 | 8.650 | 7.014 | 5.793 | 6.684,21 |
| Q3 2026 | 1.430 | 4.200 | 7.580 | — |
| Feb 2026 | 6.150 | 2.425 | 4.880 | 3.129,634 |

H1 2026 cocok dengan master seperti sebelumnya. Q3 memperlihatkan utilized
(4.200) melebihi obtained (1.430) — itu benar dan memang diharapkan: kuota yang
diberikan di periode lebih awal boleh dipakai belakangan.

- Seluruh berkas JS lolos `node --check`
- **7 suite JS + 15 suite PHP — 0 FAIL**

## Sisa / risiko

`toLocaleString(undefined, …)` **masih ada** di `08-drawer.js` (volume,
value USD, unit price pada rincian realisasi) dan `20-realization-import.js`.
Berbeda dengan gauge, keduanya **permukaan hidup** — di browser ber-locale
Indonesia angkanya akan tampil salah. Belum diperbaiki karena di luar lingkup
laporan ini; layak dikerjakan terpisah.

Elemen gauge yang sudah tak ada di HTML membuat `buildGauge()` dan sebagian
`updateOverviewStats()` menjadi kode mati. Tidak dihapus di sini.
