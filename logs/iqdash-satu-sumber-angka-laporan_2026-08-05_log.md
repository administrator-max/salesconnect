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

## Susulan — format locale di drawer (diminta tim, selesai hari yang sama)

Sisa `toLocaleString(undefined, …)` di permukaan hidup ikut diperbaiki:

| Berkas | Yang diperbaiki |
|---|---|
| `08-drawer.js` | helper `_fmt` (total volume & total USD) + volume, nilai USD, harga satuan per baris PIB |
| `20-realization-import.js` | total volume dan kolom volume pada pratinjau impor |

Semuanya jadi `fmtNum(n, {…})` — locale terkunci ke en-US, opsi jumlah desimal
tetap jalan. `fmtMt()` **tidak** dipakai di sini: sebagian angka ini USD, dan
`fmtMt` membulatkan ke ton bulat.

**Kenapa berbahaya:** `undefined` sebagai argumen locale berarti "ikut locale
BROWSER". Di mesin ber-setelan Indonesia `15438.208` tampil `15.438,208` —
titik jadi pemisah ribuan, koma jadi desimal, persis terbalik. Itu jalur yang
sama dengan hilangnya 1.998 MT milik IKM.

### Tesnya diperkuat — dan inilah pelajaran utamanya

`test_mt_format.cjs` sudah punya pemeriksaan struktural untuk ini sejak
2026-07-27, tapi polanya hanya `toLocaleString(\s*)` — **tanpa argumen**.
Bentuk `toLocaleString(undefined, {...})` lolos begitu saja dan bertahan diam-diam
di enam tempat. Tes itu memberi rasa aman yang keliru: ia berjalan hijau selama
setahun sambil melewatkan varian yang persis sama bahayanya.

Pemeriksaannya kini mengenali **kedua** bentuk, dan polanya diuji terhadap enam
contoh (tiga harus tertangkap, tiga harus lolos) supaya tidak jadi tes yang
tak pernah bisa gagal.

Bug ini ditemukan saat menelusuri hal lain — bukan oleh tes yang seharusnya
menjaganya.

### Verifikasi
Panel rincian realisasi CGK di live: volume `96.104` · `193.864` · `487.42`,
nilai USD `60,641.62` · `120,971.14` · `181,612.76`. Nol angka bergaya
Indonesia. Dibuktikan pula `fmtNum(15438.208)` = `15,438.208` sementara
`toLocaleString('id-ID')` = `15.438,208` — jadi penguncian locale benar-benar
bekerja, bukan sekadar kebetulan karena browser penguji ber-locale en-US
(justru itu sebabnya bug ini tak pernah terlihat dari sini).

## Susulan 2 — dua label yang masih menyesatkan

Ditemukan saat memeriksa tampilan sesudah semua perbaikan di atas. Angkanya
sudah benar; **labelnya** yang belum.

**① Obtained Quota — jumlah company.** Strip U&R memakai `fRa.length` (jumlah
baris RA), bukan jumlah company dari angka yang sedang ditampilkan. Akibatnya
19.710 MT yang sama tertulis **"18 companies"** di Overview tapi
**"20 companies"** di U&R. Kini memakai `reportObtainedTotal().companies`,
sehingga MT dan jumlah company selalu berasal dari sumber yang sama.

**⑤ Remaining Quota — subjudul "Obtained − Utilized".** Secara definisi itu
benar (`cumulativeAvailable` memang obtained − utilized sepanjang waktu), tapi
pembaca yang mengurangkan dua kartu di sebelahnya akan mendapat
19.710 − 17.300 = **2.410**, bukan 11.693. Label yang mengundang salah hitung.
Diganti **"Saldo kumulatif"**.

## Sisa / risiko

Elemen gauge yang sudah tak ada di HTML membuat `buildGauge()` dan sebagian
`updateOverviewStats()` menjadi kode mati. Tidak dihapus di sini.

Kartu **Available Quota** di Overview bersubjudul "18 companies with PERTEK
Terbit" sementara halaman Available Quota menulis "Companies w/ Quota: 11".
Keduanya benar dan mengukur hal berbeda (18 = punya PERTEK di periode; 11 =
masih punya sisa saldo), tapi berpotensi dibaca sebagai selisih. Belum diubah —
menunggu tim memutuskan penamaan yang mereka inginkan.
