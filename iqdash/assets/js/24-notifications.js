/* ═══════════════════════════════════════════════════════════════════════════
   NOTIFIKASI REQUEST SALES → CORPSEC (diminta tim 21-Sep-2026)

   Setiap permintaan Revision / Re-Apply (dan New Submission) dari Sales tampil
   di sini untuk CorpSec:
     Company | Request Type | Product | MT | Request Date | Requested by | Status

   SENGAJA TIDAK PUNYA PENYIMPANAN SENDIRI. Daftarnya diturunkan setiap kali
   dari data permintaan yang sama dengan yang dibaca panel CorpSec dan siklus
   PERTEK & SPI:
     · Revision      → co.salesRevRequest   (konfirmasi = siklus "Revision Request — X")
     · Re-Apply      → co.reapplyRequests   (konfirmasi = siklus Submit #N baru)
     · New Submission→ co.newSubmission     (konfirmasi = siklus Submit #N)
   Jadi status notifikasi TIDAK MUNGKIN berbeda dari datanya: begitu CorpSec
   mengonfirmasi, statusnya berubah menjadi "Confirmed / In Process" dan
   menyebut siklus yang lahir dari permintaan itu — dari sumber yang sama yang
   menggerakkan Overview dan tabel PERTEK & SPI. Tabel notifikasi terpisah
   hanya akan menjadi sumber angka kedua, kelas bug yang paling sering
   berulang di dashboard ini.

   Yang disimpan per perangkat (localStorage) hanya "sudah dilihat", untuk
   toast permintaan baru. Kalau penyimpanannya tidak tersedia, notifikasi
   tetap tampil lengkap — hanya toast-nya yang diam.
   ═══════════════════════════════════════════════════════════════════════════ */

const NOTIF_SEEN_KEY = 'iq_notif_seen_v1';

function _notifSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_SEEN_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function _notifSaveSeen(set) {
  try { localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify([...set].slice(-500))); } catch (e) { /* abaikan */ }
}

/* Seluruh permintaan, terbaru di atas. */
function notifItems() {
  const out = [];
  const kolam = [...(typeof SPI !== 'undefined' ? SPI : []), ...(typeof PENDING !== 'undefined' ? PENDING : [])];
  const seen  = new Set();
  const ms = v => { const d = (typeof pDate === 'function') ? pDate(String(v || '').trim()) : null; return d ? d.getTime() : 0; };
  const fmtProd = arr => arr.filter(x => x && x.product)
    .map(x => `${prodLabel(x.product)}${x.mt != null ? ' ' + Number(x.mt).toLocaleString(MT_LOCALE) : ''}`).join(' + ');
  const statusDari = (st, link) =>
    st === 'confirmed' ? { key: 'process', text: '✅ Confirmed / In Process' + (link ? ' · ' + link : '') }
    : st === 'rejected' ? { key: 'rejected', text: '✕ Rejected' }
    : { key: 'pending', text: '⏳ Pending — menunggu CorpSec' };

  kolam.forEach(co => {
    if (!co || seen.has(co.code)) return;
    seen.add(co.code);

    /* Re-Apply — model baru, satu permintaan = satu siklus Submit baru. */
    (typeof raRequests === 'function' ? raRequests(co) : []).forEach(r => {
      if (!r) return;
      const info = raStatusInfo(co, r);
      const prods = (r.products || []);
      out.push({
        id: `${co.code}|RA|${r.id}`, code: co.code, type: 'Re-Apply',
        product: prods.map(p => prodLabel(p.product)).join(' + '),
        mt: prods.reduce((a, p) => a + (Number(p.mt) || 0), 0),
        date: r.requestedDate || '', by: r.requestedBy || 'Sales',
        status: { key: info.key === 'terbit' ? 'process' : info.key, text: info.text },
        ts: ms(r.requestedDate),
      });
    });

    /* Revision — berkunci produk asal. Entri Re-Apply lama (sebelum model
       baru) ikut tampil dengan tipe aslinya supaya riwayatnya tidak hilang. */
    Object.entries(co.salesRevRequest || {}).forEach(([prod, v]) => {
      if (!v || typeof v !== 'object' || !(v.requested === true || v.requested === 'true')) return;
      const tipe = /re-?apply/i.test(String(v.revisionType || '')) ? 'Re-Apply' : 'Revision';
      const targets = (Array.isArray(v.targetProducts) && v.targetProducts.length)
        ? v.targetProducts : [{ product: v.newProduct || '', mt: v.requestedMT }];
      const tujuan = fmtProd(targets.map(t => ({ product: t.product || prod, mt: t.mt })));
      const mt = targets.reduce((a, t) => a + (Number(t.mt) || 0), 0) || Number(v.requestedMT) || 0;
      const link = v.status === 'confirmed'
        ? `Revision Request — ${prodLabel(prod)}` : '';
      out.push({
        id: `${co.code}|RV|${canonicalProduct(prod)}`, code: co.code, type: tipe,
        product: tipe === 'Revision' ? `${prodLabel(prod)} → ${tujuan}` : tujuan,
        mt, date: v.requestedDate || v.confirmedDate || '', by: v.requestedBy || 'Sales',
        status: statusDari(String(v.status || '').toLowerCase(), link),
        ts: ms(v.requestedDate || v.confirmedDate),
      });
    });

    /* New Submission. */
    const ns = co.newSubmission;
    if (ns && Array.isArray(ns.products) && ns.products.length) {
      out.push({
        id: `${co.code}|NS`, code: co.code, type: 'New Submission',
        product: ns.products.map(p => prodLabel(p.product)).join(' + '),
        mt: ns.products.reduce((a, p) => a + (Number(p.mt) || 0), 0),
        date: ns.requestedDate || '', by: ns.requestedBy || 'Sales',
        status: statusDari(String(ns.status || '').toLowerCase(), ns.cycleType || ''),
        ts: ms(ns.requestedDate),
      });
    }
  });

  /* Kembar ejaan (GL BORON / GL ALLOY) pada revisi lama: satu permintaan,
     dua kunci. Yang dipertahankan satu per company+tipe+produk. */
  const unik = new Map();
  out.forEach(x => { if (!unik.has(x.id)) unik.set(x.id, x); });
  return [...unik.values()].sort((a, b) =>
    (a.status.key === 'pending') !== (b.status.key === 'pending')
      ? (a.status.key === 'pending' ? -1 : 1)
      : (b.ts - a.ts) || a.code.localeCompare(b.code));
}

let _notifFilter = 'pending';

function renderNotifBadge() {
  const el = document.getElementById('notifBadge');
  if (!el) return;
  const n = notifItems().filter(x => x.status.key === 'pending').length;
  el.textContent = n > 99 ? '99+' : String(n);
  el.style.display = n > 0 ? 'inline-flex' : 'none';
  _notifToastBaru();
}

/* Toast sekali untuk permintaan pending yang belum pernah dilihat perangkat
   ini — hanya untuk CorpSec / Super Admin, yang memang harus bertindak. */
function _notifToastBaru() {
  const bolehKonfirmasi = (typeof currentRole !== 'undefined') && currentRole &&
    (ROLE_PERMISSIONS[currentRole] || []).includes('corpsecRevConfirm');
  if (!bolehKonfirmasi) return;
  const seen = _notifSeen();
  const baru = notifItems().filter(x => x.status.key === 'pending' && !seen.has(x.id));
  if (!baru.length) return;
  baru.forEach(x => seen.add(x.id));
  _notifSaveSeen(seen);
  if (typeof showToast === 'function') {
    showToast(`🔔 ${baru.length} request baru dari Sales: `
      + baru.slice(0, 3).map(x => `${coLabel(x.code)} ${x.type}`).join(', ')
      + (baru.length > 3 ? '…' : ''), 'info');
  }
}

function openNotif() {
  const m = document.getElementById('notifModal');
  if (!m) return;
  renderNotifTable();
  m.style.display = 'block';
  const seen = _notifSeen();
  notifItems().forEach(x => seen.add(x.id));
  _notifSaveSeen(seen);
}
function closeNotif() {
  const m = document.getElementById('notifModal');
  if (m) m.style.display = 'none';
}
function setNotifFilter(f, btn) {
  _notifFilter = f;
  document.querySelectorAll('#notifModal .fpill').forEach(b => b.classList.toggle('on', b === btn));
  renderNotifTable();
}

function renderNotifTable() {
  const body = document.getElementById('notifBody');
  if (!body) return;
  const semua = notifItems();
  const rows  = _notifFilter === 'all' ? semua : semua.filter(x => x.status.key === _notifFilter);
  const sub = document.getElementById('notifSubtitle');
  if (sub) {
    const n = k => semua.filter(x => x.status.key === k).length;
    sub.textContent = `${n('pending')} pending · ${n('process')} confirmed / in process · ${n('rejected')} rejected`;
  }
  const warna = { pending: 'var(--amber)', process: 'var(--green)', rejected: 'var(--red2)' };
  const tipeWarna = { 'Re-Apply': '#7c3aed', 'Revision': 'var(--amber)', 'New Submission': 'var(--blue)' };
  body.innerHTML = rows.length ? rows.map(x => `
    <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="notifOpenCompany('${x.code}')"
        onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <td style="padding:8px 10px;font-weight:700;color:var(--navy);white-space:nowrap">${coLabel(x.code)}</td>
      <td style="padding:8px 10px;font-weight:700;color:${tipeWarna[x.type] || 'var(--txt2)'};white-space:nowrap">${x.type}</td>
      <td style="padding:8px 10px;font-size:11px">${x.product || '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;font-weight:700">${x.mt ? fmtMt(x.mt) : '—'}</td>
      <td style="padding:8px 10px;white-space:nowrap;font-size:11px">${(typeof fmtDateStd === 'function' ? fmtDateStd(x.date) : x.date) || '—'}</td>
      <td style="padding:8px 10px;font-size:11px">${x.by}</td>
      <td style="padding:8px 10px;font-size:11px;font-weight:600;color:${warna[x.status.key] || 'var(--txt2)'}">${x.status.text}</td>
    </tr>`).join('')
    : `<tr><td colspan="7" style="padding:22px;text-align:center;color:var(--txt3)">Tidak ada request${_notifFilter === 'pending' ? ' yang menunggu CorpSec' : ''}.</td></tr>`;
}

/* Klik baris → form Input Data company itu, di panel CorpSec. */
function notifOpenCompany(code) {
  closeNotif();
  if (typeof openImport === 'function') openImport();
  const sel = document.getElementById('editCo');
  if (!currentRole) {
    if (typeof showToast === 'function')
      showToast(`Pilih role (CorpSec) di form Input Data, lalu pilih company ${coLabel(code)}.`, 'info');
    return;
  }
  if (sel) { sel.value = code; sel.dispatchEvent(new Event('change', { bubbles: true })); }
}
