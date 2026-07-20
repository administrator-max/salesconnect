// ==========================================
// 2. FILTER SYSTEM
// ==========================================
const fpState = {};
const _fltFpMap = {exec:'fp-exec', ana:'fp-ana', cns:'fp-cns', cndetail:'fp-cndetail'};
const _moNames = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function initFp(fpId) {
  if (!fpState[fpId]) fpState[fpId] = {mode:'all', preset:'all', from:'', to:''};
  const panel = document.getElementById(fpId);
  if (!panel) return;
  
  panel.querySelectorAll('[data-fp="preset"] .fp-b').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-fp="preset"] .fp-b').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      fpState[fpId].mode = 'preset';
      fpState[fpId].preset = btn.dataset.v;
      fpState[fpId].from = ''; fpState[fpId].to = '';
      panel.querySelector('.fp-from').value = '';
      panel.querySelector('.fp-to').value = '';
      fireFpChange(fpId);
    });
  });
}

function applyFpRange(fpId) {
  const panel = document.getElementById(fpId);
  const from = panel.querySelector('.fp-from').value;
  const to = panel.querySelector('.fp-to').value;
  if (!from && !to) return;
  
  fpState[fpId].mode = 'range';
  fpState[fpId].from = from;
  fpState[fpId].to = to;
  panel.querySelectorAll('[data-fp="preset"] .fp-b').forEach(b => b.classList.remove('act'));
  fireFpChange(fpId);
}

function fireFpChange(fpId) {
  if (fpId === 'fp-exec') rExec();
  else if (fpId === 'fp-ana') rAnalytics();
  else if (fpId === 'fp-cns') rConsSummary();
  else if (fpId === 'fp-cndetail') rConsignee();
}

function getFp(fpId) {
  const st = fpState[fpId] || {mode:'all', preset:'all', from:'', to:''};
  return function(d) {
    const ref = d.eta || d.etd || d.start_delivery || '';
    if (st.mode === 'range') {
      if (st.from && ref < st.from) return false;
      if (st.to && ref > st.to) return false;
      return true;
    }
    const p = st.preset;
    if (p === 'all') return true;
    if (p.match(/^\d{4}-\d{2}$/)) return ref.substring(0, 7) === p;
    if (p === 'q4-2025') return ref >= '2025-10-01' && ref <= '2025-12-31';
    if (p === 'q1-2026') return ref >= '2026-01-01' && ref <= '2026-03-31';
    if (p === 'ytd-2026') return ref >= '2026-01-01' && ref <= T;
    if (p.match(/^\d{4}$/)) return d.year === +p;
    return true;
  };
}

function getFilteredFp(fpId) {
  const fn = getFp(fpId);
  return it ? it.filter(fn) : [];
}

function toggleFlt(key) {
  const dd = document.getElementById('flt-'+key+'-dd');
  const btn = document.getElementById('flt-'+key+'-btn');
  const isOpen = dd.classList.contains('open');
  
  document.querySelectorAll('.flt-dd.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.flt-btn.open').forEach(b => b.classList.remove('open'));
  
  if (!isOpen) { 
    dd.classList.add('open'); 
    btn.classList.add('open'); 
  }
}

document.addEventListener('click', e => {
  if (!e.target.closest('.flt-wrap')) {
    document.querySelectorAll('.flt-dd.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.flt-btn.open').forEach(b => b.classList.remove('open'));
  }
});

function _setFltLabel(key, label) {
  const el = document.getElementById('flt-'+key+'-label');
  if (el) el.textContent = label;
  const btn = document.getElementById('flt-'+key+'-btn');
  if (btn) {
    if (label === 'All Time') btn.classList.remove('active-filter');
    else btn.classList.add('active-filter');
  }
}

function _closeFlt(key) {
  const dd = document.getElementById('flt-'+key+'-dd');
  const btn = document.getElementById('flt-'+key+'-btn');
  if (dd) dd.classList.remove('open');
  if (btn) btn.classList.remove('open');
}

function _applyYearMonth(key, yr, mo) {
  const fpId = _fltFpMap[key];
  if (!fpState[fpId]) fpState[fpId] = {mode:'all', preset:'all', from:'', to:''};
  
  let preset, label;
  if (yr === 'all') { preset = 'all'; label = 'All Time'; }
  else if (mo === 'all') { preset = yr; label = yr; }
  else { preset = `${yr}-${mo}`; label = `${_moNames[+mo]} ${yr}`; }
  
  fpState[fpId].mode = 'preset';
  fpState[fpId].preset = preset;
  fpState[fpId].from = ''; 
  fpState[fpId].to = '';
  
  const fi = document.getElementById('flt-'+key+'-from');
  const ti = document.getElementById('flt-'+key+'-to');
  if (fi) fi.value = ''; 
  if (ti) ti.value = '';
  
  _setFltLabel(key, label);
  _closeFlt(key);
  fireFpChange(fpId);
}

Object.keys(_fltFpMap).forEach(key => {
  const yearsEl = document.getElementById('flt-'+key+'-years');
  const monthsEl = document.getElementById('flt-'+key+'-months');
  if (!yearsEl) return;
  let selYr = 'all', selMo = 'all';

  yearsEl.querySelectorAll('.flt-yr').forEach(btn => {
    btn.addEventListener('click', () => {
      yearsEl.querySelectorAll('.flt-yr').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      selYr = btn.dataset.yr;
      
      if (selYr === 'all') {
        monthsEl.style.display = 'none';
        selMo = 'all';
        _applyYearMonth(key, selYr, selMo);
      } else {
        monthsEl.style.display = 'flex';
        selMo = 'all';
        monthsEl.querySelectorAll('.flt-mo').forEach(b => b.classList.remove('act'));
        monthsEl.querySelector('[data-mo="all"]').classList.add('act');
        _applyYearMonth(key, selYr, 'all');
      }
    });
  });

  if (monthsEl) {
    monthsEl.querySelectorAll('.flt-mo').forEach(btn => {
      btn.addEventListener('click', () => {
        monthsEl.querySelectorAll('.flt-mo').forEach(b => b.classList.remove('act'));
        btn.classList.add('act');
        selMo = btn.dataset.mo;
        _applyYearMonth(key, selYr, selMo);
      });
    });
  }
});

function applyFltRange(fpId, key) {
  const fi = document.getElementById('flt-'+key+'-from');
  const ti = document.getElementById('flt-'+key+'-to');
  if (!fi || !ti || !fi.value || !ti.value) { 
    tst('Pilih tanggal From dan To terlebih dahulu', 'er'); 
    return; 
  }
  
  if (!fpState[fpId]) fpState[fpId] = {mode:'all', preset:'all', from:'', to:''};
  fpState[fpId].mode = 'range';
  fpState[fpId].from = fi.value;
  fpState[fpId].to = ti.value;
  
  const presetsEl = document.getElementById('flt-'+key+'-presets');
  if (presetsEl) presetsEl.querySelectorAll('.flt-p').forEach(b => b.classList.remove('act'));
  
  _setFltLabel(key, `${fi.value} &rarr; ${ti.value}`);
  _closeFlt(key);
  fireFpChange(fpId);
}