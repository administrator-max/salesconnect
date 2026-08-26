/* ═══════════════════════════════════════════════════════════════════════════
   TABEL "PERTEK & SPI TERBIT"
   ───────────────────────────────────────────────────────────────────────────
   Satu baris per SPI TERBIT per produk — bukan per company. Susunan kolomnya
   persis yang diminta tim:

     Company | Type | Cycle | Product | Submit (MT) | Obtained (MT) |
     PERTEK Date | PERTEK No. | SPI Date | SPI No. | Validity Date | SPI Status

   Tabel ini DITAMBAHKAN, bukan mengganti. Ringkasan per company di atasnya
   (Submission & Revision Summary + Full SPI Table) membawa kolom yang tidak ada
   di sini — Group, Util (MT), Status Update, Current Status Only — dan
   membuangnya berarti menghilangkan informasi yang sudah dipakai orang.

   Angka MT di sini adalah nilai HISTORIS: apa yang diberikan dokumen itu pada
   saat terbit. Saldo bersih terkini per produk ada di halaman Available Quota.
   Keduanya sengaja berbeda peran, dan itu dinyatakan di kaki tabel supaya tidak
   ada yang membandingkan dua angka yang memang tidak dimaksudkan sama.

   Aturan Active/Inactive dan Validity Date TIDAK tinggal di sini — semuanya di
   01a-quota-year.js, dipakai bersama halaman Available Quota. Satu aturan, satu
   tempat.
   ═══════════════════════════════════════════════════════════════════════════ */

let spiTerbitFilter = 'ALL';   // 'ALL' | 'ACTIVE' | 'INACTIVE'

function setSpiTerbitFilter(f, el) {
  spiTerbitFilter = f;
  document.querySelectorAll('#spiTerbitPills .fpill').forEach(p => p.classList.remove('on'));
  if (el) el.classList.add('on');
  buildSpiTerbitTable();
}

function _stBadge(status) {
  return status === 'active'
    ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd);white-space:nowrap">🟢 Active</span>`
    : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--bg2);color:var(--txt3);border:1px solid var(--border2);white-space:nowrap">⚪ Inactive</span>`;
}

function _stDash() { return '<span style="color:var(--txt3)">—</span>'; }

function buildSpiTerbitTable() {
  const tbody = document.getElementById('spiTerbitBody');
  if (!tbody) return;

  const all = (typeof spiTerbitRows === 'function') ? spiTerbitRows() : [];
  const q   = ((document.getElementById('spiTerbitQ') || {}).value || '').trim().toLowerCase();

  const nActive   = all.filter(r => r.status === 'active').length;
  const nInactive = all.length - nActive;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('stPillAll',      all.length);
  setTxt('stPillActive',   nActive);
  setTxt('stPillInactive', nInactive);

  let rows = all.filter(r => {
    if (spiTerbitFilter === 'ACTIVE'   && r.status !== 'active')   return false;
    if (spiTerbitFilter === 'INACTIVE' && r.status !== 'inactive') return false;
    if (!q) return true;
    return r.code.toLowerCase().includes(q)
        || String(r.product).toLowerCase().includes(q)
        || String(r.spiNo).toLowerCase().includes(q)
        || String(r.pertekNo).toLowerCase().includes(q);
  });

  const fd  = v => (typeof fmtDateStd === 'function' ? (fmtDateStd(v) || _stDash()) : (v || _stDash()));
  const pl  = p => (typeof prodLabel === 'function' ? prodLabel(p) : p);
  const mt  = v => (v == null ? _stDash() : (typeof fmtMt === 'function' ? fmtMt(v) : v));

  tbody.innerHTML = rows.map(r => {
    const mati = r.status !== 'active';
    /* Baris Inactive DIREDUPKAN, tidak dibuang: tim memintanya tetap tersimpan
       sebagai data historis. Yang dipisahkan adalah PERANNYA — ia tidak ikut
       menghitung kuota aktif, bukan tidak boleh dilihat. */
    const dim = mati ? 'opacity:.62' : '';
    return `<tr style="${dim}" title="${r.reason.replace(/"/g, '&quot;')}">
      <td><div class="t-code" onclick="${r.section === 'PENDING' ? 'openDrawerPending' : 'openDrawer'}('${r.code}')">${r.code}</div>${r.group ? `<div class="t-sub">${r.group}</div>` : ''}</td>
      <td style="font-size:10.5px;font-weight:600;color:${r.isRevision ? 'var(--violet)' : 'var(--txt2)'};white-space:nowrap">${r.type || _stDash()}</td>
      <td style="font-size:10.5px;color:var(--txt3);white-space:nowrap">${r.cycle || _stDash()}</td>
      <td><span class="chip" style="background:#f0f9ff;color:#0369a1;font-size:10px;padding:2px 7px">${pl(r.product)}</span></td>
      <td class="t-r t-mono">${mt(r.submitMT)}</td>
      <td class="t-r t-mono" style="color:var(--teal);font-weight:700">${mt(r.obtainedMT)}</td>
      <td style="font-size:10.5px;color:var(--orange);white-space:nowrap">${fd(r.pertekDate)}</td>
      <td style="font-size:10px;font-family:'DM Mono',monospace;color:var(--blue)">${r.pertekNo || _stDash()}</td>
      <td style="font-size:10.5px;color:var(--teal);white-space:nowrap">${fd(r.spiDate)}</td>
      <td style="font-size:10px;font-family:'DM Mono',monospace;color:var(--teal)">${r.spiNo || _stDash()}</td>
      <td style="font-size:10.5px;font-weight:700;color:${mati ? 'var(--txt3)' : 'var(--navy)'};white-space:nowrap">${fd(r.validityDate)}</td>
      <td>${_stBadge(r.status)}</td>
    </tr>`;
  }).join('');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="padding:22px;text-align:center;color:var(--txt3);font-size:11.5px">
      Tidak ada SPI terbit untuk tahun kuota ${QUOTA_YEAR}${q ? ' yang cocok dengan pencarian' : ''}.
    </td></tr>`;
  }

  /* Yang TIDAK ditampilkan dinyatakan, tidak dibiarkan hilang diam-diam:
     siklus SPI Perubahan yang tercatat tanpa rincian produk sama sekali (MT 0,
     produk kosong) tidak punya isi untuk kolom Product/Submit/Obtained. Ia
     tetap dipakai untuk menentukan SPI mana yang paling akhir dan karena itu
     Validity Date-nya — hanya barisnya yang tidak dicetak. Menebak nama
     produknya dilarang aturan master #6. */
  const foot = document.getElementById('spiTerbitFoot');
  if (foot) {
    const dilewati = all.skippedDocOnly || 0;
    foot.innerHTML =
      `<span>${rows.length} baris · ${new Set(rows.map(r => r.code)).size} company · tahun kuota <strong>${QUOTA_YEAR}</strong></span>` +
      `<span style="margin-left:auto;text-align:right;line-height:1.5">` +
      `Submit / Obtained = MT yang tercatat pada dokumen itu saat terbit (nilai historis). Saldo bersih terkini ada di <strong>Available Quota</strong>.` +
      (dilewati ? `<br><span style="color:var(--amber)">⚠ ${dilewati} SPI Perubahan tidak ditampilkan karena tercatat tanpa rincian produk — tetap dipakai untuk menentukan Validity Date.</span>` : '') +
      `</span>`;
  }
}
