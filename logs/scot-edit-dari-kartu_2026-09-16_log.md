# SCOT — edit data langsung dari kartu shipment

**Tanggal:** 2026-09-16
**Modul:** SCOT (Shipment Control Tower)

## Ringkasan

Tim minta bisa mengedit data yang sudah disubmit — baik yang **Completed** maupun
**In Progress** — dengan cara mengklik datanya langsung, bukan lewat form terpisah.

Sebelum ini satu-satunya pintu edit di UI adalah panel **Update & Export →
"Update On Going Shipment"**, dan dropdown-nya **sengaja menyembunyikan shipment
berstatus `Done`**. Jadi shipment yang sudah selesai praktis tidak bisa diperbaiki
dari tampilan, padahal API-nya (`PUT /scot/api/shipments/:id`) sejak awal menerima
update untuk status apa pun. Yang kurang hanya jalan masuknya.

Sekarang setiap kartu shipment punya tombol **✏️ Edit**. Klik → modal berisi
seluruh 34 kolom yang sudah terisi → ubah → **review perubahan** → simpan.

## Perubahan

1. **Tombol ✏️ Edit di setiap kartu** (`ui.js`, `rCd`/`bindCards`)
   Muncul di tab **In Progress** dan **Completed**. Kliknya `stopPropagation`,
   supaya tidak ikut membuka/menutup panel detail kartu.

2. **Modal editor 2 langkah** (`forms.js`, bagian baru "4b. INLINE EDITOR")
   - Langkah 1: form 34 kolom (dibangun dari `FLDS` yang sama dengan form lain,
     jadi opsi dropdown tetap ikut `api/config`).
   - Langkah 2: **review diff** — hanya kolom yang berubah yang ditampilkan,
     `nilai lama → nilai baru`. Tombol **← Kembali** mengembalikan form
     **beserta ketikan yang belum disimpan**, bukan nilai asli dari database.
   - Simpan → `PUT api/shipments/:id` → `patchLocal(row)` (kartu langsung
     ter-update + dapat badge "✏️ Modified", tanpa refetch penuh).
   - Alasan dibuat 2 langkah: mengubah record yang sudah selesai itu menimpa
     data historis. Salah ketik satu kolom harus terlihat dulu sebelum masuk
     database, sama seperti alur "Setujui & Simpan" pada Add New Shipment.

3. **Penjaga perubahan yang belum disimpan** (`forms.js` + `main.js`)
   Tombol ✕, klik latar belakang, dan tombol Escape sekarang lewat `closeModal()`
   yang memanggil `scotEditorBlocksClose()`. Kalau ada kolom yang sudah diubah,
   muncul konfirmasi dulu. Kalau tidak ada perubahan, menutup seperti biasa
   (tidak ada konfirmasi yang mengganggu). Modal lain tidak terpengaruh.

4. **Jalan masuk tambahan ke editor yang sama**
   - Baris pada popup detail KPI (`sMdl` di `ui.js`) bisa diklik untuk mengedit.
   - Baris tabel di tab **Alerts** (`alerts.js`) juga bisa diklik.
   Semuanya memanggil `openEditShipment(id)` yang sama.

5. **CSS** (`style.css`): `.ed-b` (tombol Edit di kartu), `.mdl.wide`
   (modal editor lebih lebar: 960px / 88vh), `.ed-bar` (baris tombol sticky di
   bawah modal), dan media query < 720px → form jadi 1 kolom.

## File yang disentuh

- `scot/assets/ui.js` — tombol Edit di kartu, binding, baris popup KPI bisa diklik
- `scot/assets/forms.js` — bagian baru: editor inline (form, diff, simpan, penjaga)
- `scot/assets/main.js` — `closeModal()` + handler Escape
- `scot/assets/alerts.js` — baris tabel alert bisa diklik
- `scot/assets/style.css` — `.ed-b`, `.mdl.wide`, `.ed-bar`, media query

Tidak ada perubahan di `scot/api.php` / `scot/scot_util.php` — backend-nya sudah
mendukung ini sejak awal.

## Catatan teknis

- **Payload identik dengan form update lama.** Editor mengirim seluruh kolom
  `FLDS` (kosong → `null`), persis seperti `saveOgUpdate()`. Kolom di luar `FLDS`
  (`no`, `year`, `id`, `created_at`) tidak dikirim, dan `scot_sanitize()` +
  `array_merge($cur, $clean)` di `api.php` mempertahankannya.
- **`year` sengaja tidak dihitung ulang.** `year` dipakai filter tahun di tab
  Completed dan ditetapkan sekali saat record dibuat. Kalau dihitung ulang setiap
  edit, memperbaiki ETA sebuah shipment lama akan diam-diam memindahkannya ke
  tahun lain. Editor hanya **mengisi** `year` kalau record-nya memang belum punya.
- **Polling 15 detik tetap aman**: `subscribeToPolling()` melewatkan tick selama
  `#mo` terbuka, jadi data tidak ditarik ulang di tengah pengetikan.
- **Race multi-user belum berubah.** Sama seperti seluruh CRUD SCOT: update
  memakai nomor baris hasil pembacaan, jadi kalau dua orang menyimpan shipment
  yang sama dalam hitungan milidetik, yang terakhir menang. Editor ini tidak
  memperburuk maupun memperbaiki hal itu.
- **Hak akses tidak berubah**: siapa pun yang sudah punya akses `scot` memang
  sudah bisa menambah & mengupdate data lewat panel Update & Export.

## Verifikasi

Dijalankan lokal dengan server tiruan (Node) yang meniru `scot/api.php`
(GET/PUT `shipments`), memakai 3 data contoh: 1 Import `Done`, 1 Domestic `Done`,
1 Import `On Going`.

- `node --check` untuk `ui.js`, `forms.js`, `main.js`, `alerts.js` — lolos.
- Tombol ✏️ Edit muncul di kartu tab **Completed** dan **In Progress**.
- Buka editor pada shipment `Done` → 34 kolom terisi benar.
- Ubah 4 kolom (Quantity, SPJM, Warehouse Location, Remarks) → review menampilkan
  **tepat 4 baris** perubahan, bukan seluruh kolom.
- **← Kembali** → ketikan yang belum disimpan tetap ada.
- **Setujui & Simpan** → request `PUT /scot/api/shipments/1` berisi seluruh kolom
  writable dengan hanya 4 nilai yang berubah; `no` dan `year` tidak ikut terkirim.
- Setelah simpan: modal tertutup, kartu menampilkan 450,2 MT + badge "Modified",
  KPI Tonnage ikut naik (449,7 → 455,2 MT).
- Penjaga tutup: tanpa perubahan → menutup tanpa tanya; ada perubahan + "tidak"
  → modal tetap terbuka dan isian utuh; "ya" → tertutup dan state dibersihkan.
- Baris popup KPI dan baris tabel Alerts membuka editor yang benar.
- Lebar 375px: form jadi 1 kolom, baris tombol tetap sticky.
- Tidak ada error di console.

## Sisa / risiko

- **Link dokumen belum ada di modal ini.** Bagian "📎 Document Links" masih hanya
  di panel Update & Export, yang tidak melayani shipment `Done` — jadi lampiran
  untuk shipment selesai masih belum bisa dikelola dari UI. Perlu refactor
  `renderOgDocs()`/`loadOgDocs()` supaya menerima elemen host, baru bisa dipasang
  di modal. Belum dikerjakan.
- **Belum ada jejak audit siapa mengedit apa.** Sheet `shipments` hanya menyimpan
  `updated_at`. Kalau nanti dibutuhkan, tambahkan kolom `updated_by` dan isi dari
  `sc_user()` di `api.php`.
- Belum ada tes otomatis untuk JS SCOT (modul ini memang belum punya harness JS);
  verifikasi di atas manual lewat browser + server tiruan.
