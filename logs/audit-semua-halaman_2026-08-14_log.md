# Audit semua halaman — 2026-08-14 (sore)

**Permintaan:** "Coba cek lagi semua halaman, jangan sampai ada yang beda"
**Metode:** kali ini membaca **angka yang benar-benar tampil di DOM**, bukan
keluaran fungsi, dan menggerakkan filter lewat `applyPeriodFilter()` — jalur
render yang sama dengan yang dipakai UI. Itu yang menangkap lima temuan di
bawah; audit sebelumnya membandingkan fungsi dengan fungsi, jadi semuanya lolos.

---

## Lima temuan, satu tema

Semuanya kelas yang sama: **satu permukaan menjawab pertanyaan yang sama dengan
caranya sendiri**, bukan memanggil sumber kanonik. Dan semuanya **tak terlihat
tanpa filter** — baru berpisah begitu ada periode dipilih.

### 1 · `ra_records` itu satu baris per GELOMBANG, bukan per perusahaan

AMP dan SGD masing-masing punya dua gelombang kedatangan. `getRA()` sengaja
memulangkan yang terbaru saja, jadi permukaan yang memakainya sebagai
"realisasi perusahaan" membuang sisanya.

| Permukaan | Layar | Kartu | Selisih |
|---|---|---|---|
| Baris TOTAL + bar footer All Companies | 13.531,494 | 15.438,208 | **1.906,714** |

Selisihnya persis AMP 399,178 + SGD 1.507,536. `raTotals()` sudah ada untuk ini
— docblock-nya bahkan menyebut permukaan yang justru tidak memakainya.

Efek samping yang ikut terlihat: AMP tampil **"Real 0%"** di sebelah 799 dari
800 MT, karena persentasenya diambil dari satu gelombang.

### 2 · Drill Realized menghitung baris, bukan perusahaan

Menulis **"Companies 26"** — itu jumlah baris RA — terhadap kartu yang
membukanya: **24**.

### 3 · Cabang cadangan `reportRealizedTotal()` punya bug yang sama

`companies: arrived.length` menghitung baris, dan `codes` berisi kembar. Tidak
terlihat di produksi karena cabang REALIZATIONS (yang sudah memakai `Set`)
hampir selalu yang terpakai — **fixture uji yang memunculkannya**, bukan
dashboard.

### 4 · Drill Realized memakai gerbang tanggal yang berbeda dari kartunya

Kartu menjumlah baris PIB di `REALIZATIONS` dengan gerbang `pib_date`; drill
menjumlah `ra_records.berat` dengan gerbang `arrivalDate`. Dua sumber, dua
tanggal.

| Periode | Drill | Kartu |
|---|---|---|
| Juni 2026 | 2.069,08 MT · 5 co | 2.275,372 MT · 9 co |
| Feb 2026 | 2.481,488 MT · 4 co | 3.129,634 MT · 7 co |

### 5 · Tabel All Companies: dua basis dalam satu penjumlahan

Barisnya memakai `d.submit1` dan `d.obtained` — keduanya **sepanjang waktu**,
ditimpa `canonicalSubmitted`/`canonicalObtained` saat load — di atas daftar
company yang **sudah difilter periode**. Kelas yang persis sama sudah pernah
dibereskan untuk kolom Available, tapi tidak untuk tiga kolom lainnya.

| Periode | TOTAL Submit | Kartu | | TOTAL Obtained | Kartu |
|---|---|---|---|---|---|
| H1 2026 | 236.945 | 74.945 | | 30.560 | 19.860 |
| Juni 2026 | 159.345 | 14.920 | | 20.310 | 10.040 |
| Agu 2026 | 49.300 | 0 | | 12.540 | 420 |

Cabang PENDING punya penyakit yang sama secara terpisah: dengan filter Agustus,
baris SNSD tetap menyumbang Submit 3.000 / Obtained 120 padahal Submit MOI-nya
17/06/2026.

Dan kolamnya lebih sempit dari kolam kartu Utilized: perusahaan yang kargonya
mendarat di dalam jendela tapi tanggal siklusnya di luar **tidak punya baris
sama sekali**, sehingga TOTAL Utilized selalu lebih kecil.

| Periode | TOTAL Utilized | Kartu | Yang tidak punya baris |
|---|---|---|---|
| Feb 2026 | 425 | 2.425 | SGD 2.000 MT |
| Mei 2026 | 700 | 3.000 | BTS 1.000 + GKL 1.300 |
| H1 2026 | 9.825 | 12.525 | AMP · GKL · LSJ · NCT · SPP |

---

## Yang dikerjakan

**Dua pasangan per-perusahaan baru di lapisan kanonik** — supaya tabel dan
drill tidak bisa lagi menjawab sendiri-sendiri:

- `realizedByCompany()` — pasangan per-company dari `reportRealizedTotal()`,
  kolam dan gerbang tanggal sama persis
- `scopedSubmittedTotal(co)` — pasangan per-company dari `reportSubmittedTotal()`,
  aturan siklus sama persis (Submit #N saja · dedup · lewati `_fromRevReq` ·
  gerbang Submit MOI)

**Permukaan yang dirapikan:**

| Berkas | Perubahan |
|---|---|
| `07-tables-main.js` | baris pakai `raTotals()` · Submit/Obtained diiris periode · realisasi lewat `realizedByCompany()` · cabang PENDING ikut · kolam = `utilizationPool()` · TOTAL & bar panggil `reportRealizedTotal()` |
| `03-kpis.js` | drill Realized diringkas per perusahaan dari baris PIB yang sama dengan kartu; tile ringkasnya memanggil sumber kanonik |
| `02-period-filter.js` | cabang cadangan `reportRealizedTotal()` menghitung perusahaan unik; dua helper baru |

Persentase realisasi per baris diturunkan dari **Σ berat perusahaan ÷ obtained**.
Itu bukan tafsiran: diuji atas **24 dari 24** company yang punya RA, hasilnya
sama persis dengan `realPct` tersimpan — termasuk kedua company dua-gelombang,
yang memang menyimpan persentase se-perusahaan pada salah satu barisnya.

## Verifikasi

`iqdash/tests/test_realized_gelombang_ganda.cjs` — 27 assertion.
21 suite node lulus, 0 gagal.

Audit ulang di dashboard live, **13 periode** (tanpa filter · H1 · Q3 · 2026
penuh · 2025 · dan kedelapan bulan 2026), membandingkan **angka DOM** dengan
sumber kanonik:

- kartu Overview (Submitted · Utilized · Realized · Available)
- baris TOTAL dan bar footer All Companies (kelima kolom)
- drill Realized (MT + jumlah perusahaan) · drill Available (MT + perusahaan)
- kartu halaman Available Quota (1 & 4)
- identitas: Σ baris AVQ = kartu · company AVQ = kartu · Σ per-produk = kartu ·
  Σ submitted per-produk = kartu · Σ obtained per-produk = kartu
- Active Application: Σ golongan = total

**Hasil: nol selisih, nol error.** `submittedBreakdownIssues()` 0 ·
`revisionRuleIssues()` 0 · penamaan produk 0 sisa.

```
Tanpa filter sub 277545 · obt 35260 · util 23782 · real 15438 · avail 11478 · AA 6
H1 2026      sub  74945 · obt 19860 · util 12525 · real 15438 · avail 11258 · AA 4
Q3 2026      sub   5600 · obt  1680 · util  4385 · real     0 · avail  6745 · AA 6
2026 penuh   sub  80545 · obt 21540 · util 16910 · real 15438 · avail 11478 · AA 6
2025         sub 197000 · obt 13720 · util  6872 · real     0 · avail  1053 · AA 5
```

---

# Putaran kedua — permukaan yang belum tersentuh

Putaran pertama menutup kartu, footer, dan dua drill. Putaran ini menyisir yang
**belum** pernah diperiksa di tingkat DOM: ketujuh drill, sub-baris per produk,
kartu per-produk AVQ, dan **ekspor**. Tiga temuan lagi, semuanya kelas yang sama.

### 6 · Drill Utilized: tile Available menjumlah barisnya sendiri

`rows` di drill itu hanya memuat produk yang **punya** utilisasi (baris ber-util
0 dilewati), jadi kuota yang belum tersentuh sama sekali tidak punya baris dan
sisanya ikut hilang.

| | |
|---|---|
| Tile "Available (MT)" | **7.708 MT** |
| Kartu Available Quota | **11.478 MT** |

Tile Utilized dan Obtained di drill yang sama sudah memanggil sumber kanonik —
yang ini tertinggal. Sekarang memakai `reportAvailableTotal()`.

### 7 · Drill Lead Time: tile Total Obtained

Menjumlah `co.obtained` (sepanjang waktu) atas `filteredSPI()` saja:
**35.140 MT · 33 company** terhadap kartu **35.260 · 34**. SNSD hidup di PENDING
sehingga tidak pernah punya baris. Kolamnya kini `kpiPool()` dengan obtained
diiris periode.

### 8 · Ekspor: baris per-perusahaan masih satu gelombang

Baris **ringkasan** PDF dan Excel sudah memanggil `report*Total()` dan benar.
Tapi kolom per-company di sheet SPI Excel dan ekspor CSV masih memakai
`getRA()` — sehingga **satu berkas memuat dua cerita**:

| | Ringkasan | Kolom per-company |
|---|---|---|
| Total Realized | 15.438,208 MT | AMP **399,942** dari 799,12 · SGD **488,562** dari 1.996,098 |

AMP juga tercetak **0% realisasi** di sebelah 799 dari 800 MT. Keduanya kini
memakai `raTotals()`; kolom Eligible ikut memakai persentase yang benar.
Tabel Realization Monitoring di PDF sudah benar sejak sebelumnya.

## Verifikasi putaran kedua

`test_realized_gelombang_ganda.cjs` diperluas jadi **34 assertion**. 21 suite
node lulus, 0 gagal.

Audit ulang **13 periode**, kini termasuk **ketujuh drill** (Submit · Obtained ·
Utilized · Realized · Available · Lead Time · Pending), baris TOTAL + bar
footer, kartu Overview, kartu halaman AVQ, dan lima identitas per-produk:
**nol selisih, nol error.**

Konsistensi antar-baris diuji terpisah untuk **41 perusahaan × 4 metrik ×
3 periode** — Σ per-produk = total company untuk submitted, obtained, utilized,
dan available: **nol selisih**. Kartu per-produk AVQ = Σ baris tabelnya: **nol
selisih**.

Ekspor diverifikasi tanpa mengunduh, dengan membangun barisnya di halaman:
Σ kolom realisasi per-company = **15.438,208** = angka ringkasan. AMP 799,12
(99,89%) · SGD 1.996,098 (99,80%) · ADP 246,684 (70,48%) tidak berubah.

## Catatan metode

Dua "temuan" pertama saya di putaran ini ternyata **salah baca harness saya
sendiri**, bukan bug dashboard, dan saya sebutkan supaya tidak dikejar lagi:

- drill Available "17 companies" — regex saya menangkap awal angka *17*.340
  (Obtained), padahal subjudulnya benar: 9 companies · 15 product-rows
- kartu insight Active Application "0" — kartunya berbunyi
  "0 Baru · 3 Revisi · 3 Re-Apply · 0 PERTEK", jumlahnya 6 dan cocok

Menyetel `PERIOD` langsung juga tidak cukup: tanpa `applyPeriodFilter()` layar
tetap menampilkan angka tanpa filter. Audit DOM apa pun ke depan harus lewat
jalur render itu.
