/* ============================================================
   Gunung Prisma CRM — app.js  (clean rebuild)
   ============================================================ */

// ─── FORMAT HELPERS ──────────────────────────────────────────
function fmtRp(v) {
  const n = parseFloat(v) || 0;
  if (n >= 1e12) return 'Rp ' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return 'Rp ' + (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return 'Rp ' + (n/1e6).toFixed(1)  + 'M';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function fmtN(v) { return (Math.round(parseFloat(v) || 0)).toLocaleString('id-ID'); }
function fmtPct(v) { return ((parseFloat(v) || 0) * 100).toFixed(1) + '%'; }
function fmtDate(v) { return v ? String(v).substring(0, 10) : '—'; }

// ─── DOM HELPERS ─────────────────────────────────────────────
function $(id)        { return document.getElementById(id); }
function txt(id, val) { const el = $(id); if (el) el.textContent = val; }
function htm(id, val) { const el = $(id); if (el) el.innerHTML  = val;  }


// ─── AUTH FETCH WRAPPER ──────────────────────────────────────
// SalesConnect menangani login/sesi terpusat (guard PHP + sc_session_watch()
// yang menambal window.fetch di <head>) — fungsi ini tinggal pembungkus tipis
// fetch relatif, tanpa token/localStorage/redirect sendiri. Nama fungsi
// dipertahankan supaya seluruh pemanggil di file ini (~2000 baris) tidak perlu
// diubah satu per satu.
function authFetch(url, opts) {
  opts = opts || {};
  opts.cache = 'no-store';  // Selalu fetch dari server, jangan pakai browser cache
  return fetch(url, opts);
}

// ─── PIPELINE STAGE CLASSIFIER ─────────────────────────────
function classifyPipelineStage(pipeline) {
  const active = parseInt(pipeline.active_deals) || 0;
  const lost   = parseInt(pipeline.lost_deals)   || 0;
  if (active > 1 && lost === 0) return { stage: 'New Active', followUp: 'Follow Up 7–14 days', cssClass: 'ps-new-active', icon: '🟢' };
  if (active > 1 && lost >  1) return { stage: 'Hot Call',   followUp: 'Follow Up 0–7 days',  cssClass: 'ps-hot-call',   icon: '🔴' };
  if (active === 0 && lost > 1) return { stage: 'Warm Call',  followUp: 'Follow Up 14–28 days', cssClass: 'ps-warm-call',  icon: '🟡' };
  return { stage: 'Cold Call', followUp: 'Follow Up >30 days', cssClass: 'ps-cold-call', icon: '⚪' };
}

// ─── ACTION OPTIONS (Pipeline inline edit) ───────────────────
const ACTION_OPTIONS = [
  { value: '',                    label: '— None —',              cls: 'a-'  },
  { value: 'Follow Up 0-7 days',  label: 'Follow Up 0–7 days',   cls: 'a0'  },
  { value: 'Follow Up 7-14 days', label: 'Follow Up 7–14 days',  cls: 'a7'  },
  { value: 'Follow Up 14-28 days',label: 'Follow Up 14–28 days', cls: 'a14' },
  { value: 'Follow Up >30 days',  label: 'Follow Up >30 days',   cls: 'a30' },
];

function actionClass(val) {
  if (!val) return 'a-';
  if (val.includes('0-7'))   return 'a0';
  if (val.includes('7-14'))  return 'a7';
  if (val.includes('14-28')) return 'a14';
  if (val.includes('>30'))   return 'a30';
  return 'a-';
}

async function updateAction(id, val) {
  // Optimistic UI: update class immediately
  const sel = document.querySelector('.action-sel[data-id="' + id + '"]');
  if (sel) {
    sel.className = 'action-sel ' + actionClass(val);
  }
  try {
    const r = await authFetch('api/pipeline/' + id + '/action', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: val || null }),
    });
    if (!r.ok) throw new Error('Update failed: ' + r.status);
    // Sync cache
    const row = _pipelineData.find(x => x.id === id);
    if (row) row.action = val || null;
    showToast('Action updated');
  } catch (e) {
    showToast(e.message, 'error');
    // Revert UI
    if (sel) sel.className = 'action-sel ' + actionClass(sel.dataset.prev || '');
  }
}

// Submit action dari tombol Save di Pipeline Connection table
async function submitCompanyAction(accountId, company) {
  const sel = document.getElementById('cact-' + accountId);
  if (!sel) return;
  const val = sel.value;
  await updateCompanyAction(accountId, company, val);
  // Update data-prev setelah berhasil save
  sel.dataset.prev = val;
}

// Update action per company (dari Pipeline Connection table di Customer List)
async function updateCompanyAction(accountId, company, val) {
  // Optimistic UI
  document.querySelectorAll('.crm-action-sel[data-account-id="' + accountId + '"]').forEach(function(sel) {
    sel.className = 'action-sel crm-action-sel ' + actionClass(val);
    sel.dataset.prev = val;
  });
  try {
    const r = await authFetch('api/crm/accounts/' + accountId + '/action', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: val || null }),
    });
    if (!r.ok) throw new Error('Update failed: ' + r.status);
    // Sync _crmCache
    const acct = _crmCache.find(function(a) { return a.id === accountId; });
    if (acct) acct.action = val || null;
    // Sync _pipelineData: update company_action untuk semua row milik company ini
    _pipelineData.forEach(function(row) {
      if ((row.customer||'').toLowerCase().trim() === company.toLowerCase().trim()) {
        row.company_action = val || null;
      }
    });
    // Re-render pipeline table agar kolom Action ter-update (read-only dari company)
    renderPipelineTable(_pipelineData);
    showToast('Action updated — ' + company);
  } catch (e) {
    showToast(e.message, 'error');
    // Revert
    document.querySelectorAll('.crm-action-sel[data-account-id="' + accountId + '"]').forEach(function(sel) {
      sel.value = sel.dataset.prev || '';
      sel.className = 'action-sel crm-action-sel ' + actionClass(sel.dataset.prev || '');
    });
  }
}

// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'success');
  el.textContent = msg;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── ERROR RENDERER ──────────────────────────────────────────
function renderError(e, section) {
  const msg = (e && e.message) ? e.message : String(e);
  return '<div style="padding:32px;text-align:center;">'
    + '<div style="font-size:32px;margin-bottom:8px;">⚠️</div>'
    + '<div style="font-size:14px;font-weight:700;color:#C8392B;margin-bottom:8px;">Failed to load ' + section + '</div>'
    + '<code style="display:block;font-size:11px;background:#EEF2F8;padding:8px 12px;border-radius:6px;max-width:500px;margin:0 auto;word-break:break-word;">' + msg + '</code>'
    + '<div style="font-size:11px;color:#8EA0B8;margin-top:10px;">Check the browser console (F12) for the full error.</div>'
    + '</div>';
}

// ─── CHART HELPERS ───────────────────────────────────────────
const _charts = {};
function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}
const CF = { family: 'DM Sans', size: 11 };
const TT = { backgroundColor: '#0D1B2A', titleFont: { family: 'Sora', size: 12 }, bodyFont: CF, padding: 10, cornerRadius: 8 };
const PAL = ['#0B3D6B','#1A5AA0','#1A7F7A','#2AA9A3','#E8A020','#D4890A','#6B8EBE','#8EB4D8','#A0C4E0','#B8D4E8'];

// ─── PAGE NAVIGATION ─────────────────────────────────────────
const PAGE_LOADERS = { p1: loadP1, p2: loadP2, p3: loadP3, p4: loadP4, p5: loadP5, px: loadPX }; // px = Supplier List

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t  => t.classList.remove('active'));
  const page = $('page-' + id);
  const tab  = $('tab-'  + id);
  if (page) page.classList.add('active');
  if (tab)  tab.classList.add('active');
  if (PAGE_LOADERS[id]) PAGE_LOADERS[id]();
}

// ─── API FETCH WRAPPER ───────────────────────────────────────
async function api(url) {
  const r = await authFetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(url + ' returned ' + r.status + ': ' + body.substring(0, 100));
  }
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
// P1 — MARKET BLUEPRINT
// ═══════════════════════════════════════════════════════════════
async function loadP1() {
  try {
    const [overview, trading, mfr, stockists, he, projOwners] = await Promise.all([
      api('api/market/overview'),
      api('api/market/trading'),
      api('api/market/manufacturers'),
      api('api/market/stockists'),
      api('api/market/heavy-equipment'),
      api('api/market/project-owners'),
    ]);

    txt('mc-global-mfr',      overview.globalMfr);
    txt('mc-china-mfr',       overview.chinaMfr);
    txt('mc-trading-offices', trading.length);
    txt('mc-trading-vol',     fmtN(overview.tradingTotal) + ' MT total vol.');
    txt('mc-stockist-counts', overview.stockOEM.count + ' / ' + overview.stockFab.count + ' / ' + overview.stockDist.count);
    txt('mc-stockist-sub',    fmtN(overview.stockOEM.vol) + ' · ' + fmtN(overview.stockFab.vol) + ' · ' + fmtN(overview.stockDist.vol) + ' MT');
    txt('mc-he-count',        he.length);
    txt('mc-he-ow',           'OW ' + fmtN(overview.heOW) + ' MT');
    txt('mc-project-owners',  projOwners.length);

    // Trading bars
    if (trading.length) {
      const max = Math.max(...trading.map(d => +d.annual_volume_mt));
      htm('tradingBars', trading.map(d =>
        '<div class="mi">'
        + '<div class="ml" title="' + d.company_name + '">' + d.company_name + '</div>'
        + '<div class="mbw"><div class="mb" style="width:' + (+d.annual_volume_mt/max*100).toFixed(1) + '%;background:' + d.color_hex + ';">'
        + '<span class="mbv">' + fmtN(d.annual_volume_mt) + '</span></div></div>'
        + '<div class="mp">' + (+d.market_share_pct*100).toFixed(1) + '%</div>'
        + '</div>'
      ).join(''));
    }

    // Global manufacturers grid
    htm('mfrGrid', (mfr.global || []).map(m =>
      '<div class="mfi"><div class="mfn">' + m.sort_order + '</div>'
      + '<div style="flex:1;min-width:0;"><div class="mfbr">' + m.brand + '</div><div class="mfml">' + m.mill_name + '</div></div>'
      + '<div class="mfco">' + m.country + '</div></div>'
    ).join(''));

    // China manufacturers table
    htm('chinaMfrBody', (mfr.china || []).map((m, i) =>
      '<tr><td>' + (i+1) + '</td><td><b>' + m.brand + '</b></td><td>' + m.mill_name + '</td><td>' + (m.city_province||'—') + '</td></tr>'
    ).join(''));

    // Stockist tables
    const oem  = stockists.filter(s => s.category === 'OEM');
    const fab  = stockists.filter(s => s.category === 'Fabricator');
    const dist = stockists.filter(s => s.category === 'Distributor');
    renderStockistTable('stockOEMBody',  oem);
    renderStockistTable('stockFabBody',  fab);
    renderStockistTable('stockDistBody', dist);
    txt('mc-oem-total',  fmtN(oem.reduce( (s,r) => s + +r.annual_volume_mt, 0)) + ' MT');
    txt('mc-fab-total',  fmtN(fab.reduce( (s,r) => s + +r.annual_volume_mt, 0)) + ' MT');
    txt('mc-dist-total', fmtN(dist.reduce((s,r) => s + +r.annual_volume_mt, 0)) + ' MT');

    // HE suppliers table
    const totalUnits = he.reduce((s,h) => s + +h.est_units_sold, 0);
    const totalOW    = he.reduce((s,h) => s + +h.total_ow_mt, 0);
    htm('heDemandBody', he.map(h =>
      '<tr>'
      + '<td>' + h.sort_order + '</td>'
      + '<td>' + h.company_name + '</td>'
      + '<td>' + (h.brand||'—') + '</td>'
      + '<td>' + (h.common_size||'—') + '</td>'
      + '<td style="font-size:11px;">' + (h.type_of_vehicle||'—') + '</td>'
      + '<td class="num">' + fmtN(h.est_units_sold) + '</td>'
      + '<td class="num">' + h.ow_per_unit_mt + '</td>'
      + '<td class="num">' + fmtN(h.total_ow_mt) + '</td>'
      + '<td class="num he-wrp-col">' + fmtN(Math.round(+h.total_ow_mt * 0.08)) + '</td>'
      + '</tr>'
    ).join('')
    + '<tr style="background:var(--surface2);">'
    + '<td colspan="5" style="font-weight:700;">TOTAL</td>'
    + '<td class="num" style="font-weight:700;">' + fmtN(totalUnits) + '</td>'
    + '<td></td>'
    + '<td class="num" style="font-weight:700;">' + fmtN(totalOW) + '</td>'
    + '<td class="num he-wrp-col">' + fmtN(Math.round(totalOW * 0.08)) + '</td>'
    + '</tr>');

    // Project owners table
    htm('projectOwnersBody', projOwners.map(p =>
      '<tr>'
      + '<td><b>' + (p.sort_order_label || p.sort_order) + '</b></td>'
      + '<td><b>' + p.company_name + '</b> <span style="font-size:10px;color:var(--text-muted);">(' + (p.commodity||'') + ')</span></td>'
      + '<td>' + (p.site_mine||'—') + '</td>'
      + '<td style="font-size:11px;">' + (p.common_size||'—') + '</td>'
      + '<td style="font-size:11px;">' + (p.application_notes||'—') + '</td>'
      + '</tr>'
    ).join(''));

  } catch (e) {
    console.error('P1 error:', e);
    htm('tradingBars', renderError(e, 'Market Blueprint'));
  }
}

function renderStockistTable(tbodyId, rows) {
  const apiStatus = r => r.api_status
    ? '<span class="' + (r.api_status === 'API-P' ? 'apip' : 'apiu') + '">' + r.api_status + '</span>'
    : '—';
  const total = rows.reduce((s, r) => s + +r.annual_volume_mt, 0);
  htm(tbodyId,
    rows.map((r, i) =>
      '<tr>'
      + '<td>' + (i+1) + '</td>'
      + '<td><b>' + r.company_name + '</b></td>'
      + '<td>' + (r.location||'—') + '</td>'
      + '<td class="num">' + fmtN(r.annual_volume_mt) + '</td>'
      + '<td>' + (r.size_range||'—') + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);">' + (r.remarks||'—') + '</td>'
      + '<td>' + apiStatus(r) + '</td>'
      + '</tr>'
    ).join('')
    + '<tr style="background:var(--surface2);">'
    + '<td colspan="3" style="font-weight:700;color:var(--text-secondary);">TOTAL VOLUME</td>'
    + '<td class="num" style="font-weight:700;color:var(--teal);">' + fmtN(total) + '</td>'
    + '<td colspan="3"></td>'
    + '</tr>'
  );
}

// ═══════════════════════════════════════════════════════════════
// P2 — PRODUCT GRADE
// ═══════════════════════════════════════════════════════════════
async function loadP2() {
  try {
    const products = await api('api/products');
    const WR  = products.filter(p => p.category === 'WR');
    const HiS = products.filter(p => p.category === 'HiS');
    const CCO = products.filter(p => p.category === 'CCO');

    txt('mc-wr-count',  WR.length);
    txt('mc-his-count', HiS.length);
    txt('mc-cco-count', CCO.length);

    function mkCard(p, cls, tag, tagCls) {
      return '<div class="pcard ' + cls + '">'
        + '<div class="pgrade">' + p.grade_code + '</div>'
        + '<div class="ptech">' + (p.technology||'') + '</div>'
        + '<span class="ptag ' + tagCls + '">' + tag + '</span>'
        + (p.available_brands ? '<div class="pbrands">' + p.available_brands + '</div>' : '')
        + '<div class="pfunc">' + (p.function_desc||'') + '</div>'
        + '</div>';
    }

    const empty = '<div style="padding:20px;color:var(--text-muted);font-size:12px;">No data — run node db/seed.js</div>';
    htm('wrList',  WR.length  ? WR.map(p  => mkCard(p, 'wr',  'WR',  'twr')).join('')  : empty);
    htm('hisList', HiS.length ? HiS.map(p => mkCard(p, 'his', 'HiS', 'this')).join('') : empty);
    htm('ccoList', CCO.length ? CCO.map(p => mkCard(p, 'cco', 'CCO', 'tcco')).join('') : empty);

  } catch (e) {
    console.error('P2 error:', e);
    const err = renderError(e, 'Product Grade');
    htm('wrList', err); htm('hisList', err); htm('ccoList', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// P3 — SALES PIPELINE
// ═══════════════════════════════════════════════════════════════
let _pipelineData = [];

async function loadP3() {
  try {
    const [summary, data, byCustomer, byPayment, byOwner] = await Promise.all([
      api('api/pipeline/summary'),
      api('api/pipeline'),
      api('api/pipeline/by-customer'),
      api('api/pipeline/by-payment'),
      api('api/pipeline/by-owner'),
    ]);

    _pipelineData = data || [];

    // Metric cards
    const active = parseInt(summary.active_deals) || 0;
    const lost   = parseInt(summary.lost_deals)   || 0;
    txt('mc-total-deals',      active + lost);
    txt('mc-deals-sub',        active + ' Active · ' + lost + ' Lost');
    txt('mc-pipeline-rev',     fmtRp(summary.pipeline_revenue));
    txt('mc-pipeline-margin',  fmtRp(summary.pipeline_margin));
    txt('mc-avg-margin-sub',   'Avg margin ' + (summary.avg_margin_pct || 0) + '%');
    txt('mc-lost-revenue',     fmtRp(summary.lost_revenue));
    txt('mc-lost-sub',         lost + ' deals · recovery focus');

    // Tab badge
    const badge = $('badge-p3');
    if (badge) badge.textContent = active;

    // Weighted pipeline (non-blocking)
    api('api/pipeline/weighted')
      .then(w => txt('mc-weighted-pipeline', fmtRp(w.weighted_pipeline || 0)))
      .catch(() => txt('mc-weighted-pipeline', '—'));

    // Funnel
    htm('funnelActive',
      '<div class="fs" style="border-left:3px solid var(--primary);">'
      + '<div class="fd" style="background:var(--primary);"></div>'
      + '<div class="fn" style="font-weight:700;">Quotation (Active)</div>'
      + '<div class="fc">' + active + ' deals</div>'
      + '<div class="fr" style="color:var(--primary);">' + fmtRp(summary.pipeline_revenue) + '</div>'
      + '</div>'
      + '<div class="fs">'
      + '<div class="fd" style="background:var(--danger);"></div>'
      + '<div class="fn">Lost</div>'
      + '<div class="fc">' + lost + ' deals</div>'
      + '<div class="fr" style="color:var(--danger);">' + fmtRp(summary.lost_revenue) + '</div>'
      + '</div>'
    );

    // Owner performance — richer detail block
    if (byOwner.length) {
      const totalRev    = byOwner.reduce((s, o) => s + (+o.revenue || 0), 0);
      const totalMargin = byOwner.reduce((s, o) => s + (+o.margin  || 0), 0);
      htm('ownerPerf',
        '<div style="display:flex;flex-direction:column;gap:14px;">'
        + byOwner.map(o => {
            const pct    = totalRev > 0 ? (+o.revenue / totalRev * 100).toFixed(1) : '0.0';
            const marginPct = +o.revenue > 0 ? (+o.margin / +o.revenue * 100).toFixed(1) : '0.0';
            const avgDeal   = +o.deals > 0 ? fmtRp(+o.revenue / +o.deals) : '—';
            const isIrma    = o.sales_owner === 'Irma';
            const isRobinO  = o.sales_owner === 'Robin';
            const color     = isIrma ? 'var(--danger)' : isRobinO ? '#1A7A4A' : 'var(--primary)';
            return '<div>'
              + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
              + '<div style="display:flex;align-items:center;gap:8px;">'
              + '<span class="' + (isIrma ? 'oi' : o.sales_owner === 'Robin' ? 'or' : 'oj') + '">' + o.sales_owner + '</span>'
              + '<span style="font-size:12px;color:var(--text-muted);">' + o.deals + ' inquiries</span>'
              + '</div>'
              + '<div style="text-align:right;">'
              + '<div style="font-size:16px;font-weight:700;">' + fmtRp(o.revenue) + '</div>'
              + '<div style="font-size:11px;color:var(--text-muted);">' + pct + '% of active pipeline</div>'
              + '</div>'
              + '</div>'
              + '<div style="background:var(--surface2);border-radius:4px;height:10px;overflow:hidden;margin-bottom:8px;">'
              + '<div style="background:' + color + ';height:100%;width:' + pct + '%;border-radius:4px;transition:width 0.6s ease;"></div>'
              + '</div>'
              + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">'
              + '<div style="background:var(--surface2);padding:8px 10px;border-radius:7px;text-align:center;">'
              + '<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Margin</div>'
              + '<div style="font-size:13px;font-weight:700;color:var(--success);">' + fmtRp(o.margin) + '</div>'
              + '<div style="font-size:10px;color:var(--text-muted);">' + marginPct + '% avg</div>'
              + '</div>'
              + '<div style="background:var(--surface2);padding:8px 10px;border-radius:7px;text-align:center;">'
              + '<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Avg Inquiry</div>'
              + '<div style="font-size:13px;font-weight:700;">' + avgDeal + '</div>'
              + '<div style="font-size:10px;color:var(--text-muted);">' + o.deals + ' opportunities</div>'
              + '</div>'
              + '<div style="background:var(--surface2);padding:8px 10px;border-radius:7px;text-align:center;">'
              + '<div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Pipeline %</div>'
              + '<div style="font-size:20px;font-weight:700;color:' + color + ';">' + pct + '%</div>'
              + '<div style="font-size:10px;color:var(--text-muted);">of active rev</div>'
              + '</div>'
              + '</div>'
              + '</div>';
          }).join('<div style="height:1px;background:var(--border);"></div>')
        + '<div style="padding-top:12px;display:flex;justify-content:space-between;align-items:center;font-size:12px;">'
        + '<span style="color:var(--text-muted);">Total Active Pipeline</span>'
        + '<div style="text-align:right;">'
        + '<div style="font-weight:700;font-size:14px;">' + fmtRp(totalRev) + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);">Margin: ' + fmtRp(totalMargin) + '</div>'
        + '</div>'
        + '</div>'
        + '</div>'
      );
    }

    // Charts
    try { renderCustomerRevChart(byCustomer); } catch (ce) { console.warn('chart error:', ce.message); }
    try { renderPaymentChart(byPayment);      } catch (ce) { console.warn('chart error:', ce.message); }
    try { renderOwnerChart(byOwner);          } catch (ce) { console.warn('chart error:', ce.message); }

    // Pipeline table
    renderPipelineTable(_pipelineData);

  } catch (e) {
    console.error('P3 error:', e);
    htm('ownerPerf',    renderError(e, 'Sales Pipeline'));
    htm('funnelActive', renderError(e, 'Sales Pipeline'));
    htm('pipelineTbody', '<tr><td colspan="18" style="padding:20px;">' + e.message + '</td></tr>');
  }
}

function renderCustomerRevChart(data) {
  destroyChart('customerRevChart');
  const canvas = $('customerRevChart');
  if (!canvas) return;
  if (!data.length) { htm('customerRevDetail',''); return; }

  const totalRev = data.reduce((s,r) => s + +r.total_revenue, 0);

  _charts['customerRevChart'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(r => r.customer
        .replace('PT. Kalimantan Aluminium Industry','KAI - Alumina')
        .replace(/^PT\.\s?|^PT\s/,'').substring(0,22)),
      datasets: [{
        label: 'Revenue',
        data: data.map(r => +r.total_revenue),
        backgroundColor: PAL,
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { ...TT, callbacks: {
          title: ctx => ctx[0].label,
          label: ctx => [
            ' Revenue: ' + fmtRp(ctx.raw),
            ' Share: ' + (ctx.raw / totalRev * 100).toFixed(1) + '%'
          ]
        }}
      },
      scales: {
        x: { grid: { color: '#EEF2F8' }, ticks: { font: CF, color: '#4A6080', callback: v => fmtRp(v) } },
        y: { grid: { display: false }, ticks: { font: CF, color: '#0D1B2A' } }
      }
    }
  });

  // Detail table below chart
  htm('customerRevDetail',
    '<table style="width:100%;border-collapse:collapse;font-size:11px;">'
    + '<thead><tr style="background:var(--surface2);">'
    + '<th style="padding:5px 8px;text-align:left;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Customer</th>'
    + '<th style="padding:5px 8px;text-align:right;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Inquiry</th>'
    + '<th style="padding:5px 8px;text-align:right;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Margin</th>'
    + '<th style="padding:5px 8px;text-align:right;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Share</th>'
    + '</tr></thead><tbody>'
    + data.map((r, i) =>
        '<tr style="border-bottom:1px solid var(--border);">'
        + '<td style="padding:5px 8px;display:flex;align-items:center;gap:6px;">'
        + '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + (PAL[i]||'#8EA0B8') + ';flex-shrink:0;"></span>'
        + r.customer.replace('PT. Kalimantan Aluminium Industry','KAI - Alumina').replace(/^PT.s?|^PTs/,'')
        + '</td>'
        + '<td style="padding:5px 8px;text-align:right;font-weight:600;">' + fmtRp(r.total_revenue) + '</td>'
        + '<td style="padding:5px 8px;text-align:right;color:var(--text-muted);">' + fmtRp(r.total_margin) + '</td>'
        + '<td style="padding:5px 8px;text-align:right;color:var(--primary);font-weight:600;">' + (+r.total_revenue/totalRev*100).toFixed(1) + '%</td>'
        + '</tr>'
      ).join('')
    + '<tr style="background:var(--surface2);font-weight:700;">'
    + '<td style="padding:5px 8px;">TOTAL</td>'
    + '<td style="padding:5px 8px;text-align:right;">' + fmtRp(totalRev) + '</td>'
    + '<td style="padding:5px 8px;text-align:right;">' + fmtRp(data.reduce((s,r)=>s+ +r.total_margin,0)) + '</td>'
    + '<td style="padding:5px 8px;text-align:right;">100%</td>'
    + '</tr></tbody></table>'
  );
}

function renderPaymentChart(data) {
  destroyChart('paymentChart');
  const canvas = $('paymentChart');
  if (!canvas) return;
  if (!data.length) { htm('paymentDetail',''); return; }

  const totalRev = data.reduce((s,r) => s + +r.total_revenue, 0);
  const payColors = ['#0B3D6B','#1A7F7A','#E8A020','#8E44AD'];

  _charts['paymentChart'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(r => r.payment_term),
      datasets: [{ data: data.map(r => +r.total_revenue), backgroundColor: payColors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: { ...TT, callbacks: {
          label: ctx => ' ' + ctx.label + ': ' + fmtRp(ctx.raw) + ' (' + (ctx.raw/totalRev*100).toFixed(1) + '%)'
        }}
      }
    }
  });

  // Detail breakdown below chart
  htm('paymentDetail',
    '<div style="display:flex;flex-direction:column;gap:6px;">'
    + data.map((r, i) => {
        const pct = (+r.total_revenue / totalRev * 100).toFixed(1);
        return '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + (payColors[i]||'#8EA0B8') + ';flex-shrink:0;"></span>'
          + '<span style="font-size:12px;flex:1;">' + r.payment_term + '</span>'
          + '<span style="font-size:12px;font-weight:600;">' + fmtRp(r.total_revenue) + '</span>'
          + '<span style="font-size:11px;color:var(--primary);font-weight:700;min-width:38px;text-align:right;">' + pct + '%</span>'
          + '</div>';
      }).join('')
    + '<div style="border-top:1px solid var(--border);padding-top:6px;margin-top:2px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;">'
    + '<span>TOTAL</span><span>' + fmtRp(totalRev) + '</span>'
    + '</div>'
    + '</div>'
  );
}

function renderOwnerChart(data) {
  destroyChart('ownerChart');
  const canvas = $('ownerChart');
  if (!canvas) return;
  if (!data.length) { htm('ownerDetail',''); return; }

  const ownerColors = { Irma: '#C8392B', Jordan: '#0B3D6B', Robin: '#1A7A4A' };
  const totalRev = data.reduce((s, o) => s + +o.revenue, 0);

  _charts['ownerChart'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(o => o.sales_owner),
      datasets: [{ data: data.map(o => +o.revenue), backgroundColor: data.map(o => ownerColors[o.sales_owner] || '#8EA0B8'), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: { ...TT, callbacks: {
          label: ctx => ' ' + ctx.label + ': ' + fmtRp(ctx.raw) + ' (' + (ctx.raw/totalRev*100).toFixed(1) + '%)'
        }}
      }
    }
  });

  // Detail breakdown below chart
  htm('ownerDetail',
    '<div style="display:flex;flex-direction:column;gap:8px;">'
    + data.map(o => {
        const pct    = (+o.revenue / totalRev * 100).toFixed(1);
        const color  = ownerColors[o.sales_owner] || '#8EA0B8';
        const badge  = o.sales_owner === 'Irma' ? '<span class="oi">' + o.sales_owner + '</span>' : o.sales_owner === 'Robin' ? '<span class="or">' + o.sales_owner + '</span>' : '<span class="oj">' + o.sales_owner + '</span>';
        return '<div style="background:var(--surface2);border-radius:8px;padding:10px 12px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:' + color + ';"></span>'
          + badge
          + '<span style="font-size:11px;color:var(--text-muted);">' + o.deals + ' inquiries</span>'
          + '</div>'
          + '<div style="text-align:right;">'
          + '<div style="font-size:13px;font-weight:700;">' + fmtRp(o.revenue) + '</div>'
          + '<div style="font-size:11px;color:var(--primary);font-weight:600;">' + pct + '% of pipeline</div>'
          + '</div></div>'
          + '<div style="background:var(--border);border-radius:4px;height:6px;overflow:hidden;">'
          + '<div style="background:' + color + ';height:100%;width:' + pct + '%;border-radius:4px;transition:width 0.5s;"></div>'
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--text-muted);">'
          + '<span>Margin: ' + fmtRp(o.margin) + '</span>'
          + '<span>Avg deal: ' + fmtRp(+o.revenue / +o.deals) + '</span>'
          + '</div>'
          + '</div>';
      }).join('')
    + '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:2px;display:flex;justify-content:space-between;font-size:12px;font-weight:700;">'
    + '<span>TOTAL PIPELINE</span>'
    + '<span>' + fmtRp(totalRev) + '</span>'
    + '</div>'
    + '</div>'
  );
}

function renderPipelineTable(data) {
  if (!data.length) {
    htm('pipelineTbody', '<tr><td colspan="18" style="text-align:center;padding:40px;color:var(--text-muted);">No pipeline data — run node db/seed.js</td></tr>');
    txt('tableCount', 'No records');
    return;
  }
  htm('pipelineTbody', data.map(r => {
    const mp  = (parseFloat(r.margin_pct) || 0) * 100;
    const mc  = mp > 30 ? 'color:var(--success);font-weight:600' : mp < 15 ? 'color:var(--danger)' : '';
    const isQ = r.stage === 'Quotation';
    const prob = parseFloat(r.probability_pct || 0);
    const probBadge = prob > 0 ? '<span class="prob-hi">' + (prob*100).toFixed(0) + '%</span>' : '<span class="prob-lo">0%</span>';
    const noteIcon  = r.notes ? '<span title="' + r.notes.replace(/"/g,'&quot;') + '" style="cursor:help;color:var(--accent);">📌</span>' : '—';
    const ownerBadge = r.sales_owner === 'Jordan' ? '<span class="oj">Jordan</span>' : r.sales_owner === 'Irma' ? '<span class="oi">Irma</span>' : r.sales_owner === 'Robin' ? '<span class="or">Robin</span>' : (r.sales_owner || '—');
    const ATTACH_COLORS = { 'Quotation': '#E3F0FF:#1A5AA0', 'PO': '#E8F5E9:#1E8449', 'Payment': '#FFF8E1:#B7770D', 'Delivery Order': '#F3E5F5:#7B1FA2', 'Invoice': '#FDE8E8:#C0392B' };
    const attachParts  = r.attachment && ATTACH_COLORS[r.attachment] ? ATTACH_COLORS[r.attachment].split(':') : null;
    const attachBadge  = attachParts
      ? '<span style="background:' + attachParts[0] + ';color:' + attachParts[1] + ';padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;">' + r.attachment + '</span>'
      : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    // Action read-only: diambil dari company_action (set di Pipeline Connection table)
    const companyAction = r.company_action || '';
    const ATTACH_ACT = { 'Follow Up 0-7 days':'#E8F5E9:#1E8449', 'Follow Up 7-14 days':'#E3F0FF:#1A5AA0', 'Follow Up 14-28 days':'#FFF8E1:#B7770D', 'Follow Up >30 days':'#F4F6F8:#5D6D7E' };
    const actParts = companyAction && ATTACH_ACT[companyAction] ? ATTACH_ACT[companyAction].split(':') : null;
    const actionBadge = actParts
      ? '<span style="background:' + actParts[0] + ';color:' + actParts[1] + ';padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap;">' + companyAction + '</span>'
      : '<span style="color:var(--text-muted);font-size:11px;">—</span>';
    return '<tr>'
      + '<td style="white-space:nowrap;font-size:11px;">' + fmtDate(r.opportunity_date) + '</td>'
      + '<td style="font-size:12px;max-width:160px;">' + (r.customer||'') + '</td>'
      + '<td style="font-size:12px;">' + (r.location||'—') + '</td>'
      + '<td style="font-size:12px;max-width:140px;">' + (r.product||'') + '</td>'
      + '<td class="num">' + fmtN(r.volume_kg) + '</td>'
      + '<td class="num" style="font-weight:600;">' + fmtRp(r.revenue) + '</td>'
      + '<td class="num">' + fmtRp(r.margin) + '</td>'
      + '<td class="num" style="' + mc + '">' + mp.toFixed(1) + '%</td>'
      + '<td><span class="stag">' + (r.source||'—') + '</span></td>'
      + '<td style="font-size:12px;">' + (r.payment_term||'') + '</td>'
      + '<td><span class="sb ' + (isQ ? 'sq' : 'sl') + '">' + r.stage + '</span></td>'
      + '<td>' + probBadge + '</td>'
      + '<td>' + ownerBadge + '</td>'
      + '<td style="font-size:11px;color:var(--text-muted);">' + fmtDate(r.expected_close_date) + '</td>'
      + '<td style="text-align:center;">' + noteIcon + '</td>'
      + '<td style="text-align:center;">' + attachBadge + '</td>'
      + '<td style="text-align:center;">' + actionBadge + '</td>'
      + '<td style="white-space:nowrap;">'
      + '<button class="btn btn-ghost btn-sm" onclick="openEditPipeline(' + r.id + ')">✏️</button> '
      + '<button class="btn btn-ghost btn-sm" onclick="deletePipeline(' + r.id + ')" style="color:var(--danger);">🗑</button>'
      + '</td></tr>';
  }).join(''));
  txt('tableCount', 'Showing ' + data.length + ' of ' + _pipelineData.length + ' records');
}

function filterPipeline() {
  const q  = ($('pipelineSearch').value || '').toLowerCase();
  const st = $('stageFilter').value;
  const ow = $('ownerFilter').value;
  renderPipelineTable(_pipelineData.filter(r =>
    (!q  || (r.customer||'').toLowerCase().includes(q) || (r.product||'').toLowerCase().includes(q) || (r.location||'').toLowerCase().includes(q)) &&
    (!st || r.stage === st) &&
    (!ow || r.sales_owner === ow)
  ));
}

// Pipeline CRUD
function openAddPipeline() {
  $('pipelineForm').reset();
  $('pipelineFormId').value = '';
  txt('pipelineModalTitle', 'Add Opportunity');
  $('pipelineModal').classList.add('open');
}
function closePipelineModal() { $('pipelineModal').classList.remove('open'); }

async function openEditPipeline(id) {
  // Fetch fresh dari server agar tidak baca data stale dari cache
  let r = null;
  try {
    const fresh = await api('api/pipeline');
    r = fresh.find(x => x.id === id);
    if (r) {
      // Sync _pipelineData agar konsisten
      const idx = _pipelineData.findIndex(x => x.id === id);
      if (idx !== -1) _pipelineData[idx] = r;
      else _pipelineData.push(r);
    }
  } catch (_) {}
  if (!r) r = _pipelineData.find(x => x.id === id);
  if (!r) return;
  $('pipelineFormId').value     = r.id;
  $('pf_date').value            = fmtDate(r.opportunity_date);
  $('pf_sales_owner').value     = r.sales_owner || '';
  $('pf_customer').value        = r.customer || '';
  $('pf_location').value        = r.location || '';
  $('pf_source').value          = r.source   || '';
  $('pf_product').value         = r.product  || '';
  $('pf_volume_kg').value       = parseFloat(r.volume_kg)      || 0;
  $('pf_payment_term').value    = r.payment_term || 'CASH';
  $('pf_buying_price').value    = parseFloat(r.buying_price_kg) || 0;
  $('pf_selling_price').value   = parseFloat(r.selling_price_kg)|| 0;
  $('pf_transport').value       = parseFloat(r.transport)       || 0;
  $('pf_financing').value       = parseFloat(r.financing)       || 0;
  $('pf_stage').value           = r.stage;
  $('pf_notes').value           = r.notes || '';
  if ($('pf_attachment')) $('pf_attachment').value = r.attachment || '';
  txt('pipelineModalTitle', 'Edit Opportunity');
  $('pipelineModal').classList.add('open');
  updateMarginPreview();
}

async function savePipeline() {
  const id = $('pipelineFormId').value;

  // Manual validation — Save button is type="button" so HTML5 required is bypassed
  const requiredFields = [
    ['pf_date',          'Date'],
    ['pf_customer',      'Customer'],
    ['pf_product',       'Product'],
    ['pf_volume_kg',     'Volume (kg)'],
    ['pf_buying_price',  'Buying Price'],
    ['pf_selling_price', 'Selling Price'],
    ['pf_sales_owner',   'Sales Person'],
  ];
  for (const [fid, label] of requiredFields) {
    const el = $(fid);
    if (!el || !el.value.toString().trim()) {
      showToast(label + ' is required', 'error');
      if (el) el.focus();
      return;
    }
  }

  const body = {
    opportunity_date:  $('pf_date').value,
    customer:          $('pf_customer').value,
    location:          $('pf_location').value,
    product:           $('pf_product').value,
    volume_kg:         parseFloat($('pf_volume_kg').value)    || 0,
    source:            $('pf_source').value,
    buying_price_kg:   parseFloat($('pf_buying_price').value) || 0,
    selling_price_kg:  parseFloat($('pf_selling_price').value)|| 0,
    transport:         parseFloat($('pf_transport').value)    || 0,
    financing:         parseFloat($('pf_financing').value)    || 0,
    payment_term:      $('pf_payment_term').value,
    stage:             $('pf_stage').value,
    probability_pct:   { 'Inquiries':0.10, 'Qualified Leads':0.25, 'Technical Discussion':0.50,
                         'Quotation':0.60, 'Negotiation':0.85, 'Won':1.0, 'Lost':0 }[$('pf_stage').value] ?? 0.6,
    sales_owner:       $('pf_sales_owner').value,
    notes:             $('pf_notes').value,
    attachment:        $('pf_attachment') ? $('pf_attachment').value || null : null,
    // action TIDAK dikirim dari form modal — diupdate inline di tabel via PATCH
  };
  console.log('[savePipeline] id:', id, 'sales_owner:', body.sales_owner, 'body:', JSON.stringify(body));
  try {
    const url = id ? 'api/pipeline/' + id : 'api/pipeline';
    const res = await authFetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        console.error('[savePipeline] Non-JSON error response:', res.status, ct);
        throw new Error('Server error ' + res.status + ' — session mungkin expired, coba refresh halaman.');
      }
      const errJson = await res.json();
      console.error('[savePipeline] Error response:', res.status, errJson);
      throw new Error('Save failed: ' + (errJson.error || res.status));
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      let preview = '';
      try { preview = (await res.text()).substring(0, 200); } catch(_) {}
      console.error('[savePipeline] Expected JSON but got:', ct, 'status:', res.status, 'body preview:', preview);
      throw new Error('Response tidak valid (status=' + res.status + ', type="' + ct + '"). Coba Ctrl+Shift+R lalu login ulang.');
    }
    const saved = await res.json();
    console.log('[savePipeline] Server confirmed sales_owner:', saved.sales_owner);
    // Update _pipelineData langsung dari response server (tidak perlu tunggu loadP3)
    if (id && saved) {
      const idx = _pipelineData.findIndex(x => x.id === saved.id);
      if (idx !== -1) _pipelineData[idx] = { ..._pipelineData[idx], ...saved };
      else _pipelineData.push(saved);
    }
    closePipelineModal();
    // Reset filters agar row hasil edit langsung terlihat
    if ($('ownerFilter')) $('ownerFilter').value = '';
    if ($('stageFilter')) $('stageFilter').value = '';
    if ($('pipelineSearch')) $('pipelineSearch').value = '';
    // Refresh dari DB dulu, baru tampilkan toast konfirmasi
    filterPipeline(); // optimistic render sementara
    await loadP3();   // sync data dari DB
    showToast(id ? 'Opportunity updated' : 'Opportunity added');
  } catch (e) { showToast(e.message, 'error'); }
}

async function deletePipeline(id) {
  if (!confirm('Delete this opportunity?')) return;
  try {
    await authFetch('api/pipeline/' + id, { method: 'DELETE' });
    await loadP3();
    showToast('Opportunity deleted');
  } catch (e) { showToast('Delete failed', 'error'); }
}

function updateMarginPreview() {
  const vol  = parseFloat($('pf_volume_kg').value)     || 0;
  const buy  = parseFloat($('pf_buying_price').value)  || 0;
  const sell = parseFloat($('pf_selling_price').value) || 0;
  const trn  = parseFloat($('pf_transport').value)     || 0;
  const fin  = parseFloat($('pf_financing').value)     || 0;
  const rev    = vol * sell;
  const margin = rev - vol * buy - trn - fin;
  const pct    = rev > 0 ? (margin / rev * 100).toFixed(1) : '0.0';
  txt('pf_margin_preview', 'Rev: ' + fmtRp(rev) + '  ·  Margin: ' + fmtRp(margin) + ' (' + pct + '%)');
}

// ═══════════════════════════════════════════════════════════════
// P4 — CUSTOMER RELATIONSHIP
// ═══════════════════════════════════════════════════════════════
let _crmCache = [];

async function loadP4() {
  try {
    const accounts = await api('api/crm/accounts');
    _crmCache = accounts; // cache untuk openEditInquiry

    const ongoing = accounts.filter(a => (a.status||'').toLowerCase().includes('on-going'));
    const eproc   = accounts.filter(a => (a.status||'').toLowerCase().includes('eproc'));
    const linked  = accounts.filter(a => parseInt(a.pipeline && a.pipeline.active_deals || 0) > 0);

    txt('mc-crm-accounts',   accounts.length);
    txt('mc-crm-inquiries',  ongoing.length);
    txt('mc-crm-eproc',      eproc.length);
    txt('mc-crm-eproc-names', eproc.map(a => a.company.replace('PT. ','')).join(' · ') || '—');
    txt('mc-crm-linked',     linked.length);

    const badge = $('badge-p4');
    if (badge) badge.textContent = accounts.length;
    // Update subtitle with live count
    const subtitle = $('p4-subtitle');
    if (subtitle) subtitle.textContent = accounts.length + ' active customer accounts — ongoing inquiries, contacts & next steps';

    if (!accounts.length) {
      htm('crmCards', '<div style="padding:40px;text-align:center;color:var(--text-muted);">No CRM accounts — run node db/seed.js</div>');
      return;
    }

    htm('crmCards', '<div class="crm-grid">' + accounts.map(a => {
      const isIrma  = a.owner === 'Irma';
      const isRobin = a.owner === 'Robin';
      const isEproc = (a.status||'').toLowerCase().includes('eproc');
      const badge   = isIrma ? '<span class="oi">Irma</span>' : isRobin ? '<span class="or">Robin</span>' : '<span class="oj">Jordan</span>';
      const contacts = (a.contacts||[]).map(c => {
        const role  = c.role ? ' <span style="color:var(--text-muted);font-size:10px;">· ' + c.role + '</span>' : '';
        const phone = c.email
          ? '<a href="mailto:' + c.email + '" style="color:var(--primary-light);text-decoration:none;font-size:11px;">✉ ' + c.email + '</a>'
          : (c.phone && c.phone !== '—' ? '<span style="font-family:monospace;font-size:11px;">📞 ' + c.phone + '</span>' : '—');
        return '<div class="crm-contact-row">'
          + '<div style="flex:1;min-width:0;"><span style="font-size:12px;font-weight:600;">' + (c.name||'—') + '</span>' + role + '</div>'
          + '<div style="white-space:nowrap;">' + phone + '</div>'
          + '</div>';
      }).join('');

      // Fallback: subsector dan nextstep
      const subsectorVal = a.subsector
        || (a.sub_sectors && a.sub_sectors.length ? a.sub_sectors.map(s => s.sector_name).join(' · ') : '—');
      const nextstepVal  = a.nextstep
        || (a.next_steps  && a.next_steps.length  ? a.next_steps.map(n => n.step_text).join(' | ')  : '—');

      // Activity stats dari sales_activities
      const acts = a.activity_stats || {};
      const hasActs = +acts.total_calls > 0 || +acts.total_meetings > 0 || +acts.total_quotations > 0;
      const actsHtml = hasActs
        ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">'
          + (+acts.total_calls    > 0 ? '<span style="font-size:10px;background:var(--surface2);padding:2px 7px;border-radius:8px;color:var(--text-muted);">📞 ' + acts.total_calls + ' calls</span>' : '')
          + (+acts.total_meetings > 0 ? '<span style="font-size:10px;background:var(--surface2);padding:2px 7px;border-radius:8px;color:var(--text-muted);">🤝 ' + acts.total_meetings + ' meetings</span>' : '')
          + (+acts.total_quotations > 0 ? '<span style="font-size:10px;background:var(--surface2);padding:2px 7px;border-radius:8px;color:var(--primary);">📄 ' + acts.total_quotations + ' quotations</span>' : '')
          + (acts.last_visit ? '<span style="font-size:10px;color:var(--text-muted);">Last: ' + fmtDate(acts.last_visit) + '</span>' : '')
          + '</div>'
        : '';

      // Status pill only — stage & follow-up dihapus dari halaman ini
      return '<div class="crm-card ' + (isIrma ? 'irma' : isRobin ? 'robin' : 'jordan') + '">'
        + '<div class="crm-top">'
        + '<div class="crm-no" style="' + (isIrma ? 'background:var(--danger);' : isRobin ? 'background:#1A7A4A;' : '') + '">' + a.sort_order + '</div>'
        + '<div class="crm-name">' + a.company + '</div>'
        + '<span class="cstat-pill ' + (isEproc ? 'eproc' : '') + '">' + (a.status||'—') + '</span>'
        + '</div>'
        + '<div class="crm-body">'
        + '<div class="crm-row"><span class="crm-lbl">Idea</span><span class="crm-val">' + (a.idea||'—') + '</span></div>'
        + '<div class="crm-row"><span class="crm-lbl">Sector</span><span class="crm-val" style="color:var(--text-muted);">' + subsectorVal + '</span></div>'
        + '<div class="crm-row"><span class="crm-lbl">Next</span><span class="crm-val" style="font-size:11px;color:var(--text-secondary);">' + nextstepVal + '</span></div>'
        + (contacts ? '<div style="margin-top:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">👤 Contacts</div>' + contacts + '</div>' : '')
        + actsHtml
        + '<div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;">'
        + '<span style="font-size:11px;color:var(--text-muted);">' + (a.synthesis||'') + '</span>'
        + badge
        + '</div>'
        + '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">'
        + '<button onclick="openEditInquiry(' + a.id + ')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;color:var(--primary);font-family:DM Sans,sans-serif;">✏️ Edit</button>'
        + '<button onclick="openCopyToSupplier(' + a.id + ')" style="background:none;border:1px solid #1A7A4A;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;color:#1A7A4A;font-family:DM Sans,sans-serif;" title="Salin ke Supplier List">🏭 Copy to Supplier</button>'
        + '<button onclick="deleteInquiry(' + a.id + ',\'' + a.company.replace(/'/g,"\'") + '\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;color:var(--danger);font-family:DM Sans,sans-serif;">🗑 Delete</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('') + '</div>');

    // Pipeline connection table — editable action per company + Submit button
    const linked2 = accounts.filter(a => parseInt(a.pipeline && a.pipeline.total_deals || 0) > 0);
    htm('crmPipelineTable', linked2.length
      ? linked2.map(a => {
          const ps          = classifyPipelineStage(a.pipeline);
          const curAction   = a.action || '';
          const safeCompany = a.company.replace(/'/g, "\\'");
          const actionOpts  = ACTION_OPTIONS.map(o =>
            '<option value="' + o.value + '"' + (curAction === o.value ? ' selected' : '') + '>' + o.label + '</option>'
          ).join('');
          const actionSel =
            '<div style="display:flex;align-items:center;gap:6px;">'
            + '<select class="action-sel crm-action-sel ' + actionClass(curAction) + '"'
            + ' id="cact-' + a.id + '"'
            + ' data-account-id="' + a.id + '"'
            + ' data-prev="' + curAction + '"'
            + ' onchange="this.className=\'action-sel crm-action-sel \'+actionClass(this.value)">'
            + actionOpts + '</select>'
            + '<button onclick="submitCompanyAction(' + a.id + ',\'' + safeCompany + '\')"'
            + ' style="background:var(--primary);color:white;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:DM Sans,sans-serif;white-space:nowrap;">Save</button>'
            + '</div>';
          return '<tr>'
            + '<td><b>' + a.company + '</b></td>'
            + '<td>' + a.pipeline.total_deals + ' inquiries (' + a.pipeline.lost_deals + ' lost · ' + a.pipeline.active_deals + ' active)</td>'
            + '<td class="num">' + fmtRp(a.pipeline.active_revenue||0) + '</td>'
            + '<td class="num">' + fmtRp(a.pipeline.active_margin||0)  + '</td>'
            + '<td><span class="' + ps.cssClass + '">' + ps.icon + ' ' + ps.stage + '</span></td>'
            + '<td style="min-width:200px;">' + actionSel + '</td>'
            + '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:16px;">No pipeline links yet</td></tr>'
    );

  } catch (e) {
    console.error('P4 error:', e);
    htm('crmCards', renderError(e, 'CRM Accounts'));
  }
}

// ─── COPY CUSTOMER → SUPPLIER ───────────────────────────────────────────
function openCopyToSupplier(accountId) {
  var a = (_crmCache || []).find(function(x){ return x.id === accountId; });
  if (!a) { showToast('Data tidak ditemukan, coba refresh', 'error'); return; }
  $('cts_account_id').value    = accountId;
  $('cts_company').value       = a.company || '';
  $('cts_contact_name').value  = (a.contacts && a.contacts[0]) ? a.contacts[0].name  || '' : '';
  $('cts_contact_phone').value = (a.contacts && a.contacts[0]) ? a.contacts[0].phone || '' : '';
  $('cts_notes').value         = a.synthesis || a.nextstep || '';
  $('cts_type').value          = 'Distributor';
  $('ctsModal').classList.add('open');
}

function closeCtsModal() { $('ctsModal').classList.remove('open'); }

async function saveCopyToSupplier() {
  var company = $('cts_company').value.trim();
  var type    = $('cts_type').value; // Distributor | Fabricator | OEM
  var contact = $('cts_contact_name').value.trim();
  var phone   = $('cts_contact_phone').value.trim();
  var notes   = $('cts_notes').value.trim();
  if (!company) { showToast('Nama perusahaan wajib diisi', 'error'); return; }
  var body = {
    category:         type,
    company_name:     company,
    location:         '',
    annual_volume_mt: 0,
    contact_name:     contact,
    contact_phone:    phone,
    notes:            notes
  };
  try {
    var res = await authFetch('api/market/stockists', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Gagal menyimpan: ' + res.status);
    closeCtsModal();
    showToast('✅ ' + company + ' berhasil disalin ke Supplier List sebagai ' + type);
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// P5 — SALES ACTIVITY
// ═══════════════════════════════════════════════════════════════
let _activitiesData  = [];
let _companyList     = []; // list of companies that have activities

async function loadP5() {
  try {
    _activitiesData = await api('api/activities');
    renderCompanyCards(_activitiesData);
  } catch (e) {
    console.error('P5 error:', e);
    htm('activitiesContent', renderError(e, 'Sales Activity'));
  }
}

function renderCompanyCards(data) {
  // Update metric cards
  var companies = [...new Set(data.map(function(r){ return r.customer_visited||''; }).filter(Boolean))];
  var actual    = data.filter(function(r){ return r.execution === 'Actual'; }).length;
  var planning  = data.filter(function(r){ return r.execution !== 'Actual'; }).length;
  txt('mc-act-companies', companies.length);
  txt('mc-act-total',    data.length);
  txt('mc-act-actual',   actual);
  txt('mc-act-planning', planning);

  if (!data.length && !_companyList.length) {
    htm('activitiesContent',
      '<div class="empty"><div class="eicon">🏢</div>'
      + '<div class="etitle">No Companies Yet</div>'
      + '<div class="edesc">Click "+ Add Company" to start tracking activities.</div>'
      + '</div>'
    );
    return;
  }

  // Group by company
  var groups = {};
  // Start with existing companies (even if 0 activities after filter)
  _companyList.forEach(function(c) { if (!groups[c]) groups[c] = []; });
  data.forEach(function(r) {
    var key = r.customer_visited || '';
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  // Sort: by most recent activity
  var sortedKeys = Object.keys(groups).sort(function(a, b) {
    var latA = groups[a].length ? groups[a][0].activity_date : '0';
    var latB = groups[b].length ? groups[b][0].activity_date : '0';
    return latA > latB ? -1 : 1;
  });

  var html = sortedKeys.map(function(company, ci) {
    var rows    = groups[company];
    var cardId  = 'act-group-' + ci;
    var persons = [...new Set(rows.map(function(r){ return r.sales_person; }).filter(Boolean))];
    var totalCalls = rows.reduce(function(s,r){ return s+(+r.calls_made||0); },0);
    var totalMeet  = rows.reduce(function(s,r){ return s+(+r.meetings||0); },0);
    var totalQuot  = rows.reduce(function(s,r){ return s+(+r.quotations_sent||0); },0);
    var actActual  = rows.filter(function(r){ return r.execution==='Actual'; }).length;
    var actPlan    = rows.filter(function(r){ return r.execution!=='Actual'; }).length;
    var lastDate   = rows.length ? rows[0].activity_date : null;

    var personBadges = persons.map(function(p) {
      return p === 'Jordan' ? '<span class="oj">Jordan</span>' : p === 'Robin' ? '<span class="or">Robin</span>' : '<span class="oi">' + p + '</span>';
    }).join(' ');

    // Activity rows table
    var rowsHtml = rows.length ? rows.map(function(r) {
      var execBadge = r.execution === 'Actual'
        ? '<span style="background:#E8F5E9;color:#1E8449;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">✅ Actual</span>'
        : '<span style="background:#FFF8E1;color:#B7770D;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">📋 Planning</span>';
      var pb = r.sales_person === 'Jordan' ? '<span class="oj">Jordan</span>'
             : r.sales_person === 'Irma'   ? '<span class="oi">Irma</span>'
             : r.sales_person === 'Robin'  ? '<span class="or">Robin</span>'
             : (r.sales_person||'—');
      var auditHtml = r.updated_at
        ? '<div style="font-size:10px;color:var(--text-muted);"><b>' + (r.updated_by||'—') + '</b><br>' + fmtDate(r.updated_at) + '</div>'
          + '<button onclick="showActivityHistory(' + r.id + ')" style="margin-top:3px;background:none;border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-size:10px;cursor:pointer;color:var(--primary);font-family:DM Sans,sans-serif;">📋 History</button>'
        : '—';
      return '<tr>'
        + '<td style="white-space:nowrap;font-size:12px;">' + fmtDate(r.activity_date) + '</td>'
        + '<td>' + pb + '</td>'
        + '<td class="num">' + (r.calls_made||0) + '</td>'
        + '<td class="num">' + (r.meetings||0) + '</td>'
        + '<td class="num">' + (r.quotations_sent||0) + '</td>'
        + '<td class="num">' + (r.new_opportunities||0) + '</td>'
        + '<td class="num">' + (r.deals_closed||0) + '</td>'
        + '<td>' + execBadge + '</td>'
        + '<td style="font-size:12px;max-width:280px;">' + (r.notes||'—') + '</td>'
        + '<td>' + auditHtml + '</td>'
        + '<td style="white-space:nowrap;">'
        + '<button class="btn btn-ghost btn-sm" onclick="openEditActivity(' + r.id + ')">✏️</button> '
        + '<button class="btn btn-ghost btn-sm" onclick="deleteActivity(' + r.id + ')" style="color:var(--danger);">🗑</button>'
        + '</td>'
        + '</tr>';
    }).join('')
    : '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">No activities yet — click <b>+ Add Activity</b> to start tracking.</td></tr>';

    return '<div class="act-company-card">'
      // ── Header ──
      + '<div class="act-company-header" data-gid="' + cardId + '" onclick="toggleActGroup(this.dataset.gid)">'
      + '<span class="act-chevron" id="' + cardId + '-chev" style="font-size:11px;color:var(--text-muted);transition:transform 0.2s;transform:rotate(90deg);">▶</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="act-company-name">' + company + '</div>'
      + '<div class="act-stats-row" style="margin-top:3px;">'
      + '<span class="act-stat"><b>' + rows.length + '</b> ' + (rows.length===1?'activity':'activities') + '</span>'
      + (totalCalls ? '<span class="act-stat">📞 <b>' + totalCalls + '</b></span>' : '')
      + (totalMeet  ? '<span class="act-stat">🤝 <b>' + totalMeet  + '</b></span>' : '')
      + (totalQuot  ? '<span class="act-stat">📄 <b>' + totalQuot  + '</b></span>' : '')
      + (actActual  ? '<span class="act-stat" style="color:#1E8449;">✅ <b>' + actActual + '</b> actual</span>' : '')
      + (actPlan    ? '<span class="act-stat" style="color:#B7770D;">📋 <b>' + actPlan   + '</b> planning</span>' : '')
      + (lastDate   ? '<span class="act-stat">Last: <b>' + fmtDate(lastDate) + '</b></span>' : '')
      + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + personBadges
      + '<button class="btn btn-primary btn-sm" data-company="' + company.replace(/"/g, '&quot;') + '" onclick="event.stopPropagation(); openAddActivityForCompany(this.dataset.company)" style="font-size:11px;padding:4px 10px;white-space:nowrap;">+ Add Activity</button>'
      + '<button class="btn btn-ghost btn-sm" data-company="' + company.replace(/"/g, '&quot;') + '" onclick="event.stopPropagation(); removeCompany(this.dataset.company)" style="color:var(--text-muted);font-size:11px;" title="Remove company from list">✕</button>'
      + '</div>'
      + '</div>'
      // ── Body ──
      + '<div class="act-body" id="' + cardId + '-body" data-open="true" style="display:block;">'
      + '<div class="tscroll"><table class="dt">'
      + '<thead><tr><th>Date</th><th>Person</th>'
      + '<th class="num">Calls</th><th class="num">Meetings</th>'
      + '<th class="num">Quotations</th><th class="num">New Opps.</th>'
      + '<th class="num">Deals</th><th>Execution</th><th>Notes</th><th>Audit</th><th></th>'
      + '</tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody>'
      + '</table></div>'
      + '</div>'
      + '</div>';
  }).join('');

  htm('activitiesContent', html || '<div class="empty"><div class="eicon">🔍</div><div class="etitle">No results</div></div>');
}

// ── Company management ────────────────────────────────────────

function openAddCompany() {
  // Reset modal state
  switchAcTab('existing');
  if ($('addCompanyManual')) $('addCompanyManual').value = '';

  // Populate dropdown: CRM accounts + stockists (dist/fab)
  var sel = $('addCompanySelect');
  if (sel) {
    sel.innerHTML = '<option value="">— Select a company —</option>';
    Promise.all([
      api('api/crm/accounts').catch(function(){ return []; }),
      api('api/market/stockists').catch(function(){ return []; }),
    ]).then(function(results) {
      var crm       = results[0];
      var stockists = results[1];
      // CRM group
      if (crm.length) {
        var grp = document.createElement('optgroup');
        grp.label = '🤝 Customer List (CRM)';
        crm.forEach(function(a) {
          if (_companyList.includes(a.company)) return;
          var opt = document.createElement('option');
          opt.value = a.company; opt.textContent = a.company;
          grp.appendChild(opt);
        });
        if (grp.children.length) sel.appendChild(grp);
      }
      // Supplier group
      var suppCompanies = stockists.filter(function(s) {
        return !_companyList.includes(s.company_name);
      });
      if (suppCompanies.length) {
        var grp2 = document.createElement('optgroup');
        grp2.label = '🏭 Supplier List';
        suppCompanies.forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.company_name; opt.textContent = s.company_name + ' (' + s.category + ')';
          grp2.appendChild(opt);
        });
        if (grp2.children.length) sel.appendChild(grp2);
      }
    });
  }
  $('addCompanyModal').classList.add('open');
}

function closeAddCompany() { $('addCompanyModal').classList.remove('open'); }

function switchAcTab(tab) {
  var isExisting = tab === 'existing';
  var btnE = $('acTab-existing'), btnN = $('acTab-new');
  var paneE = $('acPane-existing'), paneN = $('acPane-new');
  if (btnE)  { btnE.style.background = isExisting ? 'var(--primary)' : 'var(--surface2)'; btnE.style.color = isExisting ? 'white' : 'var(--text-muted)'; }
  if (btnN)  { btnN.style.background = isExisting ? 'var(--surface2)' : 'var(--primary)'; btnN.style.color = isExisting ? 'var(--text-muted)' : 'white'; }
  if (paneE) paneE.style.display = isExisting ? '' : 'none';
  if (paneN) paneN.style.display = isExisting ? 'none' : '';
}

function updateAcSaveTo() {
  var radios = document.querySelectorAll('input[name="acSaveTo"]');
  var val = '';
  radios.forEach(function(r) { if (r.checked) val = r.value; });

  var crmFields  = $('acCrmFields');
  var suppFields = $('acSupplierFields');
  var hint       = $('acSaveToHint');
  var lCrm       = $('acSaveTo-crm');
  var lSupp      = $('acSaveTo-supplier');

  if (crmFields)  crmFields.style.display  = val === 'crm'      ? '' : 'none';
  if (suppFields) suppFields.style.display = val === 'supplier' ? '' : 'none';
  if (hint) hint.textContent = val === 'crm'
    ? 'Will be added to Customer List — complete details there later.'
    : 'Will be added to Supplier List — complete details there later.';
  if (lCrm)  lCrm.style.borderColor  = val === 'crm'      ? 'var(--primary)' : 'var(--border)';
  if (lSupp) lSupp.style.borderColor = val === 'supplier' ? 'var(--primary)' : 'var(--border)';
}

async function confirmAddCompany() {
  var paneE   = $('acPane-existing');
  var isExist = paneE && paneE.style.display !== 'none';
  var company = '';

  if (isExist) {
    var sel = $('addCompanySelect');
    company = sel ? sel.value : '';
    if (!company) { showToast('Please select a company', 'error'); return; }
    if (_companyList.includes(company)) { showToast(company + ' already added', 'error'); return; }
    _companyList.push(company);
    closeAddCompany();
    renderCompanyCards(_activitiesData);
    showToast('Company added: ' + company);
  } else {
    company = $('addCompanyManual') ? $('addCompanyManual').value.trim() : '';
    if (!company) { showToast('Please enter a company name', 'error'); return; }
    if (_companyList.includes(company)) { showToast(company + ' already added', 'error'); return; }

    var radios = document.querySelectorAll('input[name="acSaveTo"]');
    var saveTo = 'crm';
    radios.forEach(function(r) { if (r.checked) saveTo = r.value; });

    if (saveTo === 'crm') {
      try {
        var owner = $('acOwner') ? $('acOwner').value : 'Jordan';
        var res = await authFetch('api/crm/accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company: company, owner: owner, status: 'Prospect', idea: '', synthesis: '', contacts: [] })
        });
        if (!res.ok) throw new Error('CRM save failed');
        _crmCache = await api('api/crm/accounts').catch(function(){ return _crmCache; });
        showToast('Added to Customer List ✅');
      } catch(e) { showToast('Could not save to CRM: ' + e.message, 'error'); return; }
    } else if (saveTo === 'supplier') {
      try {
        var stype = $('acSupplierType') ? $('acSupplierType').value : 'Distributor';
        var url, payload;
        if (stype === 'global') {
          url     = 'api/market/manufacturers/global';
          payload = { brand: company, mill_name: company, country: '' };
        } else if (stype === 'china') {
          url     = 'api/market/manufacturers/china';
          payload = { brand: company, mill_name: company, city_province: '' };
        } else if (stype === 'trading') {
          url     = 'api/market/trading';
          payload = { company_name: company, brand: '', annual_volume_mt: 0, market_share_pct: 0, color_hex: '#0B3D6B' };
        } else {
          // Distributor or Fabricator
          url     = 'api/market/stockists';
          payload = { company_name: company, category: stype, location: '', annual_volume_mt: 0 };
        }
        var res = await authFetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Supplier save failed');
        showToast('Added to Supplier List ✅');
      } catch(e) { showToast('Could not save to Supplier List: ' + e.message, 'error'); return; }
    }

    _companyList.push(company);
    closeAddCompany();
    renderCompanyCards(_activitiesData);
  }

  setTimeout(function() {
    document.querySelectorAll('.act-company-name').forEach(function(el) {
      if (el.textContent.trim() === company.trim())
        el.closest('.act-company-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, 150);
}


function removeCompany(company) {
  if (!confirm('Remove "' + company + '" from list? Activities will not be deleted.')) return;
  _companyList = _companyList.filter(function(c){ return c !== company; });
  renderCompanyCards(_activitiesData.filter(function(r){ return r.customer_visited !== company; }));
}

// ── Activity modal (per company) ─────────────────────────────

function openAddActivityForCompany(company) {
  $('activityForm').reset();
  // Set after reset (reset clears hidden inputs in some browsers)
  setTimeout(function() {
    var u = window.SC_USER || {};
    var personName = u.name || '';
    // Role admin/observer sudah dihapus di SalesConnect — semua orang yang
    // punya akses modul ini boleh mengubah sales person (CRUD penuh).
    $('af_activity_id').value = '';
    $('af_company').value     = company;
    var sel = $('af_person');
    if (sel) {
      sel.value    = personName;
      sel.disabled = false;
      sel.style.background = '';
    }
    var lbl = $('af_company_label');
    if (lbl) lbl.textContent = '🏢 ' + company;
    if ($('af_execution')) $('af_execution').value = 'Planning';
  }, 0);
  txt('activityModalTitle', 'Add Activity');
  $('activityModal').classList.add('open');
}

// Keep old openAddActivity for backward compat
function openAddActivity() {
  openAddActivityForCompany('');
}

function openEditActivity(id) {
  var r = _activitiesData.find(function(x){ return x.id === id; });
  if (!r) return;
  $('af_activity_id').value = r.id;
  $('af_company').value     = r.customer_visited || '';
  txt('af_company_label',   '🏢 ' + (r.customer_visited||'—'));
  $('af_date').value        = fmtDate(r.activity_date);
  var sel_e = $('af_person');
  if (sel_e) {
    sel_e.value    = r.sales_person || '';
    sel_e.disabled = false;
    sel_e.style.background = '';
  }
  $('af_calls').value       = r.calls_made || 0;
  $('af_meetings').value    = r.meetings || 0;
  $('af_quotations').value  = r.quotations_sent || 0;
  $('af_opps').value        = r.new_opportunities || 0;
  $('af_deals').value       = r.deals_closed || 0;
  $('af_notes').value       = r.notes || '';
  if ($('af_execution')) $('af_execution').value = r.execution || 'Planning';
  txt('activityModalTitle', 'Edit Activity');
  $('activityModal').classList.add('open');
}

function closeActivityModal() { $('activityModal').classList.remove('open'); }

async function saveActivity() {
  var id      = $('af_activity_id').value;
  var company = $('af_company').value;
  var body = {
    activity_date:     $('af_date').value,
    sales_person:      $('af_person').value,
    customer_visited:  company,
    calls_made:        parseInt($('af_calls').value)      || 0,
    meetings:          parseInt($('af_meetings').value)   || 0,
    quotations_sent:   parseInt($('af_quotations').value) || 0,
    new_opportunities: parseInt($('af_opps').value)       || 0,
    deals_closed:      parseInt($('af_deals').value)      || 0,
    notes:             $('af_notes').value,
    execution:         $('af_execution') ? $('af_execution').value : 'Planning',
    updated_by:        $('af_person').value,
  };
  if (!body.activity_date) {
    showToast('Date is required', 'error'); return;
  }
  if (!body.sales_person) {
    var u2 = window.SC_USER || {};
    body.sales_person = u2.name || '';
    body.updated_by   = body.sales_person;
    $('af_person').value = body.sales_person;
  }
  try {
    var url = id ? 'api/activities/' + id : 'api/activities';
    var method = id ? 'PUT' : 'POST';
    var res = await authFetch(url, { method: method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) {
      var msg = 'Save failed: ' + res.status;
      try { var errJson = await res.json(); msg = errJson.error || msg; } catch(_) {}
      throw new Error(msg);
    }
    // Add company to list if not there
    if (company && !_companyList.includes(company)) _companyList.push(company);
    closeActivityModal();
    await loadP5();
    showToast(id ? 'Activity updated' : 'Activity added');
  } catch (e) { showToast(e.message, 'error'); }
}

async function showActivityHistory(id) {
  var row   = _activitiesData.find(function(r) { return r.id === id; });
  var modal = $('historyModal');
  var body  = $('historyBody');
  if (!modal || !body) return;

  var headerEl = $('historyHeader');
  if (headerEl && row) {
    headerEl.textContent = 'Edit History — ' + (row.customer_visited||'Activity') + ' (' + fmtDate(row.activity_date) + ')';
  }
  body.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  modal.classList.add('open');

  try {
    var history = await api('api/activities/' + id + '/history');
    if (!history.length) {
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No edit history for this activity yet.</div>';
      return;
    }
    var FIELD_LABELS = {
      activity_date:'Date', sales_person:'Sales Person', customer_visited:'Customer',
      calls_made:'Calls', meetings:'Meetings', quotations_sent:'Quotations',
      new_opportunities:'New Opps', deals_closed:'Deals Closed', notes:'Notes', execution:'Execution'
    };
    body.innerHTML = history.map(function(h, i) {
      var changes = h.field_changes || {};
      var entries = Object.entries(changes);
      var changesHtml = entries.length
        ? entries.map(function(e) {
            var label = FIELD_LABELS[e[0]] || e[0];
            var from  = e[1].from != null ? String(e[1].from) : '—';
            var to    = e[1].to   != null ? String(e[1].to)   : '—';
            return '<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">'
              + '<span style="min-width:110px;color:var(--text-muted);font-weight:600;">' + label + '</span>'
              + '<span style="flex:1;text-decoration:line-through;color:var(--danger);opacity:0.7;">' + from + '</span>'
              + '<span style="color:var(--text-muted);">→</span>'
              + '<span style="flex:1;color:var(--success);font-weight:600;">' + to + '</span>'
              + '</div>';
          }).join('')
        : '<div style="font-size:12px;color:var(--text-muted);padding:5px 0;">No field changes recorded.</div>';
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:10px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + '<span style="background:var(--primary);color:white;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">' + (history.length - i) + '</span>'
        + '<span style="font-weight:600;font-size:13px;">' + (h.edited_by||'Unknown') + '</span>'
        + '</div>'
        + '<span style="font-size:11px;color:var(--text-muted);">' + (h.edited_at ? new Date(h.edited_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : '—') + '</span>'
        + '</div>'
        + changesHtml
        + '</div>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<div style="padding:20px;color:var(--danger);">❌ ' + e.message + '</div>';
  }
}

function closeHistoryModal() {
  var modal = $('historyModal');
  if (modal) modal.classList.remove('open');
}

async function deleteActivity(id) {
  if (!confirm('Delete this activity?')) return;
  try {
    var res = await authFetch('api/activities/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    await loadP5();
    showToast('Activity deleted');
  } catch (e) { showToast(e.message, 'error'); }
}

function filterActivities() {
  var q    = ($('activitySearch').value || '').toLowerCase();
  var pers = $('actPersonFilter').value;
  var exec = $('actExecFilter').value;
  var filtered = _activitiesData.filter(function(r) {
    var matchQ = !q || (r.customer_visited||'').toLowerCase().includes(q)
                    || (r.sales_person||'').toLowerCase().includes(q)
                    || (r.notes||'').toLowerCase().includes(q);
    var matchP = !pers || r.sales_person === pers;
    var matchE = !exec || r.execution === exec;
    return matchQ && matchP && matchE;
  });
  renderCompanyCards(filtered);
}

function toggleActGroup(id) {
  var body = document.getElementById(id + '-body');
  var chev = document.getElementById(id + '-chev');
  if (!body) return;
  var isOpen = body.getAttribute('data-open') !== 'false';
  var nowOpen = !isOpen;
  body.setAttribute('data-open', String(nowOpen));
  body.style.display = nowOpen ? 'block' : 'none';
  if (chev) chev.style.transform = nowOpen ? 'rotate(90deg)' : 'rotate(0deg)';
}

function expandAllActivity(expand) {
  document.querySelectorAll('.act-body').forEach(function(el) {
    el.setAttribute('data-open', String(expand));
    el.style.display = expand ? 'block' : 'none';
  });
  document.querySelectorAll('.act-chevron').forEach(function(el) {
    el.style.transform = expand ? 'rotate(90deg)' : 'rotate(0deg)';
  });
}


// ═══════════════════════════════════════════════════════════════
// PX — SUPPLIER LIST
// ═══════════════════════════════════════════════════════════════
var currentSlTab = 'global';
let _slData = { global: [], china: [], trading: [], dist: [], fab: [] };

async function loadPX() {
  try {
    const [mfr, trading, stockists] = await Promise.all([
      api('api/market/manufacturers'),
      api('api/market/trading'),
      api('api/market/stockists'),
    ]);
    const glb  = mfr.global || [];
    const chn  = mfr.china  || [];
    const fab  = stockists.filter(s => s.category === 'Fabricator');
    const dist = stockists.filter(s => s.category === 'Distributor');
    _slData = { global: glb, china: chn, trading, dist, fab };

    txt('mc-sl-mills',    glb.length + chn.length);
    txt('mc-sl-trading',  trading.length);
    txt('mc-sl-dist',     dist.length);
    txt('mc-sl-fab',      fab.length);
    txt('mc-sl-trading-vol', fmtN(trading.reduce((s,t)=>s+ +t.annual_volume_mt,0)) + ' MT');
    txt('mc-sl-dist-vol',    fmtN(dist.reduce((s,r)=>s+ +r.annual_volume_mt,0)) + ' MT');
    txt('mc-sl-fab-vol',     fmtN(fab.reduce((s,r)=>s+ +r.annual_volume_mt,0)) + ' MT');

    htm('slMillBody',    renderSupplierCards([...glb.map(m=>({...m,_type:'global'})), ...chn.map(m=>({...m,_type:'china'}))]));
    htm('slTradingBody', renderSupplierCards(trading.map(t=>({...t,_type:'trading'}))));
    htm('slDistBody',    renderSupplierCards(dist.map(r=>({...r,_type:'distributor'}))));
    htm('slFabBody',     renderSupplierCards(fab.map(r=>({...r,_type:'fabricator'}))));
  } catch(e) {
    console.error('PX error:', e);
    htm('slMillBody', renderError(e, 'Supplier List'));
  }
}

function renderSupplierCards(items) {
  if (!items.length) return '<div class="empty" style="padding:40px;text-align:center;"><div class="eicon">🏭</div><div class="etitle">No data yet</div><div class="edesc">Click "+ Add Supplier" to get started.</div></div>';

  return items.map(function(s, i) {
    var type     = s._type;
    var isChina  = type === 'china';
    var isMill   = type === 'global' || isChina;
    var isTrade  = type === 'trading';

    // Name line
    var name     = isMill  ? (s.brand || s.mill_name)
                 : (s.company_name || s.brand || '—');
    var subname  = isMill  ? s.mill_name  : (isTrade ? s.brand : '');
    var location = isMill  ? (isChina ? s.city_province : s.country)
                 : (s.location || '—');
    var typeBadge = type === 'global'      ? '<span style="background:#E8F5E9;color:#1E8449;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">🌐 Global</span>'
                  : type === 'china'       ? '<span style="background:#FFF8E1;color:#B7770D;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">🇨🇳 China</span>'
                  : type === 'trading'     ? '<span style="background:#E3F0FF;color:#1A5AA0;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">🚢 Trading</span>'
                  : type === 'distributor' ? '<span style="background:#F3E8FF;color:#7B3FA0;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">🏪 Distributor</span>'
                  : '<span style="background:#FFE8E8;color:#A03F3F;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">🔧 Fabricator</span>';

    var apiPill  = s.api_status ? '<span class="' + (s.api_status==='API-P'?'apip':'apiu') + '">' + s.api_status + '</span>' : '';
    var volStr   = (s.annual_volume_mt > 0) ? fmtN(s.annual_volume_mt) + ' MT' : '';
    var sizeStr  = s.size_range || '';
    var notes    = isTrade ? (s.notes||s.remarks||'') : (s.notes || s.remarks || '');
    var contact  = s.contact_name
                   ? '<div style="margin-top:8px;"><div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">👤 Contact</div>'
                     + '<div style="display:flex;justify-content:space-between;align-items:center;">'
                     + '<span style="font-weight:600;font-size:12px;">' + s.contact_name + '</span>'
                     + (s.contact_phone ? '<span style="font-family:monospace;font-size:11px;">📞 ' + s.contact_phone + '</span>' : '')
                     + '</div></div>'
                   : '';

    var dataId   = 'data-id="' + s.id + '" data-type="' + type + '"';

    return '<div class="crm-card" style="border-left:3px solid ' + (isChina ? 'var(--accent)' : isTrade ? 'var(--primary)' : 'var(--teal)') + ';">'
      + '<div class="crm-top">'
      + '<div class="crm-no" style="background:var(--teal);">' + (i+1) + '</div>'
      + '<div class="crm-name">' + name + '</div>'
      + typeBadge
      + '</div>'
      + '<div class="crm-body">'
      + (subname   ? '<div class="crm-row"><span class="crm-lbl">Mill</span><span class="crm-val">' + subname + '</span></div>' : '')
      + (location  ? '<div class="crm-row"><span class="crm-lbl">Location</span><span class="crm-val" style="color:var(--text-muted);">' + location + '</span></div>' : '')
      + (volStr    ? '<div class="crm-row"><span class="crm-lbl">Volume</span><span class="crm-val">' + volStr + (sizeStr ? ' · ' + sizeStr : '') + '</span></div>' : '')
      + (isTrade && s.market_share_pct > 0 ? '<div class="crm-row"><span class="crm-lbl">Market Share</span><span class="crm-val" style="color:var(--primary);font-weight:700;">' + (+s.market_share_pct*100).toFixed(1) + '%</span></div>' : '')
      + (apiPill   ? '<div class="crm-row"><span class="crm-lbl">API</span><span class="crm-val">' + apiPill + '</span></div>' : '')
      + contact
      + (notes     ? '<div style="margin-top:8px;font-size:11px;color:var(--text-secondary);">' + notes + '</div>' : '')
      + '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:6px;justify-content:flex-end;">'
      + '<button class="btn btn-ghost btn-sm" ' + dataId + ' onclick="openEditSupplier(this.dataset.type, +this.dataset.id)">✏️ Edit</button>'
      + '<button class="btn btn-ghost btn-sm" ' + dataId + ' onclick="deleteSupplier(this.dataset.type, +this.dataset.id)" style="color:var(--danger);">🗑 Delete</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

function showSlTab(tab) {
  currentSlTab = tab;
  ['mill','trading','dist','fab'].forEach(function(t) {
    var btn  = $('sl-tab-' + t);
    var pane = $('sl-pane-' + t);
    if (btn)  btn.classList.toggle('sl-tab-active', t === tab);
    if (pane) pane.style.display = t === tab ? '' : 'none';
  });
}

function openAddSupplier(type) {
  $('supplierForm').reset();
  var t = type || currentSlTab || 'global';
  $('sl_id').value   = '';
  $('sl_type').value = t;
  if ($('sl_type_select')) { $('sl_type_select').value = t; $('sl_type_select').disabled = false; }
  showSupplierFields(t);
  txt('supplierModalTitle', 'Add Supplier');
  $('supplierModal').classList.add('open');
}

function openEditSupplier(type, id) {
  id = +id;
  var src = type === 'global' ? _slData.global : type === 'china' ? _slData.china
          : type === 'trading' ? _slData.trading : type === 'distributor' ? _slData.dist : _slData.fab;
  var r = src.find(function(x){ return +x.id === id; });
  if (!r) { showToast('Data not found — please refresh', 'error'); return; }

  $('sl_id').value   = r.id;
  $('sl_type').value = type;
  if ($('sl_type_select')) { $('sl_type_select').value = type; $('sl_type_select').disabled = true; }
  showSupplierFields(type);

  if (type === 'global' || type === 'china') {
    if ($('sl_brand'))          $('sl_brand').value          = r.brand || '';
    if ($('sl_mill_name'))      $('sl_mill_name').value      = r.mill_name || '';
    if ($('sl_country'))        $('sl_country').value        = r.country || '';
    if ($('sl_city_province'))  $('sl_city_province').value  = r.city_province || '';
    if ($('sl_contact_name'))   $('sl_contact_name').value   = r.contact_name || '';
    if ($('sl_contact_phone'))  $('sl_contact_phone').value  = r.contact_phone || '';
    if ($('sl_website'))        $('sl_website').value        = r.website || '';
    if ($('sl_notes'))          $('sl_notes').value          = r.notes || '';
  } else if (type === 'trading') {
    if ($('sl_company_name'))   $('sl_company_name').value   = r.company_name || '';
    if ($('sl_brand_t'))        $('sl_brand_t').value        = r.brand || '';
    if ($('sl_location_t'))     $('sl_location_t').value     = r.location || '';
    if ($('sl_volume'))         $('sl_volume').value         = r.annual_volume_mt || 0;
    if ($('sl_market_share'))   $('sl_market_share').value   = +(r.market_share_pct||0)*100;
    if ($('sl_color'))          $('sl_color').value          = r.color_hex || '#0B3D6B';
    if ($('sl_contact_name_t')) $('sl_contact_name_t').value = r.contact_name || '';
    if ($('sl_contact_phone_t'))$('sl_contact_phone_t').value= r.contact_phone || '';
    if ($('sl_notes_t'))        $('sl_notes_t').value        = r.notes || '';
  } else {
    if ($('sl_company_s'))      $('sl_company_s').value      = r.company_name || '';
    if ($('sl_location'))       $('sl_location').value       = r.location || '';
    if ($('sl_volume_s'))       $('sl_volume_s').value       = r.annual_volume_mt || 0;
    if ($('sl_size_range'))     $('sl_size_range').value     = r.size_range || '';
    if ($('sl_remarks'))        $('sl_remarks').value        = r.remarks || '';
    if ($('sl_api_status'))     $('sl_api_status').value     = r.api_status || '';
    if ($('sl_contact_name_s')) $('sl_contact_name_s').value = r.contact_name || '';
    if ($('sl_contact_phone_s'))$('sl_contact_phone_s').value= r.contact_phone || '';
    if ($('sl_website_s'))      $('sl_website_s').value      = r.website || '';
    if ($('sl_category'))       $('sl_category').value       = r.category || 'Distributor';
  }
  txt('supplierModalTitle', 'Edit Supplier');
  $('supplierModal').classList.add('open');
}

function closeSupplierModal() {
  if ($('sl_type_select')) $('sl_type_select').disabled = false;
  $('supplierModal').classList.remove('open');
}

function showSupplierFields(type) {
  ['sl-fields-mill','sl-fields-trading','sl-fields-stockist'].forEach(function(id){
    var el = $(id); if (el) el.style.display = 'none';
  });
  var show = type === 'global' || type === 'china' ? 'sl-fields-mill'
           : type === 'trading' ? 'sl-fields-trading' : 'sl-fields-stockist';
  var el = $(show); if (el) el.style.display = '';
  if ($('sl_category')) {
    $('sl_category').value = type === 'distributor' ? 'Distributor' : type === 'fabricator' ? 'Fabricator' : 'OEM';
  }
}

async function saveSupplier() {
  var id     = $('sl_id').value;
  var type   = $('sl_type').value;
  var method = id ? 'PUT' : 'POST';
  var body   = {}, url = '';

  if (type === 'global' || type === 'china') {
    body = {
      brand:         $('sl_brand')         ? $('sl_brand').value         : '',
      mill_name:     $('sl_mill_name')     ? $('sl_mill_name').value     : '',
      country:       $('sl_country')       ? $('sl_country').value       : '',
      city_province: $('sl_city_province') ? $('sl_city_province').value : '',
      contact_name:  $('sl_contact_name')  ? $('sl_contact_name').value  : '',
      contact_phone: $('sl_contact_phone') ? $('sl_contact_phone').value : '',
      website:       $('sl_website')       ? $('sl_website').value       : '',
      notes:         $('sl_notes')         ? $('sl_notes').value         : '',
    };
    if (!body.brand || !body.mill_name) { showToast('Brand dan Mill Name wajib diisi', 'error'); return; }
    url = id ? 'api/market/manufacturers/' + type + '/' + id : 'api/market/manufacturers/' + type;
  } else if (type === 'trading') {
    body = {
      company_name:     $('sl_company_name')   ? $('sl_company_name').value   : '',
      brand:            $('sl_brand_t')         ? $('sl_brand_t').value        : '',
      location:         $('sl_location_t')      ? $('sl_location_t').value     : '',
      annual_volume_mt: parseFloat($('sl_volume') ? $('sl_volume').value : 0) || 0,
      market_share_pct: parseFloat($('sl_market_share') ? $('sl_market_share').value : 0)/100 || 0,
      color_hex:        $('sl_color')           ? $('sl_color').value          : '#0B3D6B',
      contact_name:     $('sl_contact_name_t')  ? $('sl_contact_name_t').value : '',
      contact_phone:    $('sl_contact_phone_t') ? $('sl_contact_phone_t').value: '',
      notes:            $('sl_notes_t')          ? $('sl_notes_t').value        : '',
    };
    if (!body.company_name) { showToast('Company Name wajib diisi', 'error'); return; }
    url = id ? 'api/market/trading/' + id : 'api/market/trading';
  } else {
    body = {
      category:         $('sl_category')       ? $('sl_category').value       : 'Distributor',
      company_name:     $('sl_company_s')       ? $('sl_company_s').value      : '',
      location:         $('sl_location')        ? $('sl_location').value       : '',
      annual_volume_mt: parseFloat($('sl_volume_s') ? $('sl_volume_s').value : 0) || 0,
      size_range:       $('sl_size_range')      ? $('sl_size_range').value     : '',
      remarks:          $('sl_remarks')         ? $('sl_remarks').value        : '',
      api_status:       $('sl_api_status')      ? ($('sl_api_status').value || null) : null,
      contact_name:     $('sl_contact_name_s')  ? $('sl_contact_name_s').value : '',
      contact_phone:    $('sl_contact_phone_s') ? $('sl_contact_phone_s').value: '',
      website:          $('sl_website_s')       ? $('sl_website_s').value      : '',
    };
    if (!body.company_name) { showToast('Company Name wajib diisi', 'error'); return; }
    url = id ? 'api/market/stockists/' + id : 'api/market/stockists';
  }

  try {
    var res = await authFetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Save failed: ' + res.status);
    closeSupplierModal();
    await loadPX();
    showToast(id ? 'Supplier updated' : 'Supplier added');
  } catch(e) { showToast(e.message, 'error'); }
}

async function deleteSupplier(type, id) {
  if (!confirm('Hapus supplier ini?')) return;
  var url = type === 'global'  ? 'api/market/manufacturers/global/' + id
          : type === 'china'   ? 'api/market/manufacturers/china/'  + id
          : type === 'trading' ? 'api/market/trading/'              + id
          : 'api/market/stockists/' + id;
  try {
    var res = await authFetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    await loadPX();
    showToast('Supplier deleted');
  } catch(e) { showToast(e.message, 'error'); }
}


// ═══════════════════════════════════════════════════════════════
// P4 — ADD / EDIT INQUIRY
// ═══════════════════════════════════════════════════════════════

let _contactRowCount = 0;

function openAddInquiry() {
  $('inquiryForm').reset();
  $('iq_id').value = '';
  txt('inquiryModalTitle', 'Add New Inquiry');
  _contactRowCount = 0;
  htm('contactRows', '');
  addContactRow(); // start with 1 blank contact row
  $('inquiryModal').classList.add('open');
}

function openEditInquiry(id) {
  const run = function(accounts) {
    const a = accounts.find(function(x) { return x.id === id; });
    if (!a) { showToast('Account not found', 'error'); return; }
    $('iq_id').value         = a.id;
    $('iq_company').value    = a.company   || '';
    $('iq_owner').value      = a.owner     || 'Jordan';
    $('iq_status').value     = a.status    || 'On-going 1 Inquiry';
    $('iq_idea').value       = a.idea      || '';
    $('iq_subsector').value  = a.subsector || (a.sub_sectors && a.sub_sectors.length ? a.sub_sectors[0].sector_name : '');
    $('iq_synthesis').value  = a.synthesis || '';
    $('iq_nextstep').value   = a.nextstep  || (a.next_steps && a.next_steps.length ? a.next_steps[0].step_text : '');
    _contactRowCount = 0;
    htm('contactRows', '');
    const contacts = a.contacts || [];
    if (contacts.length) { contacts.forEach(function(c) { addContactRow(c); }); }
    else { addContactRow(); }
    txt('inquiryModalTitle', 'Edit Inquiry');
    $('inquiryModal').classList.add('open');
  };
  if (_crmCache.length) { run(_crmCache); }
  else { api('api/crm/accounts').then(function(a){ _crmCache=a; run(a); }).catch(function(e){ showToast('Load failed: '+e.message,'error'); }); }
}

function closeInquiryModal() { $('inquiryModal').classList.remove('open'); }

function addContactRow(prefill) {
  _contactRowCount++;
  const idx  = _contactRowCount;
  const rowId = 'contact-row-' + idx;
  const div = document.createElement('div');
  div.id = rowId;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:10px;background:var(--surface2);border-radius:8px;';
  div.innerHTML =
    '<div>'
    + '<label style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px;">Name</label>'
    + '<input type="text" class="form-input" id="c_name_' + idx + '" placeholder="Contact name" value="' + ((prefill && prefill.name) ? prefill.name : '') + '">'
    + '</div>'
    + '<div>'
    + '<label style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px;">Role / Title</label>'
    + '<input type="text" class="form-input" id="c_role_' + idx + '" placeholder="e.g. SCM Manager" value="' + ((prefill && prefill.role) ? prefill.role : '') + '">'
    + '</div>'
    + '<div>'
    + '<label style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px;">Phone / Email</label>'
    + '<input type="text" class="form-input" id="c_phone_' + idx + '" placeholder="0812-xxxx or email@..." value="' + ((prefill && (prefill.phone || prefill.email)) ? (prefill.phone || prefill.email) : '') + '">'
    + '</div>'
    + '<button type="button" onclick="removeContactRow(' + idx + ')" style="background:none;border:1px solid var(--border);border-radius:6px;width:32px;height:32px;cursor:pointer;color:var(--danger);font-size:14px;display:flex;align-items:center;justify-content:center;" title="Remove contact">✕</button>';
  $('contactRows').appendChild(div);
}

function removeContactRow(idx) {
  const row = $('contact-row-' + idx);
  if (row) row.remove();
}

function collectContacts() {
  const contacts = [];
  // Find all contact rows
  const rows = $('contactRows').querySelectorAll('[id^="contact-row-"]');
  rows.forEach(function(row) {
    const idx   = row.id.replace('contact-row-','');
    const name  = ($('c_name_'  + idx) || {}).value || '';
    const role  = ($('c_role_'  + idx) || {}).value || '';
    const phone = ($('c_phone_' + idx) || {}).value || '';
    // Detect if phone field is email
    const isEmail = phone.includes('@');
    if (name || phone) {
      contacts.push({
        name:  name  || null,
        role:  role  || null,
        phone: isEmail ? null : (phone || null),
        email: isEmail ? phone : null,
      });
    }
  });
  return contacts;
}

async function saveInquiry() {
  const id = $('iq_id').value;
  const body = {
    company:   $('iq_company').value.trim(),
    owner:     $('iq_owner').value,
    status:    $('iq_status').value,
    idea:      $('iq_idea').value.trim()      || null,
    subsector: $('iq_subsector').value.trim() || null,
    synthesis: $('iq_synthesis').value.trim() || null,
    nextstep:  $('iq_nextstep').value.trim()  || null,
    contacts:  collectContacts(),
  };

  if (!body.company) { showToast('Company name is required', 'error'); return; }

  const saveBtn = $('inquirySaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const url    = id ? 'api/crm/accounts/' + id : 'api/crm/accounts';
    const method = id ? 'PUT' : 'POST';
    const res    = await authFetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed: ' + res.status);
    }
    closeInquiryModal();
    await loadP4();
    showToast(id ? 'Inquiry updated' : 'New inquiry added — ' + body.company);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Inquiry';
  }
}

async function deleteInquiry(id, company) {
  if (!confirm('Delete inquiry for ' + company + '? This cannot be undone.')) return;
  try {
    const res = await authFetch('api/crm/accounts/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed: ' + res.status);
    await loadP4();
    showToast('Inquiry deleted — ' + company);
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  // Set date
  const now = new Date();
  txt('headerDate', '📅 ' + now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target === el) el.classList.remove('open');
    });
  });

  // DB status banner — only alert for seed tables, not user-input tables
  authFetch('api/db-status')
    .then(function (r) { return r.json(); })
    .then(function (status) {
      if (!status.seeded) {
        // Find which SEED tables are empty (not user tables like sales_activities/mro_models)
        const userTables = status.user_tables || ['sales_activities','mro_models'];
        const empty = Object.entries(status.tables)
          .filter(function (e) { return e[1] === 0 && !userTables.includes(e[0]); })
          .map(function (e) { return e[0]; });
        if (!empty.length) return; // only user tables empty — that's fine
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#C8392B;color:white;padding:10px 20px;font-size:12px;font-family:monospace;z-index:9999;display:flex;align-items:center;justify-content:space-between;';
        const info = document.createElement('span');
        info.innerHTML = '⚠️ <b>DB not fully seeded.</b> Empty tables: ' + empty.join(', ') + ' — Run: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:3px;">node db/migrate.js &amp;&amp; node db/seed.js</code>';
        const btn  = document.createElement('button');
        btn.textContent = 'Dismiss';
        btn.style.cssText = 'background:none;border:1px solid rgba(255,255,255,0.5);color:white;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;margin-left:16px;';
        btn.onclick = function () { banner.remove(); };
        banner.appendChild(info);
        banner.appendChild(btn);
        document.body.appendChild(banner);
      }
    })
    .catch(function () {});

  // Isi dropdown sales person dari nama-nama yang sudah ada di data pipeline/activities
  loadSalesPersons();

  // Load first page
  loadP1();
});

// ═══════════════════════════════════════════════════════════════
// (User management modal dihapus — role admin/user/observer disederhanakan.
// Akses modul sekarang seluruhnya dikelola SalesConnect lewat lib/access.php;
// siapa pun yang bisa membuka modul ini punya CRUD penuh. Lihat
// crmproject/index.php dan lib/tool_guard.php.)
// ═══════════════════════════════════════════════════════════════
// SALES PERSON DROPDOWNS — diisi dari sales_owner/sales_person yang sudah ada
// ═══════════════════════════════════════════════════════════════
var _salesPersons = [];

// Isi satu <select>. placeholderText != null → tambahkan opsi kosong di atas.
// Nilai terpilih sebelumnya dipertahankan bila masih ada di daftar.
function _fillPersonSelect(id, persons, placeholderText) {
  var sel = document.getElementById(id);
  if (!sel) return;
  var prev = sel.value;
  sel.replaceChildren();
  if (placeholderText != null) {
    var ph = document.createElement('option');
    ph.value = ''; ph.textContent = placeholderText;
    sel.appendChild(ph);
  }
  persons.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });
  if (prev && persons.indexOf(prev) >= 0) sel.value = prev;
}

async function loadSalesPersons() {
  try {
    _salesPersons = await api('api/sales-persons');
  } catch (e) {
    _salesPersons = [];
  }
  _fillPersonSelect('ownerFilter',     _salesPersons, 'All Persons');
  _fillPersonSelect('actPersonFilter', _salesPersons, 'All Persons');
  _fillPersonSelect('pf_sales_owner',  _salesPersons, 'Select…');
  _fillPersonSelect('af_person',       _salesPersons, 'Select…');
  _fillPersonSelect('acOwner',         _salesPersons, null);
  _fillPersonSelect('iq_owner',        _salesPersons, null);
}