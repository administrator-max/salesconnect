# [fix-alias-blind-stats-match] 2026-07-27 — Pencocokan baris per-produk pakai nama kanonik, bukan string mentah

## Ringkasan
Memperbaiki bug jalur tulis yang **membuat baris duplikat** di `company_product_stats` dan
`company_reapply_targets`. Ini prasyarat rekonsiliasi data 12 baris (dari
`audit-mt-truncation_2026-07-27_log.md`) — kalau data dirapikan lebih dulu, duplikatnya
muncul lagi begitu ada penyimpanan lot berikutnya.

## Akar masalah
Setiap pencarian baris di `iqdash_write.php` membandingkan nama produk **secara harfiah**:

```php
if ($s['company_code'] === $code && $s['product'] === $product) { $exIdx = $i; break; }
```

Padahal satu produk nyata punya beberapa ejaan. Lot pengiriman dan ledger memakai nama
**kanonik** (`GI ALLOY`), sementara baris lama masih memakai **alias** (`GI BORON`). Sisi
BACA sudah menyelesaikan ini (`$aliasMap` di `iqdash_data.php`); sisi TULIS tidak. Jadi lot
yang disimpan sebagai `GI ALLOY` tidak pernah cocok dengan baris stats `GI BORON`, dan
[baris baru disisipkan](../iqdash/iqdash_write.php) sebagai gantinya.

Akibatnya baris kembar tersebut merusak basis obtained (`prevUtil + prevAvail`) yang dipakai
sebagai **plafon kuota** saat edit lot berikutnya.

Kerusakan yang sudah terjadi di produksi (read-only, belum diperbaiki di sini):

| Tab | Pasang kembar |
|---|---|
| `company_product_stats` | **6** — BDG, BHG, HKG, JKT, SMS, SPA (semuanya `GI/GL BORON` + `GI/GL ALLOY`) |
| `company_reapply_targets` | **5** — AMP, BDG, BHG, HKG, JKT |

## Perubahan

### `iqdash/iqdash_util.php` — helper baru
- `iq_alias_map(GoogleSheets, $sid)` — baca peta `alias => canonical` dari tab `product_aliases`
  (11 entri di produksi).
- `iq_canon_product($p, $aliasMap)` — nama kanonik; identitas bila tak ada alias. Trim dulu,
  aman untuk `null`.
- `iq_find_product_row_idx($rows, $code, $product, $aliasMap)` — indeks baris pada tabel
  ber-kunci company+product, membandingkan nama **kanonik di kedua sisi**. Mengembalikan
  `null` untuk produk kosong/null, sehingga guard lama (produk null tidak boleh cocok dengan
  sel produk yang memang `''`) tetap terjaga.

### `iqdash/iqdash_write.php` — 5 situs pencocokan dialihkan
| Baris | Konteks |
|---|---|
| ~781 | recompute utilisasi dari lot — **ini yang bikin 6 kembar di stats** |
| ~887 | sinkronisasi `obtainedStats` (Manual Update "Obtained MT per product") |
| ~819 | upsert `company_reapply_targets` — **ini yang bikin 5 kembar** |
| ~1313 | `iq_record_obtained_plan()` (helper murni; param `$aliasMap` opsional, default `[]` = perilaku harfiah lama, jadi back-compatible) |
| ~1442 | net-add stats di `iq_record_obtained()` |

Helper dinamai `iq_find_product_row_idx` (bukan `..._stats_idx`) karena dipakai dua tab.

**Baris yang cocok TIDAK di-rename.** Jalur tulis hanya berhenti membuat kembar baru;
mengganti nama produk baris lama adalah pekerjaan rekonsiliasi data, bukan tugas jalur tulis.

### `iqdash/tests/test_product_alias_stats.php` — baru
26 assertion: helper murni, `iq_record_obtained_plan` (termasuk back-compat tanpa alias map),
reapply-targets, dan **tes end-to-end** yang menjalankan `iq_patch_company()` sungguhan lewat
stub in-memory — mereproduksi kasus BDG dan membuktikan hanya ada **satu** baris stats setelah
patch (sebelumnya dua).

## Verifikasi
- `php -l` seluruh file iqdash → lolos.
- **Seluruh 13 suite PHP lulus: 303 assertion, 0 gagal.** Tidak ada regresi.
- Tes end-to-end sebelum perbaikan: gagal (2 baris). Sesudah: 1 baris, util 350, avail 300.
- **Cek read-only terhadap Sheet produksi**: untuk tiap lot ber-utilisasi, helper baru kini
  menemukan baris legacy yang benar. 5 dari 8 lot sebelumnya meleset:

```
SPA  GI ALLOY  400  -> id=58  "GI BORON" (sebelumnya meleset -> bikin kembar)
BDG  GI ALLOY  350  -> id=69  "GI BORON" (sebelumnya meleset)
BHG  GI ALLOY  150  -> id=156 "GI BORON" (sebelumnya meleset)
HKG  GL ALLOY  250  -> id=56  "GL BORON" (sebelumnya meleset)
JKT  GL ALLOY  100  -> id=46  "GL BORON" (sebelumnya meleset)
MIN  BORDES    250  -> id=44  "BORDES ALLOY" (sudah benar)
SMS/IKM              -> baris 88x yang sudah ada (sudah benar)
```

Tidak ada penulisan ke Sheet produksi dalam perubahan ini.

## Risiko / sisa pekerjaan
- **Belum di-commit dan belum di-deploy.** Masih di working tree.
- **Data 12 baris belum direkonsiliasi** — bug pembuat kembar sudah tertutup, tapi kembar yang
  terlanjur ada masih di sana. Itu tugas berikutnya, dan sebagian butuh keputusan bisnis
  (BDG/GL util 650 > obtained 350; available menggantung di produk ber-obtained 0 pada
  MJU/HOLLOW 800, SMS/SHEET PILE 150, BDG/BORDES 50).
- **Saat kembar masih ada**, `iq_find_product_row_idx` mengembalikan kecocokan **pertama**
  menurut urutan array. Deterministik tapi sembarang; jadi tidak relevan begitu rekonsiliasi
  menyisakan satu baris per produk.
- **`company_products` sengaja TIDAK diubah** (1 kembar kanonik: MSN `GL ALLOY` + `GL BORON`).
  Tab itu di-*full replace* dari daftar produk yang dikirim klien, dan dedup kanonik di sana
  akan diam-diam membuang produk yang user daftarkan — perubahan perilaku, bukan bugfix.
  Perlu dibahas terpisah.
