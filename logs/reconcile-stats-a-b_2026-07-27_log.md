# [reconcile-stats-a-b] 2026-07-27 — Rekonsiliasi `company_product_stats` kategori A + B

## Ringkasan
Merapikan 12 baris `company_product_stats` yang menyimpang dari ledger — menggabung 6 pasang
baris kembar, membuat 3 baris yang hilang, dan menyegarkan 3 `available_mt` basi.
**Tidak ada satu pun angka yang ditampilkan berubah** (diverifikasi 41 perusahaan).
Kategori C (butuh keputusan bisnis) sengaja tidak disentuh.

Prasyaratnya — bug pembuat kembar — sudah ditutup lebih dulu di
`fix-alias-blind-stats-match_2026-07-27_log.md`. Sumber daftar: `audit-mt-truncation_2026-07-27_log.md`.

## Kenapa aman dikerjakan sebelum perbaikan kode di-deploy
Perbaikan kode belum live. Tapi setiap penggabungan **mempertahankan baris yang bernama
kanonik** (`GI ALLOY`/`GL ALLOY`) dan membuang yang bernama alias. Pencocokan harfiah yang
masih berjalan di host justru cocok dengan nama kanonik — jadi lot yang disimpan sebagai
`GI ALLOY` menemukan barisnya, dan kembar tidak lahir lagi. Urutannya jadi tidak berisiko.

## Perubahan (12 baris; tab 57 → 54 baris)

### A — gabung 6 pasang kembar
`util` = jumlah kedua baris (yang lama = baseline legacy pra-lot, yang baru = dari lot);
`available` = ledger obtained − util. Baris beralias dihapus.

| Perusahaan | Sebelum | Sesudah | Dihapus |
|---|---|---|---|
| BDG / GI ALLOY | id882 (u350,a0) + id69 `GI BORON` (u0,a0) | id882 **u350 a300** (obt 650) | id69 |
| BHG / GI ALLOY | id885 (u150,a0) + id156 `GI BORON` (u0,a150) | id885 **u150 a50** (obt 200) | id156 |
| HKG / GL ALLOY | id886 (u250,a0) + id56 `GL BORON` (u750,a0) | id886 **u1000 a0** (obt 1000) | id56 |
| JKT / GL ALLOY | id887 (u100,a0) + id46 `GL BORON` (u300,a0) | id887 **u400 a0** (obt 400) | id46 |
| SMS / GI ALLOY | id883 (u150,a0) + id889 `GI BORON` (u0,a150) | id883 **u150 a0** (obt 150) | id889 |
| SPA / GI ALLOY | id884 (u400,a0) + id58 `GI BORON` (u0,a400.5) | id884 **u400 a1** (obt 401) | id58 |

### B — baris hilang dibuat + available basi disegarkan
| Perusahaan / produk | Sebelum | Sesudah |
|---|---|---|
| IKM / GI ALLOY (id888) | a=2 | **a=2150** (obt 4150 − util 2000) |
| IKM / SHEET PILE | tidak ada baris | id890 **u0 a1750** |
| IKM / SEAMLESS PIPE | tidak ada baris | id891 **u0 a2100** |
| MJU / HRPO ALLOY | tidak ada baris | id892 **u0 a200** |
| ADP / GL ALLOY (id59) | a=350 | **a=0** (obt 250 − util 250) |
| MSN / GL ALLOY (id60) | a=100 | **a=0** (obt 150 − util 150) |

`IKM/GI ALLOY a=2` adalah sisa perbaikan data 2026-07-27 pagi — recompute-nya memakai basis
obtained dari baris stats yang sudah basi (2002), bukan ledger (4150).

### Baris `companies` — tidak diubah
Σ`stats.utilization_mt` per perusahaan **tidak bergeser** oleh penggabungan (penggabungan itu
menjumlahkan dua baris yang sudah dihitung), dan `available_quota` sudah cocok. Dicek untuk
kesepuluh perusahaan terdampak: ADP, BDG, BHG, HKG, IKM, JKT, MJU, MSN, SMS, SPA — semuanya
`util X -> X`, `avail Y -> Y`.

## Cara eksekusi
Skrip sekali-jalan (scratchpad, tidak di-commit), dry-run dulu lalu `--apply`. Menulis satu tab
lewat `iq_batch_write_full_tables()` (batchRewrite atomik yang sama dengan jalur tulis app),
lalu `cacheClear()` + hapus memo payload.

Backup baris stats sebelum tulis: `backups/iqdash_stats_before_reconcile_2026-07-27.json`
(57 baris, lengkap dengan header).

## Verifikasi
1. **Kembar kanonik di stats: 0** (sebelumnya 6) — dicek ulang dari dump tab yang baru, independen dari skrip.
2. **Kedua belas nilai target cocok persis**, 0 gagal.
3. **Angka yang ditampilkan tidak berubah sama sekali.** Payload `/api/data` live dibandingkan
   sebelum vs sesudah untuk **41 perusahaan** (`obtained`, `utilizationMT`, `availableQuota`,
   `availableByProd`, `utilizationByProd`) → **nol beda**. Rekonsiliasi ini murni merapikan
   penyimpanan; tampilan memang sudah benar karena dibangun dari ledger.
4. **Drift stats↔ledger: 12/48 → 5/51.** Lima sisanya persis kategori C.
5. **Laporan Q2 2026 tetap valid** — dicek langsung di dashboard live dengan preset `q226`:
   TOTAL 23.630 MT, dan ketujuh baris produk identik dengan yang tercetak di laporan,
   termasuk `IKM 4,150 + CGK 1,020 + BDG 650`. Tidak perlu build ulang.

## Sisa pekerjaan — kategori C (5 baris, butuh keputusan bisnis)
| Baris | stats | ledger | Pertanyaannya |
|---|---|---|---|
| BDG / GL ALLOY | util 650 | obt 350 | Terpakai melebihi yang didapat — mana yang benar? |
| SPA / BORDES ALLOY | util 115, avail 514.5 | obt 114 | Selisih 1 dari pembulatan split 114,5; available 514,5 tidak berdasar |
| MJU / HOLLOW PIPE | avail 800 | obt 0 | Sisa revisi pindah-produk (MJU pindah ke HRPO)? |
| SMS / SHEET PILE | avail 150 | obt 0 | idem |
| BDG / BORDES ALLOY | avail 50 | obt 0 | idem |

Aritmetika tidak bisa menyelesaikannya: yang benar itu split obtained di ledger atau alokasi
produk di stats — itu fakta bisnis.

## Risiko lain yang masih terbuka
- **Perbaikan kode belum di-commit & belum di-deploy.** Selama belum, baris stats beralias yang
  TERSISA (mis. ADP/MSN `GL BORON`, BDG `GL BORON`) masih bisa melahirkan kembar baru bila ada
  lot disimpan untuk produk itu. Yang sudah direkonsiliasi aman (sudah bernama kanonik).
- `company_reapply_targets` masih punya **5 pasang kembar** (AMP, BDG, BHG, HKG, JKT) — bug
  pembuatnya sudah ditutup, datanya belum dirapikan.
