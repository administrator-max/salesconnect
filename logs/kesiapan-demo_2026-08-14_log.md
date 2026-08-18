# Kesiapan demo direktur — 2026-08-14

**Permintaan:** pastikan tidak ada angka berbeda dari dashboard depan sampai PDF
Summary, **terutama saat data di-update**.

Klausul terakhir itu kelas kegagalan yang **belum pernah** diuji: audit-audit
sebelumnya semua di atas data diam.

---

## 1 · Tiap jalur simpan punya daftar render sendiri, dan sudah melenceng

Ini temuan utamanya, dan persis skenario yang dikhawatirkan.

| Jalur simpan | Yang disegarkan |
|---|---|
| `saveEdit` | **15 permukaan tidak ikut** — seluruh halaman Available Quota (kartu, tabel, kartu per-produk), strip Active Application, grafik Obtained vs Utilization |
| `csConfirmRev` / `csBatalRev` | 4 builder |
| `rrApplyObtained` | **hanya panel revisinya sendiri** — padahal ia menulis Obtained MT, angka inti |
| `_refreshAfterRREdit` (5 fungsi) | 5 builder |
| `saveSalesUtil` (tombol 💾 per-lot) | 4 builder — padahal menulis utilisasi |

Akibatnya: tim menyimpan data, kartu Overview berubah, **halaman Available
Quota masih angka lama** sampai halaman dimuat ulang.

**Perbaikan:** satu sapuan tunggal `refreshAllSurfaces()`, dipanggil SEMUA jalur.
`applyPeriodFilter()` memang sudah sapuan lengkap dan tidak mengubah PERIOD,
jadi filter yang sedang dipakai tetap utuh sesudah menyimpan.

## 2 · Satu builder gagal = separuh dashboard diam-diam basi

`applyPeriodFilter()` memanggil ~30 builder telanjang berurutan. Satu yang
melempar error menghentikan sisanya — layar tetap menampilkan periode
sebelumnya **tanpa tanda apa pun**. Ini kegagalan paling berbahaya untuk hari
ini: bukan angka salah, melainkan angka lama yang tampak benar.

Sekarang tiap permukaan dipagari sendiri; yang gagal dicatat dan dimunculkan
sebagai toast, sisanya tetap segar. Drill yang sedang terbuka ikut disegarkan —
kini termasuk Utilized, Available dan Lead Time yang sebelumnya tidak pernah ikut.

## 3 · PDF: "Avg Realization" berbeda dari layar

PDF mencetak **87,4%**, drill Realized di layar menyebut **92,3%** — label sama,
dua angka. PDF merata-ratakan `realPct` per **baris** `ra_records`, dan tabel itu
satu baris per **gelombang kedatangan**: dua perusahaan punya dua gelombang yang
menyimpan 0% di baris kedua, dan pembaginya jumlah baris (26), bukan perusahaan (24).

Kini realisasi ÷ obtained atas perusahaan yang sama — tertimbang, dan definisi
yang sama persis dengan angka yang membukanya di layar. Kelima angka utama PDF
sudah memanggil `report*Total()` dan tidak diubah.

## 4 · Muat ulang sesudah menyimpan bisa menampilkan angka lama

Terjadi dua kali hari ini dan sempat membuat perbaikan yang **sudah tersimpan**
tampak gagal. Memo payload di server ternyata sudah dibatalkan tiap penulisan —
yang basi **cache HTTP browser**: `fetch('api/data')` tidak menyertakan penanda
apa pun. Kini `cache: 'no-store'` pada `/api/data` dan `/api/realizations`.

Ini penting untuk demo: "muat ulang menampilkan angka lama" adalah kegagalan
yang paling mudah disalahartikan sebagai data hilang.

---

## Verifikasi akhir

**Data bergerak selama pengerjaan** (utilisasi 23.782 → 24.082, available
11.478 → 11.178) — tim memang sedang input. Seluruh verifikasi di bawah
dijalankan pada data terkini.

- **13 periode** × kartu Overview · baris TOTAL + bar footer · **7 drill** ·
  kartu halaman AVQ · 5 identitas per-produk · Active Application →
  **nol selisih, nol error**
- **PDF vs layar**: Submitted · Obtained · Utilized · Realized · Available ·
  Approval Rate · Util Rate · **Avg Realization** → semua sama
- **Uji sapuan**: 28 elemen layar dirusak isinya, lalu `refreshAllSurfaces()` →
  **semuanya ditulis ulang**, tidak ada yang tertinggal basi
- **Uji muat ulang** 3× berturut-turut → payload identik dan segar
- `submittedBreakdownIssues()` 0 · `revisionRuleIssues()` 0
- 21 suite node lulus, 0 gagal

```
Tanpa filter sub 277545 · obt 35260 · util 24082 · real 15438 · avail 11178 · AA 6
H1 2026      sub  74945 · obt 19860 · util 12525 · real 15438 · avail 10958 · AA 4
Q3 2026      sub   5600 · obt  1680 · util  4385 · real     0 · avail  6445 · AA 6
2025         sub 197000 · obt 13720 · util  6872 · real     0 · avail  1053 · AA 5
```

## Catatan untuk tim saat demo

1. Sesudah menyimpan, **angka di tab yang sedang dipakai langsung benar** —
   tidak perlu muat ulang.
2. Kalau muncul toast **"⚠ N bagian gagal disegarkan"**, muat ulang halaman
   sebelum membaca angkanya. Sebelum ini kegagalan seperti itu tidak terlihat
   sama sekali.
3. Filter periode **tetap utuh** sesudah menyimpan.
