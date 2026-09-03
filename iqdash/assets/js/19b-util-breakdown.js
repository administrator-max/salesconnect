/* ═══════════════════════════════════════════════════════════════════════════
   UTILIZATION BREAKDOWN — rincian per lot dari Input Manual (Sales)
   ───────────────────────────────────────────────────────────────────────────
   Diminta tim 28-Agu-2026: bisa dibuka dengan mengklik company/produk, supaya
   tidak perlu membuka tab Input Manual hanya untuk melihat kapan kuota dipakai
   dan kapan barangnya tiba.

   Kolomnya: Company · Product · Obtained · Utilization (MT) · Utilization Date
   · ETA JKT — persis yang diminta.

   SATU HAL YANG MEMBUAT RINCIAN INI BISA MENYESATKAN, dan cara menanganinya:

   Tidak semua utilisasi punya lot. Sebagian datang dari rincian siklus master
   (cycle_utilization) yang belum pernah dirinci Sales per lot. Kalau modal ini
   hanya menampilkan lot, jumlah rinciannya akan LEBIH KECIL dari angka
   Utilized yang tertulis di baris yang barusan diklik — pembacanya wajar
   menyimpulkan ada data hilang. BTS SHEET PILE persis begitu: 1.939 MT
   terpakai, tapi lot Sales hanya mencatat 1.514.

   Jadi selisihnya DICETAK sebagai satu baris tersendiri yang menyebut
   sumbernya master, bukan disembunyikan dan bukan pula diam-diam dibagi ke
   lot yang ada. Dengan begitu Σ rincian selalu sama dengan Utilized.
   ═══════════════════════════════════════════════════════════════════════════ */

const UB_EPS = 0.001;

/* Company dari SPI maupun PENDING — halaman Available Quota memuat keduanya. */
function _ubCari(code) {
  const dari = (arr) => (Array.isArray(arr) ? arr.find(c => c && c.code === code) : null);
  return dari(typeof SPI !== 'undefined' ? SPI : null)
      || dari(typeof PENDING !== 'undefined' ? PENDING : null)
      || null;
}

function _ubKanon(p) {
  return (typeof canonicalProduct === 'function')
    ? canonicalProduct(String(p || '').trim())
    : String(p || '').trim();
}

/**
 * Rincian utilisasi satu (company, produk).
 * @returns {{rows: Array, obtained: number, util: number, sigmaLot: number}}
 */
function utilBreakdownRows(code, product) {
  const co = _ubCari(code);
  const kp = _ubKanon(product);
  const kosong = { rows: [], obtained: 0, util: 0, sigmaLot: 0 };
  if (!co || !kp) return kosong;

  const obtMap = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
  const utilMap = (typeof allTimeUtilByProd === 'function') ? allTimeUtilByProd(co) : (co.utilizationByProd || {});
  const ambil = (peta) => {
    let n = 0;
    Object.entries(peta || {}).forEach(([p, v]) => { if (_ubKanon(p) === kp) n += Number(v) || 0; });
    return n;
  };
  const obtained = ambil(obtMap);
  const util     = ambil(utilMap);

  /* Lot Sales. Ejaan produk di `shipments` bisa berbeda dari ejaan stats
     (ledger "GL BORON" vs stats "GL ALLOY"), jadi dicocokkan secara kanonik —
     bukan lewat kesamaan huruf. */
  const rows = [];
  let sigmaLot = 0;
  Object.entries(co.shipments || {}).forEach(([prod, lots]) => {
    if (_ubKanon(prod) !== kp) return;
    (lots || []).forEach((l) => {
      const mt = Number(l && l.utilMT) || 0;
      if (!(mt > UB_EPS)) return;          // lot kosong bukan peristiwa
      sigmaLot += mt;
      rows.push({
        code, product: kp, obtained,
        lot: l.lotNo || '',
        utilMT: mt,
        utilDate: l.utilDate || '',
        etaJKT: l.etaJKT || '',
        note: l.note || '',
        sumber: 'sales',
      });
    });
  });

  /* Urut menurut tanggal pemakaian; yang tak bertanggal di belakang supaya
     tidak menyamar sebagai yang paling awal. */
  const kunciHari = (s) => {
    if (typeof utilDayKey === 'function') { const k = utilDayKey(s); if (k) return k; }
    const d = (typeof pDate === 'function') ? pDate(s) : null;
    return d ? d.toISOString().slice(0, 10) : '';
  };
  rows.sort((a, b) => {
    const ka = kunciHari(a.utilDate), kb = kunciHari(b.utilDate);
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  /* Sisa yang belum dirinci per lot — lihat catatan di kepala berkas. */
  const sisa = util - sigmaLot;
  if (sisa > UB_EPS) {
    const tgl = (co.utilCycles || [])
      .filter(u => _ubKanon(u && u.product) === kp && u.date)
      .map(u => u.date);
    rows.push({
      code, product: kp, obtained,
      lot: '—',
      utilMT: sisa,
      utilDate: tgl.length ? tgl.join(' · ') : '',
      etaJKT: '',
      note: '',
      sumber: 'master',
    });
  }

  return { rows, obtained, util, sigmaLot };
}

/* ── Modal ──────────────────────────────────────────────────────────────── */

function openUtilBreakdown(code, product) {
  const modal = document.getElementById('utilBreakdownModal');
  if (!modal) return;
  const { rows, obtained, util, sigmaLot } = utilBreakdownRows(code, product);
  const mt = (v) => (typeof fmtMt === 'function' ? fmtMt(v) : String(Math.round(v)));
  const tgl = (v) => (v && typeof fmtDateStd === 'function' ? (fmtDateStd(v) || v) : (v || ''));

  const judul = document.getElementById('utilBreakdownSubtitle');
  if (judul) {
    const nLot = rows.filter(r => r.sumber === 'sales').length;
    judul.textContent = `${code} · ${_ubKanon(product)} — ${nLot} lot dari Input Manual (Sales)`
      + (util > sigmaLot + UB_EPS ? ` + ${mt(util - sigmaLot)} MT dari master` : '');
  }

  const body = document.getElementById('utilBreakdownBody');
  if (body) {
    body.innerHTML = rows.length ? rows.map((r) => {
      const master = r.sumber === 'master';
      return `<tr style="border-top:1px solid var(--border)${master ? ';background:var(--bg2)' : ''}">
        <td style="padding:8px 14px"><span class="t-code" style="cursor:pointer" onclick="closeUtilBreakdown();openDrawer('${r.code}')">${coLabel(r.code)}</span></td>
        <td style="padding:8px 10px"><span class="chip" style="background:#f0f9ff;color:#0369a1;font-size:10px;padding:2px 7px">${typeof prodLabel === 'function' ? prodLabel(r.product) : r.product}</span></td>
        <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace">${mt(r.obtained)}</td>
        <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--green);font-weight:700">${mt(r.utilMT)}</td>
        <td style="padding:8px 10px;font-size:11px">${tgl(r.utilDate) || '<span style="color:var(--txt3)">—</span>'}</td>
        <td style="padding:8px 10px;font-size:11px">${tgl(r.etaJKT) || '<span style="color:var(--txt3)">—</span>'}</td>
        <td style="padding:8px 14px;font-size:10px;color:var(--txt3)">${
          master
            ? '<span title="Belum dirinci per lot oleh Sales — berasal dari rincian siklus master">master · belum dirinci</span>'
            : `Lot ${r.lot}${r.note ? ' · ' + r.note : ''}`
        }</td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="padding:22px 14px;text-align:center;color:var(--txt3);font-size:11.5px">
        Belum ada utilisasi yang tercatat untuk produk ini.
      </td></tr>`;
  }

  const kaki = document.getElementById('utilBreakdownFoot');
  if (kaki) {
    /* Σ rincian dicetak berdampingan dengan angka Utilized supaya pembacanya
       bisa memeriksa sendiri bahwa tidak ada yang tertinggal. */
    const sigma = rows.reduce((s, r) => s + r.utilMT, 0);
    const cocok = Math.abs(sigma - util) <= 0.5;
    kaki.innerHTML = `<span style="font-weight:700">Σ rincian ${mt(sigma)} MT</span>`
      + ` · Utilized pada baris tabel ${mt(util)} MT`
      + (cocok
          ? ' <span style="color:var(--green);font-weight:700">✓ cocok</span>'
          : ` <span style="color:var(--red2);font-weight:700">⚠ selisih ${mt(Math.abs(sigma - util))} MT</span>`);
  }

  modal.style.display = 'block';
}

function closeUtilBreakdown() {
  const m = document.getElementById('utilBreakdownModal');
  if (m) m.style.display = 'none';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { utilBreakdownRows, openUtilBreakdown, closeUtilBreakdown };
}
