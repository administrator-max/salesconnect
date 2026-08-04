# [iqdash-obtained-rules-confirmed] 2026-08-04 — Dua aturan Obtained dikonfirmasi; selisih PDF tuntas

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Sifat:** **tidak ada perubahan kode maupun data.** Dokumen ini merekam dua
  aturan bisnis yang dikonfirmasi pemilik data, dan menutup selisih terakhir
  antara PDF Summary dan tabel Excel H1.

## Aturan yang dikonfirmasi

### 1. Realokasi produk BUKAN obtained
> *"Jika ada realokasi / pindah produk (bisa ke 1 atau lebih dari 1 produk)
> maka tidak termasuk obtained. Karena nilai obtained kuota tetap sama."*

Sebuah revisi memindahkan kuota antar produk; totalnya tidak bertambah. Jadi
revisi tidak pernah menambah Obtained, dan tidak pernah memindahkan Obtained ke
periode PERTEK revisinya.

**Kode sudah sesuai** dan tidak perlu diubah — Obtained hanya menjumlahkan
cycle `Obtained #N` (dedup per tipe, `_fromRevReq` dilewati, digerbangi status
terbit, disandarkan pada PERTEK Submit pasangannya). Cycle `Revision #N` dan
`Revision Request` tidak pernah menyumbang MT. Diverifikasi atas data hidup:
**0 MT** berasal dari cycle revisi.

Catatan pembeda penting: **re-apply ≠ realokasi.** Obtained #2 milik ADP, BHG,
HKG, JKT, MSN adalah pengajuan BARU (mis. BHG: "Obtained #1 200 MT PPGL Carbon,
lalu reapply dan obtained #2 150 MT GI Boron") — itu memang obtained, dan
`from_rev_req`-nya sudah dibersihkan pada `iqdash-cycles-match-master`. Yang
BUKAN obtained adalah pemindahan antar produk tanpa penambahan total, seperti
BDG (−650 BORDES → +650 GL, −350 → +350 GI; total tetap 1.000).

### 2. AADC Obtained 150 MT sudah benar
> *"AADC : Obtained 150 MT sudah benar, di master juga 150 MT."*

Dashboard sudah menampilkan 150 MT dengan PERTEK 14 Apr 2026. Yang keliru hanya
**sel tanggal** di file master (`1-Jul-16`, serial Excel 42552), yang membuat
tabel H1 turunannya menulis 0.

## Selisih terakhir PDF vs Excel — tuntas

PDF/dashboard H1 2026 menghitung Obtained **19.860**; tabel Excel **20.710**.
Dengan kedua aturan di atas, tabel Excel-lah yang perlu dikoreksi:

```
20.710
− 1.000   BDG  — realokasi, bukan obtained (aturan 1)
+   150   AADC — sel PERTEK master salah ketik (aturan 2)
= 19.860  = angka dashboard  ✓
```

Diverifikasi atas data hidup: BDG H1 = 0, AADC H1 = 150, dan tidak ada satu pun
cycle revisi yang terhitung sebagai obtained.

## Status akhir PDF Summary — 1 Jan s.d. 30 Jun 2026

| KPI | Dashboard & PDF | Excel apa adanya | Excel setelah dikoreksi |
|---|---|---|---|
| Total Submitted | 74.945 | 74.945 | 74.945 ✓ |
| Quota Obtained | **19.860** | 20.710 | **19.860** ✓ |
| Total Utilized | **17.300** | 17.300 | 17.300 ✓ |
| Cargo Realized | 26 | 26 | 26 ✓ |
| Available Quota | **11.693** | 11.693 | 11.693 ✓ |

**Kelima ukuran cocok.** Sisa perbedaan hanya di file master, bukan di sistem.

## Yang perlu dirapikan di file master (bukan di dashboard)
1. **AADC** — sel PERTEK Submit #1: `1-Jul-16` → `14-Apr-26`.
2. **Tabel H1** — BDG tercatat obtained 1.000 di H1; menurut aturan 1 seharusnya
   0, karena yang terjadi di H1 adalah realokasi, bukan perolehan baru.
3. **Sheet "Apply cycle"** — BHG GI Boron tertulis 200 (seharusnya 150), KAN
   siklus ke-2 masih `TBA` (seharusnya 60 MT, SPI 30 Jul 2026).
4. **SGD** — label baris `Utilizaion (date)` kurang huruf *t*. Pembacaan sistem
   sudah dibuat tahan-typo, tapi sebaiknya tetap dibetulkan.
