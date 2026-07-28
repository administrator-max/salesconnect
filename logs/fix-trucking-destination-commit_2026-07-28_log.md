# fix-trucking-destination-commit — 2026-07-28

## Ringkasan
Di Cost Core tab **Import Costing**, user mengganti Trucking Destination jadi "Surabaya"
tapi perhitungan tetap memakai "Cakung". Ada **dua penyebab terpisah**, dua-duanya diam
tanpa peringatan. Keduanya diperbaiki.

## Penyebab 1 — ketikan tidak pernah di-commit
`costcore/index.php`:
- `oninput="filterTujDD(this.value)"` hanya `display:none/""` pada item dropdown.
- `pickTuj(v)` — satu-satunya penulis `I.tujuan` — cuma terpasang di `onclick` item dropdown.
- Tidak ada handler `blur`/`Enter`, jadi teks mengambang: DOM bilang "Surabaya",
  state bilang "Cakung", dan tidak ada yang memberi tahu user.

## Penyebab 2 — fallback senyap saat tujuan tidak punya tarif untuk shipment type
Baris `cfg_trucking_rates` untuk **Surabaya** ada di Sheets (`bb_r=275000`,
`bb_rt=13750000`) tapi **kolom `ct_f20`/`ct_f40`/`ct_cb` kosong**. `loadCostcoreConfig()`
hanya memasukkan destination ke `TRK_CT` kalau `ct_f20` terisi, jadi Surabaya tidak ada
di daftar container. Guard di `renderImport()`
(`if(tujList.indexOf(I.tujuan)<0) I.tujuan=tujList[0]`) lalu melempar balik ke Cakung
**tanpa notifikasi** begitu shipment type diganti ke Container 20ft/40ft.

## Perubahan
1. **`commitTuj(val)`** — dipanggil `onblur` dan Enter. Cocok persis (case-insensitive)
   → commit lewat `pickTuj()`. Tidak cocok → input dikembalikan ke `I.tujuan` + warning.
   Escape membatalkan ketikan.
2. **`tujWarn(val)`** — baris peringatan `#tujWarn` di bawah input:
   - teks valid tapi belum di-commit → `⚠ Tekan Enter atau pilih dari daftar — perhitungan
     masih pakai <tujuan>.`
   - teks tidak ada di tabel tarif → `⚠ "X" tidak ada di tabel tarif trucking — …
     Tambahkan lewat ⚙️ Settings → Trucking Rates.`
   Pakai `textContent` (bukan `innerHTML`) supaya input user tidak pernah jadi HTML.
3. **Notifikasi fallback shipment type** — guard di `renderImport()` sekarang menyimpan
   tujuan lama ke `tujReset` dan merender pesan:
   `⚠ "Surabaya" tidak punya tarif Container 20ft — otomatis diganti ke Cakung. Isi kolom
   tarif Container 20ft di Settings → Trucking Rates kalau memang dipakai.`
4. **`tujOptions()`** — helper daftar tujuan aktif (BB vs CT) supaya tidak duplikat logika.
5. **`filterTujDD()`** — hitung item yang lolos filter; kalau 0 tampilkan baris `#tujNone`
   *"Tidak ada tujuan yang cocok — tambahkan di Settings"* (kelas `.none`). Selector diubah
   ke `div[data-tuj]` supaya baris hint tidak ikut difilter.
6. **Item dropdown `onclick` → `onmousedown` + `event.preventDefault()`.** Wajib: `blur`
   terjadi *sebelum* `click`, jadi dengan handler blur yang baru `commitTuj` akan
   me-revert dan me-render ulang sebelum `click` sempat jalan → klik jadi mati.
   `preventDefault` di `mousedown` mencegah blur sama sekali.
7. **`escA()`** — helper escape untuk nilai yang masuk ke dalam atribut. `esc()` yang ada
   cuma escape `& < >` (hasil `innerHTML` dari text node), tidak escape kutip. Dipakai di
   `value="…"` dan argumen `pickTuj('…')`.
8. CSS: `.tuj-warn` dan `.srch-dd div.none`.

Catatan jebakan: `.tuj-warn` punya `display:none` di CSS, jadi `style.display=""` tidak
menampilkan apa pun — harus `"block"` eksplisit.

## File yang disentuh
- `costcore/index.php` (CSS ~148–150; `escA` ~331; `tujOptions`/`filterTujDD`/`tujWarn`/
  `commitTuj` ~516–536; guard + markup Trucking Destination di `renderImport()` ~615–625)

## Verifikasi
- `php -l costcore/index.php` → no syntax errors.
- Kedua blok `<script>` inline dicek sintaksnya lewat parser JS Node → 0 error.
- Uji di browser memakai harness statis dari `costcore/index.php` dengan **config asli
  dari Sheets** (`cfg_trucking_rates` dibaca via `GoogleSheets::getValues` lalu di-inject
  menggantikan `fetch("api/config")`; gate PIN dilewati). Hasil:
  1. `TRK_BB.Surabaya = {r:275000, rt:13750000}`, `TRK_CT.Surabaya` tidak ada — sesuai Sheets. ✔
  2. Ketik `Surabaya` → saat mengetik muncul `⚠ Tekan Enter atau pilih dari daftar —
     perhitungan masih pakai Cakung`; setelah blur → `I.tujuan="Surabaya"`, warning hilang,
     box ringkasan `Trucking: 275,00 IDR/kg (Surabaya, non-pipe)` (275000/1000). ✔
  3. Ganti shipment type ke Container 20ft → otomatis balik ke Cakung **plus** peringatan
     "Surabaya tidak punya tarif Container 20ft …". ✔
  4. Ketik tujuan yang tidak ada sama sekali → input revert + peringatan "tidak ada di
     tabel tarif trucking"; dropdown menampilkan "Tidak ada tujuan yang cocok". ✔
  5. Klik item dropdown (`Ujung Menteng`) tetap berfungsi setelah perubahan mousedown. ✔

## Sisa / risiko
- Belum di-deploy ke host (`./deploy.sh`).
- **Surabaya belum punya tarif container.** Selama `ct_f20`/`ct_f40`/`ct_cb` kosong,
  Surabaya hanya bisa dipakai untuk Break Bulk. Isi di ⚙️ Settings → Trucking Rates kalau
  memang perlu container.
- Tab **Domestic Costing** tidak terpengaruh: `trkFrom`/`trkTo` di sana memang teks bebas
  dengan biaya diinput manual.
