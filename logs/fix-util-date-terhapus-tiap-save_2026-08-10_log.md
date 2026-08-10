# [fix-util-date-terhapus-tiap-save] 2026-08-10 — bugnya nyata: Tgl Utilisasi disapu setiap kali Save

- **Tanggal:** 2026-08-10
- **Pemicu:** "atasanku ngisi tanggalnya di GKL terus ilang, berarti kan nge bug".

## Benar, memang bug. Saya keliru sebelumnya.

Pagi tadi saya simpulkan jalur simpannya sehat dan menduga halaman atasan
memakai JS versi lama. **Dugaan itu salah.** Buktinya muncul saat memeriksa
sumbernya langsung:

```
baris di company_shipments yang punya util_date: 0
```

**Nol.** Bukan cuma GKL — seluruh tab. Setiap tanggal yang pernah tim isi
sudah hilang. Yang saya "verifikasi" pagi tadi memang tersimpan; yang
membunuhnya adalah simpan **berikutnya**.

## Sebabnya: dua penyimpan, satu lupa membawa tanggal

Baris lot ditulis **utuh** — field yang tidak dikirim tertulis `''`.

| penyimpan | membawa `utilDate`? |
|---|---|
| `11-shipment.js` `patchShipmentsToServer()` (tombol 💾 per lot) | ya |
| `16-storage.js` `patchToServer()` (**tombol Save utama**) | **tidak** |

Jadi begitu siapa pun menekan Save di company mana pun, tanggal **seluruh
lot** company itu tersapu — tanpa pesan apa pun. Ketujuh baris GKL memang
membawa cap waktu yang identik, tanda satu penulisan borongan.

Itu juga menjelaskan kenapa terasa "kadang hilang, kadang tidak": tergantung
apakah sesudah mengisi tanggal ada yang menekan Save.

## Perbaikan

**1. Penyebab langsung** — `16-storage.js` kini menyertakan `utilDate`.

**2. Di sumber, supaya tidak bisa terulang** — `iqdash_write.php` kini
membedakan **absen** dari **kosong**:

- kirim `''` → hapus (disengaja)
- tidak kirim sama sekali → **pertahankan yang tersimpan**

Penyimpan yang lupa jadi tidak berbahaya. Ini yang mencegah bug yang sama
lahir lagi lewat pintu lain.

**3. Bentuk objek lot diseragamkan** — pembangun lot cadangan di
`iqdash_data.php` dan lot baru di `10-edit-form.js` kini ikut membawa
`utilDate`. Lot yang sampai ke frontend tanpa field itu akan dikirim balik
kosong.

**4. Uji regresi** — `tests/test_util_date_not_wiped.cjs`: memastikan kedua
payload membawa field yang sama, dan setiap pembangun lot (JS maupun PHP)
menyertakan tanggal. Diuji-mutasi: membuang `utilDate` dari Save utama
membuatnya gagal, bukan lolos diam-diam.

## Verifikasi

Diuji persis seperti pemakaian nyata — isi tanggal, lalu tekan **Save utama**
(penyapu lama):

```
model sesudah ketik      : 05 August 2026
setelah Save, dari server: 05 August 2026   <- dulu jadi ''
di sheet                 : 05 August 2026
```

GKL: obtained 3.000 · used **3.000** · available **0** · keluar dari halaman
Available Quota. Total: obtained 34.740 · utilized 23.447 · realized
15.438,208 · available 11.513 · pending shipment 8.008,792. Company di
Available Quota: 9.

Suite: 0 gagal.

## Sisa

Tanggal yang sudah telanjur terhapus **tidak bisa dipulihkan** — nilainya tidak
tersimpan di mana pun. Tim perlu mengisi ulang Tgl Utilisasi. Mulai sekarang
isian itu bertahan.
