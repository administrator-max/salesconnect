/* ═══════════════════════════════════════════════════════════════════════════
   PENGAJUAN PER TAHUN KUOTA — Sales meminta kuota tahun berikutnya (2027)
   untuk company yang SUDAH memegang kuota tahun lain.

   KENAPA ADA
   08-Okt-2026, Putri (Sales) membuka HDP di Quota Year 2027 dan tidak punya
   cara mengajukan apa pun. Formulir yang ada (Revision Request, Re-Apply, New
   Submission) semuanya menyimpan ke field SATU-per-company tanpa tahun, dan
   menyimpannya dari tampilan 2027 akan bercampur dengan 2026.

   BENTUK DATA — disimpan di amplop rev_note yang sama (`_newSubmissionByYear`):
     co.newSubmissionByYear = {
       "2027": {
         products:         [{product, mt}],         ← dari Sales
         confirmedTargets: [{product, mt, status}], ← sejajar indeksnya
         status:           pending | confirmed | rejected
         cycleType:        "Submit #N" — siklus yang lahir saat dikonfirmasi
         note, requestedBy, requestedDate, confirmedBy, confirmedDate
       }
     }

   ALUR: Sales isi produk & Qty → Simpan → CorpSec Konfirmasi → lahir siklus
   `Submit #N` bertanda quotaYear = tahun itu, PERTEK TBA. Sejak saat itu
   company tampil normal di Quota Year tsb (Active Application, Total
   Submitted) — data tahun lain tidak disentuh.

   NOMOR SIKLUS MELANJUTKAN URUTAN COMPANY (HDP: Submit #4), bukan mulai dari
   #1. Server mendedup siklus per company + cycle_type (iqdash_data.php), jadi
   "Submit #1" kedua akan LENYAP saat dibaca ulang. Tahunnya dibedakan oleh
   quotaYear, bukan oleh nomornya.
   ═══════════════════════════════════════════════════════════════════════════ */

function pjtCompanyAsli(code) {
  return [...(typeof SPI_ALL !== 'undefined' ? SPI_ALL : []),
          ...(typeof PENDING_ALL !== 'undefined' ? PENDING_ALL : [])]
    .find(c => c && c.code === code) || null;
}

function pjtReq(co, year) {
  const m = co && co.newSubmissionByYear;
  const r = m && m[String(year)];
  return (r && Array.isArray(r.products) && r.products.length) ? r : null;
}

function pjtBoleh(izin) {
  return !!(currentRole && (ROLE_PERMISSIONS[currentRole] || []).includes(izin));
}

function pjtHariIni() {
  return (typeof todayStd === 'function') ? todayStd()
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
}

function pjtEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Nomor Submit berikutnya, dihitung dari SELURUH siklus company (semua tahun). */
function pjtSiklusBerikut(co) {
  let maks = 0;
  (co.cycles || []).forEach(c => {
    const m = String((c && c.type) || '').match(/^submit\s*#?\s*(\d+)/i);
    if (m) maks = Math.max(maks, +m[1]);
  });
  return `Submit #${maks + 1}`;
}

/** Panel lengkap: dipasang ke `wrap`. */
function buildPengajuanTahun(code, wrap, year) {
  if (!wrap) return;
  const co = pjtCompanyAsli(code);
  if (!co) { wrap.innerHTML = ''; return; }
  const y   = year || QUOTA_YEAR;
  const req = pjtReq(co, y);
  const sales   = pjtBoleh('salesRevReq');
  const corpsec = pjtBoleh('corpsecRevConfirm');
  const status  = req ? (req.status || 'pending') : null;
  const terkunci = status === 'confirmed';

  const lencana = status === 'confirmed'
    ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">✅ Dikonfirmasi CorpSec · ${pjtEsc((typeof labelSiklusPerTahun === 'function' ? labelSiklusPerTahun(code, y, req.cycleType) : req.cycleType) || '')}</span>`
    : status === 'rejected'
    ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--red-bg);color:var(--red2);border:1px solid var(--red-bd)">✕ Dibatalkan CorpSec</span>`
    : status
    ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-bd)">⏳ Menunggu konfirmasi CorpSec</span>`
    : '';

  /* Baris awal: permintaan tersimpan, atau produk company sebagai saran (MT kosong). */
  const saranProduk = [...new Set((co.products || []).map(p => (typeof canonicalProduct === 'function') ? canonicalProduct(p) : p))].filter(Boolean);
  const baris = req
    ? req.products.map((x, i) => ({ product: x.product, mt: x.mt,
        cmt: (req.confirmedTargets && req.confirmedTargets[i] && req.confirmedTargets[i].mt) }))
    : (saranProduk.length ? saranProduk : ['']).map(p => ({ product: p, mt: null }));

  const ALL = (typeof selectableProducts === 'function') ? selectableProducts() : Object.keys(PROD_COLORS || {});
  const bolehUbah = sales && !terkunci;
  const opsi = sel => `<option value="">— Pilih Produk —</option>` +
    [...new Set([...ALL, ...(sel ? [sel] : [])])].map(p => `<option value="${pjtEsc(p)}" ${p === sel ? 'selected' : ''}>${pjtEsc(p)}</option>`).join('');

  const barisHtml = baris.map((r, i) => `
    <div class="pjt-row" style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <div style="width:14px;font-size:10px;color:var(--txt3);text-align:center">${i + 1}</div>
      <select class="fi pjt-prod" ${bolehUbah ? '' : 'disabled'} onchange="pjtSyncTotal()"
        style="flex:1;min-width:0;padding:4px 6px;font-size:11.5px;border:1px solid var(--border2);border-radius:5px;background:var(--bg);color:var(--txt)">${opsi(r.product)}</select>
      <input type="text" inputmode="decimal" class="pmt-mt-inp pjt-mt" placeholder="Qty (MT)" ${bolehUbah ? '' : 'disabled'}
        value="${r.mt != null ? Number(r.mt).toLocaleString(MT_LOCALE) : ''}" oninput="fmtThousandInline(this);pjtSyncTotal()" style="width:120px">
      ${corpsec && status === 'pending' ? `<input type="text" inputmode="decimal" class="pmt-mt-inp pjt-cmt" title="MT yang dikonfirmasi CorpSec"
        value="${Number(r.cmt != null ? r.cmt : r.mt || 0).toLocaleString(MT_LOCALE)}" oninput="fmtThousandInline(this)" style="width:110px;border-color:var(--green-bd)">` : ''}
      ${bolehUbah && baris.length > 1 ? `<button onclick="this.closest('.pjt-row').remove();pjtSyncTotal()" title="Hapus baris"
        style="width:22px;height:22px;border:1px solid var(--border2);border-radius:4px;background:var(--red-bg);color:var(--red2);cursor:pointer;padding:0">✕</button>` : '<div style="width:22px"></div>'}
    </div>`).join('');

  const total = baris.reduce((a, r) => a + (Number(r.mt) || 0), 0);

  wrap.innerHTML = `
    <div id="pjtPanel" data-code="${pjtEsc(code)}" data-year="${y}"
      style="margin-top:10px;padding:12px 14px;background:var(--surf, #fff);border:1px solid var(--blue-bd);border-radius:8px">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:12px;font-weight:700;color:var(--navy)">🆕 Pengajuan Kuota ${y} — ${pjtEsc(coLabel(code))}</span>
        ${lencana}
      </div>
      <div style="font-size:10.5px;color:var(--txt2);line-height:1.5;margin-bottom:10px">
        Alur: <strong>Sales isi produk &amp; Qty</strong> → <strong>Simpan</strong> → <strong>CorpSec konfirmasi</strong>
        → tercatat sebagai Submit ${y}. Data ${[...(typeof companyQuotaYears === 'function' ? companyQuotaYears(co) : [])].filter(t => t !== y).join(', ') || 'tahun lain'} tidak berubah.
        ${!sales && !corpsec ? '<br><em>Pilih role Sales untuk mengajukan, atau CorpSec untuk mengonfirmasi.</em>' : ''}
      </div>
      ${corpsec && status === 'pending' ? `<div style="display:flex;gap:6px;font-size:9.5px;color:var(--txt3);margin:0 0 4px 20px">
        <span style="flex:1">Produk</span><span style="width:120px;text-align:right">Diajukan</span><span style="width:110px;text-align:right;color:var(--green)">Dikonfirmasi</span><span style="width:22px"></span></div>` : ''}
      <div id="pjtRows">${barisHtml}</div>
      ${bolehUbah ? `<button onclick="pjtTambahBaris()" style="margin-top:2px;font-size:10.5px;font-weight:600;padding:4px 12px;border-radius:5px;border:1px dashed var(--border2);background:var(--bg2);color:var(--blue);cursor:pointer">+ Add Product</button>` : ''}
      <div style="margin-top:8px">
        <input type="text" class="fi" id="pjtNote" value="${pjtEsc(req && req.note || '')}" placeholder="Catatan (opsional)…"
          ${bolehUbah ? '' : 'disabled'} style="width:100%;font-size:11px">
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:10.5px;color:var(--txt3)">Total diajukan: <strong id="pjtTotal" style="color:var(--blue)">${total.toLocaleString(MT_LOCALE)} MT</strong></span>
        <span style="flex:1"></span>
        ${bolehUbah ? `<button class="btn" onclick="pjtSimpan()" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11.5px;font-weight:700;cursor:pointer">💾 Simpan Pengajuan ${y}</button>` : ''}
        ${corpsec && status === 'pending' ? `
          <button onclick="pjtBatalkan()" style="background:var(--red-bg);color:var(--red2);border:1px solid var(--red-bd);border-radius:6px;padding:7px 12px;font-size:11.5px;font-weight:700;cursor:pointer">✕ Batalkan</button>
          <button onclick="pjtKonfirmasi()" style="background:var(--green);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11.5px;font-weight:700;cursor:pointer">✅ Konfirmasi → Submit ${y}</button>` : ''}
      </div>
      ${req ? `<div style="margin-top:8px;font-size:10px;color:var(--txt3)">Diajukan ${pjtEsc(req.requestedBy || 'Sales')} · ${pjtEsc(req.requestedDate || '—')}${req.confirmedDate ? ` · diputuskan ${pjtEsc(req.confirmedBy || 'CorpSec')} · ${pjtEsc(req.confirmedDate)}` : ''}</div>` : ''}
    </div>`;
}

function pjtTambahBaris() {
  const w = document.getElementById('pjtRows');
  if (!w) return;
  const first = w.querySelector('.pjt-row');
  if (!first) return;
  const n = first.cloneNode(true);
  n.querySelector('.pjt-prod').value = '';
  n.querySelector('.pjt-mt').value = '';
  w.appendChild(n);
  [...w.querySelectorAll('.pjt-row')].forEach((r, i) => { r.firstElementChild.textContent = i + 1; });
}

function pjtSyncTotal() {
  let t = 0;
  document.querySelectorAll('#pjtRows .pjt-mt').forEach(i => { t += parseFloat(String(i.value || '').replace(/,/g, '')) || 0; });
  const el = document.getElementById('pjtTotal');
  if (el) el.textContent = t.toLocaleString(MT_LOCALE) + ' MT';
}

function _pjtPanelInfo() {
  const p = document.getElementById('pjtPanel');
  if (!p) return null;
  const co = pjtCompanyAsli(p.dataset.code);
  return co ? { co, year: Number(p.dataset.year) } : null;
}

/* Simpan lewat jalur yang sama dengan seluruh form (patchToServer), lalu
   bangun ulang irisan tahun & form. */
async function _pjtSimpanKeServer(co, pesanOk) {
  /* Objek yang disimpan di sini adalah objek ASAL (semua tahun), disimpan
     sementara tampilan sedang di tahun lain. patchCyclesToServer() mencap
     siklus tanpa tahun dengan tahun yang sedang tampil — siklus lama yang
     belum bertahun (SNSD) akan ikut pindah ke 2027. Dipatok dulu ke tahun
     efektifnya (= tahun bawaan, cara ia dibaca selama ini). */
  (co.cycles || []).forEach(c => {
    if (c && typeof parseQuotaYear === 'function' && parseQuotaYear(c.quotaYear) == null) c.quotaYear = cycleQuotaYear(c);
  });
  try {
    await patchToServer(co);
    if (typeof showToast === 'function') showToast(pesanOk, 'success');
  } catch (err) {
    if (typeof showToast === 'function') showToast('⚠ Gagal menyimpan: ' + (err && err.message || err), 'error');
    throw err;
  } finally {
    if (typeof applyQuotaYearSlice === 'function') applyQuotaYearSlice();
    if (typeof isiDaftarCompany === 'function') isiDaftarCompany();
    if (typeof refreshAllSurfaces === 'function') { try { refreshAllSurfaces(); } catch (e) {} }
    const sel = document.getElementById('editCo');
    if (sel) { sel.value = co.code; if (typeof loadEdit === 'function') loadEdit(); }
    if (typeof renderNotifBadge === 'function') renderNotifBadge();
  }
}

async function pjtSimpan() {
  const info = _pjtPanelInfo();
  if (!info || !pjtBoleh('salesRevReq')) return;
  const { co, year } = info;
  const items = [];
  document.querySelectorAll('#pjtRows .pjt-row').forEach(r => {
    const p  = String(r.querySelector('.pjt-prod').value || '').trim();
    const mt = parseFloat(String(r.querySelector('.pjt-mt').value || '').replace(/,/g, ''));
    if (p && mt > 0) items.push({ product: p, mt });
  });
  if (!items.length) {
    if (typeof showToast === 'function') showToast('Isi minimal satu produk dengan Qty (MT) lebih dari 0.', 'warn');
    return;
  }
  const lama = pjtReq(co, year) || {};
  if (!co.newSubmissionByYear) co.newSubmissionByYear = {};
  co.newSubmissionByYear[String(year)] = {
    products: items,
    confirmedTargets: items.map(x => ({ product: x.product, mt: null, status: 'pending' })),
    status: 'pending',
    note: String((document.getElementById('pjtNote') || {}).value || '').trim(),
    requestedBy:   lama.requestedBy || currentRole || 'Sales',
    requestedDate: pjtHariIni(),
    confirmedBy: null, confirmedDate: null, cycleType: null,
  };
  co.updatedBy = currentRole || 'Sales';
  co.updatedDate = pjtHariIni();
  await _pjtSimpanKeServer(co, `Pengajuan ${year} ${coLabel(co.code)} tersimpan — menunggu konfirmasi CorpSec.`);
}

async function pjtKonfirmasi() {
  const info = _pjtPanelInfo();
  if (!info || !pjtBoleh('corpsecRevConfirm')) return;
  const { co, year } = info;
  const req = pjtReq(co, year);
  if (!req || req.status !== 'pending') return;

  const cmt = [...document.querySelectorAll('#pjtRows .pjt-cmt')].map(i => parseFloat(String(i.value || '').replace(/,/g, '')));
  req.confirmedTargets = req.products.map((x, i) => {
    const v = cmt[i];
    const mt = (v != null && !isNaN(v)) ? v : x.mt;
    return { product: x.product, mt, status: mt > 0 ? 'confirmed' : 'rejected' };
  });
  const oke = req.confirmedTargets.filter(t => t.status === 'confirmed');
  if (!oke.length) { if (typeof showToast === 'function') showToast('Tidak ada produk dengan MT > 0 untuk dikonfirmasi.', 'warn'); return; }

  const kanon = p => (typeof canonicalProduct === 'function') ? canonicalProduct(String(p || '').trim()) : String(p || '').trim();
  const prodObj = {};
  oke.forEach(t => { const p = kanon(t.product); if (p) prodObj[p] = (prodObj[p] || 0) + Number(t.mt); });
  const total = Object.values(prodObj).reduce((a, b) => a + b, 0);
  const hari = pjtHariIni();
  const tipe = pjtSiklusBerikut(co);

  req.status = 'confirmed';
  req.confirmedBy = currentRole || 'CorpSec';
  req.confirmedDate = hari;
  req.cycleType = tipe;

  if (!co.cycles) co.cycles = [];
  co.cycles.push({
    type: tipe, mt: total, products: prodObj,
    submitType: 'Submit MOI', submitDate: hari,
    releaseType: 'PERTEK', releaseDate: 'TBA',
    status: `✅ Pengajuan ${year} dikonfirmasi ${req.confirmedBy} · ${hari} · ${oke.length} dari ${req.products.length} produk${req.note ? ' · ' + req.note : ''}`,
    quotaYear: year,
    _fromNewSubmission: true,
  });
  co.products = [...new Set([...(co.products || []).map(kanon), ...Object.keys(prodObj)])].filter(Boolean);
  if (typeof canonicalSubmitted === 'function') co.submit1 = canonicalSubmitted(co);
  co.updatedBy = currentRole || 'CorpSec';
  co.updatedDate = hari;
  await _pjtSimpanKeServer(co, `${coLabel(co.code)}: ${tipe} (${year}) tercatat — ${total.toLocaleString(MT_LOCALE)} MT.`);
}

async function pjtBatalkan() {
  const info = _pjtPanelInfo();
  if (!info || !pjtBoleh('corpsecRevConfirm')) return;
  const { co, year } = info;
  const req = pjtReq(co, year);
  if (!req || req.status !== 'pending') return;
  if (typeof confirm === 'function' && !confirm(`Batalkan pengajuan ${year} ${coLabel(co.code)}?`)) return;
  req.status = 'rejected';
  req.confirmedTargets = req.products.map(x => ({ product: x.product, mt: null, status: 'rejected' }));
  req.confirmedBy = currentRole || 'CorpSec';
  req.confirmedDate = pjtHariIni();
  await _pjtSimpanKeServer(co, `Pengajuan ${year} ${coLabel(co.code)} dibatalkan.`);
}

window.buildPengajuanTahun = buildPengajuanTahun;
window.pjtTambahBaris = pjtTambahBaris;
window.pjtSyncTotal = pjtSyncTotal;
window.pjtSimpan = pjtSimpan;
window.pjtKonfirmasi = pjtKonfirmasi;
window.pjtBatalkan = pjtBatalkan;
