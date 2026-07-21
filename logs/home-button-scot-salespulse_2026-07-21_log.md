# Home button (🏠 SalesConnect) on scot & salespulse

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Menambah tombol **🏠 SalesConnect** (link ke `../`, kembali ke landing) di modul yang belum punya:
scot dan salespulse (halaman executive + dashboard). cil/taskflow/costcore sudah punya.

## Perubahan
- `scot/assets/index.html` — link SalesConnect di header (sebelah tombol Settings).
- `salespulse/assets/index.html` — link SalesConnect di `h-actions`.
- `salespulse/assets/executive.html` — link SalesConnect di sebelah nav "Dashboard".

## Verifikasi / uji
- Semua 5 modul kini punya tombol kembali ke SalesConnect (`href="../"`).
- Dropdown bisnis semuanya data-driven di config sheets: CIL (channels/priorities/complaint_statuses),
  scot (cargo_types/shipment_types/shipment_routes/cargo_statuses/statuses/document_types),
  costcore (payment_terms/hedging_days/shipment_types/margin_types/commission_units). taskflow staff
  & salespulse products/aliases = data-driven. Bulan (kalender) & selector view-mode bukan config.

## Sisa / risiko
- Deploy via push (CI git-ftp). Verifikasi visual di Chrome setelah deploy.
