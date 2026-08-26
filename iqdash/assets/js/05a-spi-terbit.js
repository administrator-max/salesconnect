/* ═══════════════════════════════════════════════════════════════════════════
   TABEL UTAMA "PERTEK & SPI TERBIT"
   ───────────────────────────────────────────────────────────────────────────
   SATU baris per (company, produk). Susunan kolom yang diminta tim:

     No. | Company | Group | Cycle | Products | Submit (MT) | Obtained (MT) |
     Util (MT) | Status | Remarks | PERTEK No. | PERTEK Date | SPI No. |
     SPI Date | Validity Date | SPI Status

   Tabel ini MENGGANTIKAN dua tabel sekaligus: "Full SPI Table" (ringkasan per
   company) dan tabel Validity Date terpisah yang sempat berdiri sendiri.
   Alasannya diberikan tim 2026-08-26: datanya saling terkait, dan memisahkannya
   memaksa nama company dan produk dicetak dua kali di halaman yang sama.

   Yang HILANG dari tabel lama dan ke mana perginya:
     · "Current Status Only" → digantikan kolom Remarks, yang membaca Status
       Note dari Input Data (co.statusUpdate) sesuai permintaan tim.
     · "Status Update"        → sumbernya sama dengan Remarks; sebelumnya dua
       kolom membaca satu field, jadi satu di antaranya memang berlebih.
   Tidak ada kolom lain yang dibuang: Group, Util, Status, PERTEK No., dan SPI
   No. semuanya pindah ke sini apa adanya.

   Aturan Active/Inactive dan Validity Date TIDAK tinggal di berkas ini —
   semuanya di 01a-quota-year.js, dipakai bersama halaman Available Quota lewat
   activeValidityByProduct(). Satu aturan, satu tempat, supaya kedua halaman
   tidak bisa memberi dua jawaban untuk pertanyaan yang sama.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 'ALL' | 'COMPLETED' | 'UNDER' | 'PENDING' | 'NEWSUB' */
let spiTerbitFilter = 'ALL';

const _ST_PILL = { COMPLETED: 'completed', UNDER: 'under', PENDING: 'pending', NEWSUB: 'newsub' };

function setSpiTerbitFilter(f, el) {
  spiTerbitFilter = f;
  document.querySelectorAll('#spiTerbitPills .fpill').forEach(p => p.classList.remove('on'));
  if (el) el.classList.add('on');
  buildSpiTerbitTable();
}

/** Lencana SPI Status. Hanya dua kategori — plus penanda "belum terbit" untuk
 *  baris yang SPI-nya memang belum ada, karena menyebutnya Inactive akan
 *  berbohong: ia bukan expired dan bukan digantikan, ia belum terbit. */
function _stBadge(status) {
  if (status === 'active') {
    return `<span class="st-badge" style="background:var(--green-bg);color:var(--green);border-color:var(--green-bd)">🟢 Active</span>`;
  }
  if (status === 'inactive') {
    return `<span class="st-badge" style="background:var(--bg2);color:var(--txt3);border-color:var(--border2)">⚪ Inactive</span>`;
  }
  return `<span class="st-badge" style="background:var(--orange-bg);color:var(--orange);border-color:var(--orange-bd)">⏳ Belum terbit</span>`;
}

function _stProcessBadge(key, label) {
  const warna = key === 'completed' ? ['var(--green-bg)', 'var(--green)', 'var(--green-bd)']
              : key === 'under'     ? ['var(--amber-bg)', 'var(--amber)', 'var(--amber-bd)']
              : key === 'pending'   ? ['var(--orange-bg)', 'var(--orange)', 'var(--orange-bd)']
              :                       ['var(--red-bg)', 'var(--red2)', 'var(--red-bd)'];
  return `<span class="st-badge" style="background:${warna[0]};color:${warna[1]};border-color:${warna[2]}">${label}</span>`;
}

const _stDash = () => '<span style="color:var(--txt3)">—</span>';
const _stEsc  = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildSpiTerbitTable() {
  const tbody = document.getElementById('spiTerbitBody');
  if (!tbody) return;

  const all = (typeof spiTerbitRows === 'function') ? spiTerbitRows() : [];
  const q   = ((document.getElementById('spiTerbitQ') || {}).value || '').trim().toLowerCase();

  /* Angka di pil dihitung dari BARIS yang sama dengan isi tabel — bukan dari
     daftar company terpisah. Dulu keduanya diturunkan sendiri-sendiri dan bisa
     berbeda tanpa ada yang menyadarinya. */
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('stPillAll',       all.length);
  setTxt('stPillCompleted', all.filter(r => r.processKey === 'completed').length);
  setTxt('stPillUnder',     all.filter(r => r.processKey === 'under').length);
  setTxt('stPillPending',   all.filter(r => r.processKey === 'pending').length);
  setTxt('stPillNewsub',    all.filter(r => r.processKey === 'newsub').length);

  const rows = all.filter(r => {
    const want = _ST_PILL[spiTerbitFilter];
    if (want && r.processKey !== want) return false;
    if (!q) return true;
    return r.code.toLowerCase().includes(q)
        || String(r.product).toLowerCase().includes(q)
        || String(r.group).toLowerCase().includes(q)
        || String(r.spiNo).toLowerCase().includes(q)
        || String(r.pertekNo).toLowerCase().includes(q)
        || String(r.remarks).toLowerCase().includes(q);
  });

  const fd = v => (typeof fmtDateStd === 'function' ? (fmtDateStd(v) || _stDash()) : (v || _stDash()));
  const pl = p => (typeof prodLabel === 'function' ? prodLabel(p) : p);
  const mt = v => (v == null ? _stDash() : (typeof fmtMt === 'function' ? fmtMt(v) : v));

  /* Nama company hanya dicetak pada baris PERTAMA tiap company. Permintaan tim:
     "tidak perlu menampilkan data company/product berulang kali". Barisnya tetap
     berdiri sendiri dan tetap ikut disaring — yang disembunyikan hanya
     pengulangan teksnya, bukan datanya. */
  let prevCode = null;

  tbody.innerHTML = rows.map((r, i) => {
    const mati    = r.status !== 'active';
    const baru    = r.code !== prevCode;
    prevCode      = r.code;
    const buka    = r.section === 'PENDING' ? 'openDrawerPending' : 'openDrawer';
    const judul   = _stEsc(r.reason);
    const sisipan = baru ? '' : 'opacity:.5';

    return `<tr style="${mati ? 'opacity:.62;' : ''}${baru ? 'border-top:1px solid var(--border)' : ''}" title="${judul}">
      <td class="t-r" style="font-size:10px;color:var(--txt3)">${i + 1}</td>
      <td>${baru
        ? `<div class="t-code" onclick="${buka}('${r.code}')">${r.code}</div>`
        : `<div class="t-code" style="${sisipan}" onclick="${buka}('${r.code}')">${r.code}</div>`}</td>
      <td style="font-size:11px;font-weight:600;${sisipan}">${r.group || _stDash()}</td>
      <td style="font-size:10px;color:var(--txt3);white-space:nowrap">${r.cycle || _stDash()}</td>
      <td><span class="chip" style="background:#f0f9ff;color:#0369a1;font-size:10px;padding:2px 7px">${pl(r.product)}</span></td>
      <td class="t-r t-mono">${r.submitMT ? mt(r.submitMT) : _stDash()}</td>
      <td class="t-r t-mono" style="color:var(--teal);font-weight:700">${r.obtainedMT ? mt(r.obtainedMT) : _stDash()}</td>
      <td class="t-r t-mono" style="color:var(--blue)">${r.utilMT ? mt(r.utilMT) : _stDash()}</td>
      <td>${baru ? _stProcessBadge(r.processKey, r.processLabel) : ''}</td>
      <td style="font-size:10px;color:var(--txt3);max-width:190px;line-height:1.4">${baru ? (_stEsc(r.remarks) || _stDash()) : ''}</td>
      <td style="font-size:10px;font-family:'DM Mono',monospace;color:var(--blue)">${r.pertekNo || _stDash()}</td>
      <td style="font-size:10.5px;color:var(--orange);white-space:nowrap">${fd(r.pertekDate)}</td>
      <td style="font-size:10px;font-family:'DM Mono',monospace;color:var(--teal)">${r.spiNo || _stDash()}</td>
      <td style="font-size:10.5px;color:var(--teal);white-space:nowrap">${fd(r.spiDate)}</td>
      <td style="font-size:10.5px;font-weight:700;color:${mati ? 'var(--txt3)' : 'var(--navy)'};white-space:nowrap">${fd(r.validityDate)}</td>
      <td>${_stBadge(r.status)}</td>
    </tr>`;
  }).join('');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="16" style="padding:22px;text-align:center;color:var(--txt3);font-size:11.5px">
      Tidak ada data untuk tahun kuota ${QUOTA_YEAR}${q ? ' yang cocok dengan pencarian' : ''}.
    </td></tr>`;
  }

  const foot = document.getElementById('spiTerbitFoot');
  if (foot) {
    const nAktif  = rows.filter(r => r.status === 'active').length;
    const nMati   = rows.filter(r => r.status === 'inactive').length;
    const nBelum  = rows.filter(r => r.status === 'none').length;
    foot.innerHTML =
      `<span>${rows.length} baris · ${new Set(rows.map(r => r.code)).size} company · tahun kuota <strong>${QUOTA_YEAR}</strong></span>` +
      `<span style="margin-left:14px"><span class="ldot" style="background:var(--green-bd)"></span>${nAktif} Active</span>` +
      (nMati  ? `<span><span class="ldot" style="background:var(--border2)"></span>${nMati} Inactive — data historis, tidak ikut hitungan kuota aktif</span>` : '') +
      (nBelum ? `<span><span class="ldot" style="background:var(--orange-bd)"></span>${nBelum} SPI belum terbit</span>` : '') +
      `<span style="margin-left:auto;text-align:right;line-height:1.5;max-width:46%">` +
      `Obtained = kuota bersih yang dipegang produk itu sekarang (master per-produk). ` +
      `Dokumen yang tertera adalah PERTEK &amp; SPI yang <strong>terakhir terbit</strong> — SPI Perubahan mengalahkan SPI awal.` +
      `</span>`;
  }

  /* Jumlah company yang punya revisi berjalan, dicetak di kepala panel yang
     dilipat — supaya pemakai tahu ada isinya tanpa harus membukanya. */
  const rc = document.getElementById('revSummaryCount');
  if (rc && typeof filteredSPI === 'function') {
    const n = filteredSPI().filter(d => d.revType && d.revType !== 'none').length;
    rc.textContent = n;
  }
}
