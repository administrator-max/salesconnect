# [iqdash-3-desimal] 2026-08-04 — Semua angka MT tampil 3 desimal

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Pemicu:** permintaan tim (Luzya) — *"request format angkanya jadi 3 angka
  belakang koma dong, sblmnya cuma di realized aja"*, disertai tangkapan layar
  panel **Total Realized — Breakdown**: `REALIZED (MT) 15,438.208` bersebelahan
  dengan `OBTAINED (MT) 18,570 MT`, dan di tabelnya `800` vs `983.188`.

## Masalah
Dua gaya angka hidup berdampingan di satu panel yang sama:

- **`fmtMt()`** membulatkan **ke ATAS** ke ton bulat (aturan 21-Mei-2026) —
  dipakai untuk obtained/utilized/available/submit.
- **Realisasi** sengaja dikecualikan dari aturan itu, jadi tampil apa adanya
  dengan desimal.

Akibatnya `18,570` dan `983.188` berdiri berdampingan seolah beda ketelitian,
padahal keduanya besaran yang sama. Pembulatan ke atas juga menyembunyikan
pecahan yang nyata — mis. `353.3` tampil `354`.

## Perubahan

**`01-data.js`**
- `fmtMt()` — kini **selalu 3 desimal**, tanpa pembulatan ke atas. `snapZero()`
  tetap jalan lebih dulu supaya artefak `−0.49` tampil `0.000`, bukan negatif.
- `ceilMt()` — **tidak lagi dipakai siapa pun**. Sengaja tidak dihapus: aturan
  pembulatan bisa kembali, dan menghapusnya akan menghilangkan jejak kenapa MT
  pernah tampil sebagai ton bulat. Statusnya ditulis jelas di docblock.
- `_fmtMT()` (khusus tabel utama) — dulu 2 desimal tanpa nol di belakang,
  sehingga satu kolom bisa memuat `800`, `1.5`, dan `1,234.56` sekaligus. Kini
  mendelegasikan ke `fmtMt()`.

**137 titik di 13 berkas** yang memanggil `.toLocaleString(MT_LOCALE)` langsung
— melewati formatter resmi — diarahkan ke `fmtMt()`. Ini yang membuat panel di
tangkapan layar tadi tidak seragam: `fmtMt` sudah dipakai 151 kali, tapi 137
titik lain memformat sendiri.

## Yang SENGAJA tidak diubah (20 titik)

| Kategori | Alasan |
|---|---|
| **Isi input** (10 titik) | 3 desimal di input akan **ditolak `parseMT()`** sebagai ambigu — field jadi tak bisa disimpan |
| **Tick sumbu grafik** (4) | `5,000.000 MT` di sumbu hanya menambah keramaian, bukan informasi |
| **Nilai USD & kurs** (3) | bukan MT |
| **`Math.round`/`floor`** (2) | pembulatan yang memang disengaja (Sales Priority) |
| **Referensi bersyarat** (1) | `13-rev-mgmt.js:300` — `.toLocaleString ?` sebagai pengecekan, bukan pemanggilan |

### Satu titik nyaris lolos
`fmtThousandInline()` (`12-product-mt.js:532`) memformat **teks yang sedang
diketik user**. Sapuan otomatis sempat mengubahnya, dan itu akan merusak:
`fmtMt` memadatkan jadi `2,200.000`, lalu baris berikutnya menempelkan desimal
asli di atasnya → **`2,200.000.56`**. Dikembalikan, dan diberi komentar kenapa.

Sesudah itu, audit khusus dijalankan (`fmtMt` langsung di baris `.value=` /
`value="${…}"`, **dan** lewat variabel perantara): **bersih**.

## Konsekuensi yang perlu diketahui tim

Angka yang tampil kini **tidak selalu bisa disalin balik** ke kolom input.
`parseMT()` menolak teks berdesimal 3+ angka, karena tanpa koma ribuan
`983.188` bisa berarti `983.188` **atau** ejaan Indonesia untuk `983188` —
menebak salah persis seperti cara IKM kehilangan 1.998 MT
(`logs/fix-ikm-utilization_2026-07-27_log.md`).

Ini penjaga yang bekerja, bukan kerusakan: sebelum perubahan ini, angka layar
`15,438` yang disalin akan **tersimpan diam-diam sebagai nilai yang sudah
dibulatkan**. Sekarang ia menolak, bukan salah menyimpan.

*Belum dikerjakan (menunggu keputusan):* `mtAmbiguous()` bisa dipersempit —
kalau teksnya **mengandung koma ribuan** (`15,438.208`) maka ia sudah pasti
format en-US dan tidak ambigu sama sekali; hanya yang tanpa koma (`983.188`)
yang benar-benar perlu ditolak. Ini akan memulihkan salin-tempel untuk kasus
umum tanpa melemahkan penjaga. Tidak diambil sepihak karena menyentuh persis
penjaga yang lahir dari insiden kehilangan data.

## Verifikasi

Nilai yang sudah dikonfirmasi **tidak bergerak** — hanya penyajiannya:

| | Sebelum | Sesudah |
|---|---|---|
| Obtained H1 | 19,710 | 19,710.000 |
| Utilized H1 | 17,300 | 17,300.000 |
| Available H1 | 11,693 | 11,693.000 |
| Realized (CGK) | 983.188 | 983.188 |
| Obtained (CGK) | 800 | 800.000 |
| artefak −0.49 | 0 | 0.000 |

Non-angka tetap lewat apa adanya (`TBA` → `TBA`, `null` → `null`), jadi sel
kosong dan TBA tidak berubah jadi `0.000`.

- 14 berkas lolos `node --check`
- **6 suite JS + 15 suite PHP — 0 FAIL** (dihitung dari baris `FAIL`, bukan
  exit code; harness `ok()` selalu keluar 0)
