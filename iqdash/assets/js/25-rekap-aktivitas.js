/* ════════════════════════════════════════════════════════════════════
   25-rekap-aktivitas.js — dua fitur yang diminta tim 20-Okt-2026:

   1. REKAP PERIODE (tombol "📊 Rekap Periode" di halaman Utilization &
      Realization). David selama ini membaca utilisasi/realisasi per PT;
      tidak ada cara melihat "berapa total di Januari" lintas PT.
      Angkanya SENGAJA tidak dihitung sendiri: setiap bulan dijalankan lewat
      _asOfPeriod() dengan pasangan resmi kartu KPI —
        utilisasi  = utilizationPool(kpiPool()) × scopedUtilTotal()
                     (persis reportUtilizedTotal)
        realisasi  = realizedByCompany() (Σ = reportRealizedTotal, PIB date)
      jadi rekap Januari selalu sama dengan kartu saat filter Periode = Januari.
      Lihat memori "kartu punya pasangan kanonik".

   2. LOG AKTIVITAS + konfirmasi setiap simpan. Setelah kasus EMS/KJK (input
      tersimpan tapi tidak terhitung, dan baru ketahuan karena ditanyakan),
      setiap penulisan dicatat server (iqdash_activity.php) beserta EFEKNYA
      pada angka dashboard. Di sini:
        · pencegat fetch: setiap simpan ke api/company|realizations → beberapa
          detik kemudian muncul notifikasi "✓ tersimpan & terhitung" atau
          "⚠ tersimpan TAPI angka dashboard tidak berubah — sebabnya …";
        · tombol "🧾 Log Aktivitas" di topbar: riwayat semua input tim,
          lencana merah = jumlah peringatan 7 hari terakhir.
      Pencegat dipasang di fetch, bukan di 14 titik simpan, supaya fitur input
      BARU otomatis ikut tercatat.
   ════════════════════════════════════════════════════════════════════ */

/* ── util kecil ───────────────────────────────────────────────────── */
function _rkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _rkMt(v) { return (typeof fmtMt === 'function') ? fmtMt(Number(v) || 0) : String(Math.round(v)); }
function _rkReal(v) {
  // Realisasi tidak dibulatkan ke atas (aturan 21-Mei-2026) — 2 desimal.
  return (Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function _rkProd(p) { return (typeof canonicalProduct === 'function') ? canonicalProduct(p) : p; }
const _RK_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function _rkModal(id, judul, sub, isiHtml, lebar) {
  let m = document.getElementById(id);
  if (!m) {
    m = document.createElement('div');
    m.id = id;
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:720;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)';
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
    document.body.appendChild(m);
  }
  m.innerHTML = `
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(94vw,${lebar || 920}px);max-height:90vh;background:var(--bg);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden">
    <div style="padding:14px 20px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0">
      <div><div style="font-size:15px;font-weight:700;color:var(--txt)">${judul}</div>
        <div id="${id}Sub" style="font-size:11px;color:var(--txt3);margin-top:2px">${sub}</div></div>
      <button onclick="document.getElementById('${id}').style.display='none'" style="background:var(--border);border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:var(--txt3)">✕</button>
    </div>
    ${isiHtml}
  </div>`;
  m.style.display = 'block';
  return m;
}

/* ═══════════════════════ 1. REKAP PERIODE ═══════════════════════════ */

/** Hitung rekap untuk jendela [from, to] memakai aturan kartu KPI. */
function rekapPeriodeHitung(from, to) {
  return _asOfPeriod(from, to, () => {
    const modeLama = (typeof FILTER_MODE !== 'undefined') ? FILTER_MODE : null;
    if (modeLama !== null) FILTER_MODE = 'both';     // utilisasi = tgl util, realisasi = tgl PIB
    try {
      const baris = {};
      const isi = code => baris[code] || (baris[code] = { code, util: 0, utilProd: {}, real: 0, realProd: {} });
      utilizationPool(kpiPool()).forEach(co => {
        const v = scopedUtilTotal(co);
        if (!(v > 0.0005)) return;
        const b = isi(co.code);
        b.util += v;
        Object.entries(scopedUtilByProd(co) || {}).forEach(([p, mt]) => {
          if ((Number(mt) || 0) > 0.0005) { const k = _rkProd(p); b.utilProd[k] = (b.utilProd[k] || 0) + Number(mt); }
        });
      });
      const real = realizedByCompany();
      const realProd = (typeof realizedByCompanyProd === 'function') ? realizedByCompanyProd() : {};
      Object.entries(real).forEach(([code, mt]) => {
        if (!(mt > 0.0005)) return;
        const b = isi(code);
        b.real += mt;
        Object.entries(realProd[code] || {}).forEach(([p, v]) => {
          const k = p === '__tanpa' ? 'Produk tak dikenali' : p;
          b.realProd[k] = (b.realProd[k] || 0) + v;
        });
      });
      const rows = Object.values(baris).sort((a, b) => (b.util + b.real) - (a.util + a.real));
      return {
        rows,
        util: rows.reduce((s, r) => s + r.util, 0),
        real: rows.reduce((s, r) => s + r.real, 0),
      };
    } finally {
      if (modeLama !== null) FILTER_MODE = modeLama;
    }
  });
}

function _rkDaftarBulan() {
  // Okt 2025 (awal data) s/d Desember tahun kuota yang dipilih.
  const akhir = new Date(Math.max(new Date().getFullYear(), (typeof QUOTA_YEAR !== 'undefined' ? +QUOTA_YEAR : 2026)), 11, 1);
  const out = [];
  for (let d = new Date(2025, 9, 1); d <= akhir; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, t: `${_RK_BULAN[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}
function _rkKeTanggal(v, akhir) {
  const [y, m] = v.split('-').map(Number);
  return akhir ? new Date(y, m, 0, 23, 59, 59) : new Date(y, m - 1, 1);
}

function openRekapPeriode() {
  const bulan = _rkDaftarBulan();
  const kini = new Date();
  const ini = `${kini.getFullYear()}-${String(kini.getMonth() + 1).padStart(2, '0')}`;
  const pilih = bulan.some(b => b.v === ini) ? ini : bulan[bulan.length - 1].v;
  const opsi = sel => bulan.map(b => `<option value="${b.v}"${b.v === sel ? ' selected' : ''}>${b.t}</option>`).join('');
  const tombol = (lbl, act) => `<button onclick="${act}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:14px;border:1px solid var(--border2);background:transparent;color:var(--txt2);cursor:pointer">${lbl}</button>`;
  _rkModal('rekapModal', '📊 Rekap Utilization &amp; Realization',
    `Semua PT · tahun kuota ${typeof QUOTA_YEAR !== 'undefined' ? QUOTA_YEAR : ''} · Utilization menurut tanggal utilisasi, Realization menurut tanggal PIB · angka sama dengan kartu saat filter Periode dipasang`,
    `<div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--bg2);flex-shrink:0">
       <span style="font-size:11px;font-weight:700;color:var(--txt3)">Dari</span>
       <select id="rkDari" onchange="rekapRender()" style="font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--border2)">${opsi(pilih)}</select>
       <span style="font-size:11px;font-weight:700;color:var(--txt3)">s/d</span>
       <select id="rkSampai" onchange="rekapRender()" style="font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--border2)">${opsi(pilih)}</select>
       ${tombol('Bulan ini', `rekapSetel('${ini}','${ini}')`)}
       ${tombol('Bulan lalu', 'rekapBulanLalu()')}
       ${tombol(`Jan–${_RK_BULAN[kini.getMonth()]} ${kini.getFullYear()}`, `rekapSetel('${kini.getFullYear()}-01','${ini}')`)}
       <button onclick="rekapExcel()" style="margin-left:auto;font-size:11px;font-weight:700;padding:5px 11px;border-radius:var(--r);border:1px solid var(--green-bd);background:var(--green-bg);color:var(--green);cursor:pointer">⬇ Excel</button>
     </div>
     <div id="rkRingkas" style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:18px;flex-wrap:wrap;flex-shrink:0"></div>
     <div style="overflow-y:auto;flex:1">
       <div id="rkBulanan" style="padding:10px 20px 0"></div>
       <div id="rkTabel" style="padding:10px 20px 16px"></div>
     </div>`);
  rekapRender();
}
function rekapSetel(dari, sampai) {
  const a = document.getElementById('rkDari'), b = document.getElementById('rkSampai');
  if (a && b) { a.value = dari; b.value = sampai; rekapRender(); }
}
function rekapBulanLalu() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  rekapSetel(v, v);
}

let _rkTerakhir = null;
function rekapRender() {
  const a = document.getElementById('rkDari'), b = document.getElementById('rkSampai');
  if (!a || !b) return;
  let dari = a.value, sampai = b.value;
  if (dari > sampai) { [dari, sampai] = [sampai, dari]; a.value = dari; b.value = sampai; }
  const from = _rkKeTanggal(dari, false), to = _rkKeTanggal(sampai, true);
  const r = rekapPeriodeHitung(from, to);
  const label = (dari === sampai) ? a.options[a.selectedIndex].text : `${a.options[a.selectedIndex].text} – ${b.options[b.selectedIndex].text}`;

  // Per bulan (hanya bila rentangnya lebih dari satu bulan).
  const bulanan = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const x = rekapPeriodeHitung(new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59));
    bulanan.push({ v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, t: `${_RK_BULAN[d.getMonth()]} ${d.getFullYear()}`, util: x.util, real: x.real, nU: x.rows.filter(z => z.util > 0).length, nR: x.rows.filter(z => z.real > 0).length });
  }
  _rkTerakhir = { label, r, bulanan };

  const kotak = (lbl, val, warna, n) => `<div><div style="font-size:18px;font-weight:800;color:${warna};font-family:'DM Mono',monospace">${val}</div>
     <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3)">${lbl} · ${n} PT</div></div>`;
  document.getElementById('rkRingkas').innerHTML =
    `<div style="font-size:12px;font-weight:700;color:var(--navy);align-self:center;min-width:120px">${_rkEsc(label)}</div>`
    + kotak('Utilization (MT)', _rkMt(r.util), 'var(--orange)', r.rows.filter(z => z.util > 0).length)
    + kotak('Realization (MT)', _rkReal(r.real), 'var(--green)', r.rows.filter(z => z.real > 0).length);

  const th = 'style="text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--txt3);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg)"';
  const td = 'style="padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top"';
  document.getElementById('rkBulanan').innerHTML = bulanan.length > 1 ? `
    <div style="font-size:11px;font-weight:700;color:var(--txt2);margin-bottom:4px">Per bulan <span style="font-weight:500;color:var(--txt3)">· klik bulan untuk rinciannya</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px"><thead><tr>
      <th ${th}>Bulan</th><th ${th.replace('left', 'right')}>Utilization (MT)</th><th ${th.replace('left', 'right')}>Realization (MT)</th></tr></thead><tbody>
      ${bulanan.map(x => `<tr style="cursor:pointer" onclick="rekapSetel('${x.v}','${x.v}')" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
        <td ${td}>${x.t}</td><td ${td.replace('top', 'top;text-align:right')}>${_rkMt(x.util)} <span style="color:var(--txt3);font-size:10px">(${x.nU} PT)</span></td>
        <td ${td.replace('top', 'top;text-align:right')}>${_rkReal(x.real)} <span style="color:var(--txt3);font-size:10px">(${x.nR} PT)</span></td></tr>`).join('')}
    </tbody></table>` : '';

  const rinci = m => Object.entries(m).sort((x, y) => y[1] - x[1]).map(([p, v]) => `${_rkEsc(p)} ${p === 'Produk tak dikenali' ? _rkReal(v) : _rkMt(v)}`).join(' · ');
  document.getElementById('rkTabel').innerHTML = r.rows.length ? `
    <div style="font-size:11px;font-weight:700;color:var(--txt2);margin-bottom:4px">Per PT <span style="font-weight:500;color:var(--txt3)">· klik baris untuk membuka detail PT</span></div>
    <table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
      <th ${th}>PT</th><th ${th.replace('left', 'right')}>Utilization (MT)</th><th ${th}>Produk</th>
      <th ${th.replace('left', 'right')}>Realization (MT)</th><th ${th}>Produk</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr style="cursor:pointer" onclick="document.getElementById('rekapModal').style.display='none';setTimeout(()=>openDrawer('${_rkEsc(x.code)}'),80)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
        <td ${td}><strong>${_rkEsc(typeof coLabel === 'function' ? coLabel(x.code) : x.code)}</strong></td>
        <td ${td.replace('top', 'top;text-align:right;font-family:\'DM Mono\',monospace')}>${x.util > 0 ? _rkMt(x.util) : '—'}</td>
        <td ${td.replace('top', 'top;font-size:10.5px;color:var(--txt3)')}>${rinci(x.utilProd)}</td>
        <td ${td.replace('top', 'top;text-align:right;font-family:\'DM Mono\',monospace')}>${x.real > 0 ? _rkReal(x.real) : '—'}</td>
        <td ${td.replace('top', 'top;font-size:10.5px;color:var(--txt3)')}>${rinci(x.realProd)}</td></tr>`).join('')}
      <tr style="font-weight:800"><td ${td}>TOTAL</td><td ${td.replace('top', 'top;text-align:right')}>${_rkMt(r.util)}</td><td ${td}></td>
        <td ${td.replace('top', 'top;text-align:right')}>${_rkReal(r.real)}</td><td ${td}></td></tr>
    </tbody></table>`
    : `<div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px">Tidak ada utilisasi maupun realisasi pada ${_rkEsc(label)}.</div>`;
}

function rekapExcel() {
  if (!_rkTerakhir || typeof XLSX === 'undefined') { showToast('Excel belum siap — coba lagi sebentar', 'info'); return; }
  const { label, r, bulanan } = _rkTerakhir;
  const wb = XLSX.utils.book_new();
  const rinci = m => Object.entries(m).map(([p, v]) => `${p} ${Math.round(v * 1000) / 1000}`).join('; ');
  const per = [['Rekap Utilization & Realization', label], [],
    ['PT', 'Nama', 'Utilization (MT)', 'Produk (utilization)', 'Realization (MT)', 'Produk (realization)']]
    .concat(r.rows.map(x => [x.code, typeof coLabel === 'function' ? coLabel(x.code) : x.code,
      Math.round(x.util * 1000) / 1000, rinci(x.utilProd), Math.round(x.real * 1000) / 1000, rinci(x.realProd)]))
    .concat([['TOTAL', '', Math.round(r.util * 1000) / 1000, '', Math.round(r.real * 1000) / 1000, '']]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(per), 'Per PT');
  if (bulanan.length > 1) {
    const bl = [['Bulan', 'Utilization (MT)', 'PT', 'Realization (MT)', 'PT']]
      .concat(bulanan.map(x => [x.t, Math.round(x.util * 1000) / 1000, x.nU, Math.round(x.real * 1000) / 1000, x.nR]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bl), 'Per Bulan');
  }
  XLSX.writeFile(wb, `Rekap Utilization Realization - ${label.replace(/[^\w\- ]+/g, ' ').trim()}.xlsx`);
}

/* ═══════════════════════ 2. LOG AKTIVITAS ═══════════════════════════ */

const _AKT_GAYA = {
  ok:       { bg: '#dcfce7', bd: '#a7f3c4', fg: '#15803d', ico: '✓', teks: 'Tersimpan & terhitung' },
  warning:  { bg: '#ffedd5', bd: '#fdba74', fg: '#9a3412', ico: '⚠', teks: 'Tersimpan — perlu dicek' },
  nochange: { bg: '#e0f2fe', bd: '#c3d3f9', fg: '#1e3a8a', ico: 'ℹ', teks: 'Disimpan, tidak ada perubahan data' },
};

async function _aktAmbil(params) {
  const q = new URLSearchParams(params || {}).toString();
  const res = await fetch('api/activity' + (q ? '?' + q : ''), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return Array.isArray(j && j.activity) ? j.activity : [];
}

function _aktWaktu(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── notifikasi sesudah simpan ─────────────────────────────────────── */
function _aktToast(e) {
  const g = _AKT_GAYA[e.status] || _AKT_GAYA.ok;
  let host = document.getElementById('_aktToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = '_aktToastHost';
    host.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:1100;display:flex;flex-direction:column;gap:8px;max-width:min(440px,92vw)';
    document.body.appendChild(host);
  }
  const isi = e.status === 'warning' ? (e.peringatan || [])[0]
            : (e.dampak || [])[0] || (e.ringkas || [])[0] || '';
  const t = document.createElement('div');
  t.style.cssText = `background:${g.bg};border:1px solid ${g.bd};color:${g.fg};padding:10px 14px;border-radius:9px;font:600 12px 'DM Sans',sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.14);cursor:pointer;line-height:1.45`;
  t.title = 'Klik untuk membuka Log Aktivitas';
  t.innerHTML = `<div style="display:flex;gap:7px;align-items:baseline"><span style="font-size:14px">${g.ico}</span>
    <span><strong>${_rkEsc(e.company)}</strong> · ${_rkEsc(g.teks)}<br>
    <span style="font-weight:500">${_rkEsc(e.aksi)}${isi ? ' — ' + _rkEsc(isi) : ''}</span></span>
    <span style="margin-left:auto;padding-left:8px;opacity:.6" onclick="event.stopPropagation();this.closest('div[title]').remove()">✕</span></div>`;
  t.addEventListener('click', () => { t.remove(); openLogAktivitas(e.company); });
  host.appendChild(t);
  // Peringatan tetap terpasang sampai ditutup — itulah yang tidak boleh terlewat.
  if (e.status !== 'warning') setTimeout(() => t.remove(), 9000);
}

const _aktTunggu = { sejak: null, n: 0, timer: null, coba: 0, sudah: new Set() };
function _aktJadwalkan() {
  const now = Date.now();
  if (!_aktTunggu.sejak) _aktTunggu.sejak = new Date(now - 5000).toISOString().replace(/\.\d+Z$/, 'Z');
  _aktTunggu.n++;
  _aktTunggu.coba = 0;
  clearTimeout(_aktTunggu.timer);
  _aktTunggu.timer = setTimeout(_aktPeriksa, 5000);
}
async function _aktPeriksa() {
  const sejak = _aktTunggu.sejak;
  if (!sejak) return;
  let daftar = [];
  try { daftar = await _aktAmbil({ mine: 1, since: sejak, limit: 50 }); } catch (_) { daftar = []; }
  const baru = daftar.filter(e => !_aktTunggu.sudah.has(e.at + e.company + e.aksi)).reverse();
  baru.forEach(e => _aktTunggu.sudah.add(e.at + e.company + e.aksi));
  const tampil = baru.filter(e => e.status !== 'nochange' || baru.length === 1);
  tampil.slice(0, 3).forEach(_aktToast);
  if (tampil.length > 3) showToast(`+${tampil.length - 3} catatan lain — buka 🧾 Log Aktivitas`, 'info');
  if (baru.some(e => e.status === 'warning')) aktLencana();
  _aktTunggu.n -= baru.length;
  // Server mencatat SESUDAH menjawab; beri waktu kalau belum semua tercatat.
  if (_aktTunggu.n > 0 && ++_aktTunggu.coba <= 3) {
    _aktTunggu.timer = setTimeout(_aktPeriksa, 6000);
  } else {
    _aktTunggu.sejak = null; _aktTunggu.n = 0;
  }
}

(function pasangPencegat() {
  if (window.__aktFetchDipasang || typeof window.fetch !== 'function') return;
  window.__aktFetchDipasang = true;
  const asli = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await asli(input, init);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const m = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (m !== 'GET' && /api\/(company|realizations)\b/.test(url) && res.ok) _aktJadwalkan();
    } catch (_) { /* pencatat tidak boleh mengganggu penyimpanan */ }
    return res;
  };
})();

/* ── lencana & modal Log Aktivitas ─────────────────────────────────── */
async function aktLencana() {
  const el = document.getElementById('aktBadge');
  if (!el) return;
  try {
    const sejak = new Date(Date.now() - 7 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
    const n = (await _aktAmbil({ since: sejak, limit: 500 })).filter(e => e.status === 'warning').length;
    el.textContent = n; el.style.display = n ? 'flex' : 'none';
  } catch (_) { el.style.display = 'none'; }
}

let _aktData = [];
async function openLogAktivitas(company) {
  const kode = [].concat(typeof SPI !== 'undefined' ? SPI : [], typeof PENDING !== 'undefined' ? PENDING : [])
    .map(c => c.code).filter((v, i, a) => v && a.indexOf(v) === i).sort();
  const chip = (v, lbl) => `<button class="akt-chip" data-v="${v}" onclick="aktFilterStatus('${v}')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:14px;border:1px solid var(--border2);background:transparent;color:var(--txt2);cursor:pointer">${lbl}</button>`;
  _rkModal('aktModal', '🧾 Log Aktivitas Input',
    'Setiap simpan dari dashboard tercatat di sini beserta efeknya pada angka. ⚠ = tersimpan tapi angka dashboard tidak bergerak sesuai input — tidak perlu menebak, sebabnya tertulis.',
    `<div style="padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--bg2);flex-shrink:0">
       <select id="aktCo" onchange="aktRender()" style="font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--border2)">
         <option value="">Semua PT</option>${kode.map(c => `<option value="${_rkEsc(c)}"${c === company ? ' selected' : ''}>${_rkEsc(c)}</option>`).join('')}
       </select>
       ${chip('', 'Semua')}${chip('warning', '⚠ Perlu dicek')}${chip('ok', '✓ Terhitung')}
       <input id="aktCari" oninput="aktRender()" placeholder="Cari (nama, produk, lot…)" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border2);min-width:180px">
       <button onclick="openLogAktivitas(document.getElementById('aktCo').value)" style="margin-left:auto;font-size:11px;font-weight:700;padding:4px 10px;border-radius:var(--r);border:1px solid var(--border2);background:var(--bg);cursor:pointer">↻ Muat ulang</button>
     </div>
     <div id="aktIsi" style="overflow-y:auto;flex:1;padding:10px 20px 16px"><div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px">Memuat…</div></div>`, 860);
  window._aktStatus = window._aktStatus || '';
  try { _aktData = await _aktAmbil({ limit: 300 }); }
  catch (e) { _aktData = null; }
  aktRender();
}
function aktFilterStatus(v) { window._aktStatus = v; aktRender(); }
function aktRender() {
  const box = document.getElementById('aktIsi');
  if (!box) return;
  document.querySelectorAll('.akt-chip').forEach(b => {
    const on = b.dataset.v === (window._aktStatus || '');
    b.style.background = on ? 'var(--navy)' : 'transparent'; b.style.color = on ? '#fff' : 'var(--txt2)';
  });
  if (_aktData === null) { box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--red2);font-size:12px">Log tidak bisa dimuat. Coba Muat ulang.</div>'; return; }
  const co = (document.getElementById('aktCo') || {}).value || '';
  const cari = ((document.getElementById('aktCari') || {}).value || '').toLowerCase();
  const st = window._aktStatus || '';
  const rows = _aktData.filter(e => (!co || e.company === co) && (!st || e.status === st)
    && (!cari || JSON.stringify(e).toLowerCase().includes(cari)));
  if (!rows.length) { box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px">Belum ada catatan untuk filter ini. Log mulai terisi sejak 20 Okt 2026.</div>'; return; }
  const daftar = (arr, warna) => (arr || []).map(s => `<div style="color:${warna};font-size:11.5px;line-height:1.5">• ${_rkEsc(s)}</div>`).join('');
  box.innerHTML = rows.map(e => {
    const g = _AKT_GAYA[e.status] || _AKT_GAYA.ok;
    const siapa = e.nama || e.email || '—';
    return `<div style="border:1px solid ${e.status === 'warning' ? g.bd : 'var(--border)'};border-left:4px solid ${g.fg};border-radius:8px;padding:9px 12px;margin-bottom:8px;background:${e.status === 'warning' ? g.bg : 'var(--bg)'}">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;margin-bottom:3px">
        <strong style="color:var(--navy)">${_rkEsc(e.company)}</strong>
        <span style="font-size:11.5px;color:var(--txt2)">${_rkEsc(e.aksi)}</span>
        <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;background:${g.bg};border:1px solid ${g.bd};color:${g.fg}">${g.ico} ${_rkEsc(g.teks)}</span>
        <span style="margin-left:auto;font-size:10.5px;color:var(--txt3)">${_rkEsc(_aktWaktu(e.at))} · ${_rkEsc(siapa)}${e.peran ? ' (' + _rkEsc(e.peran) + ')' : ''}</span>
      </div>
      ${daftar(e.peringatan, '#9a3412')}
      ${daftar(e.ringkas, 'var(--txt2)')}
      ${e.dampak && e.dampak.length ? `<div style="margin-top:3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--txt3)">Efek di dashboard</div>${daftar(e.dampak, 'var(--green)')}` : ''}
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => setTimeout(aktLencana, 4000));
