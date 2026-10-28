/* Riwayat Input SalesPulse (28-Okt-2026).
   Satu tombol "🕘 Riwayat Input": ketik nama project / nomor PS (mis. "arsen 66")
   → langsung terlihat (1) PS itu SUDAH ADA atau BELUM di SalesPulse, dan
   (2) riwayat siapa menginput apa & kapan. Berdiri sendiri (gaya inline),
   dipakai di halaman Dashboard dan Executive Summary. Server: salespulse_activity.php. */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tgl = s => {
    const d = new Date(s);
    if (!s || isNaN(d)) return esc(s || '—');
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const tglSaja = s => {
    const d = new Date(s);
    return (!s || isNaN(d)) ? esc(s || '—') : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  function modal() {
    let m = document.getElementById('spRiwayat');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'spRiwayat';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.55);font-family:inherit';
    m.innerHTML = `
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(94vw,820px);max-height:88vh;background:#fff;color:#0f172a;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div><div style="font-size:16px;font-weight:800">🕘 Riwayat Input</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">Cek apakah PS sudah pernah diinput, dan siapa yang menginput apa.</div></div>
          <button id="spRwTutup" style="border:none;background:#f1f5f9;border-radius:8px;width:32px;height:32px;font-size:15px;cursor:pointer">✕</button>
        </div>
        <div style="padding:12px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc">
          <input id="spRwCari" placeholder="Ketik nama project atau nomor PS, mis.: arsen 66" autocomplete="off"
            style="width:100%;box-sizing:border-box;font-size:15px;padding:10px 12px;border:2px solid #c7d2fe;border-radius:10px;outline:none">
        </div>
        <div id="spRwIsi" style="overflow-y:auto;flex:1;padding:14px 20px 18px;font-size:13px"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
    m.querySelector('#spRwTutup').onclick = () => { m.style.display = 'none'; };
    let t;
    m.querySelector('#spRwCari').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => muat(e.target.value), 350); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') m.style.display = 'none'; });
    return m;
  }

  let urutan = 0;
  async function muat(q) {
    const isi = document.getElementById('spRwIsi');
    const no = ++urutan;
    isi.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b">Mencari…</div>';
    let j;
    try {
      const r = await fetch('api/activity?q=' + encodeURIComponent(q || '') + '&limit=150', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json();
    } catch (e) {
      if (no === urutan) isi.innerHTML = '<div style="padding:24px;text-align:center;color:#b91c1c">Gagal memuat. Coba lagi.</div>';
      return;
    }
    if (no !== urutan) return;
    const log = Array.isArray(j.log) ? j.log : [], ps = Array.isArray(j.ps) ? j.ps : [];
    let h = '';

    if (q && q.trim()) {
      if (ps.length) {
        h += `<div style="padding:10px 14px;border-radius:10px;background:#dcfce7;border:1px solid #86efac;color:#166534;font-weight:800;margin-bottom:10px">
                ✅ Ditemukan ${ps.length} PS yang mengandung "${esc(q)}"
                <div style="font-weight:500;font-size:12px;margin-top:2px">Pastikan nama project, bulan delivery &amp; customer-nya sama — "Arsen 66A" bukan "Arsen 66".</div></div>`;
        h += ps.map(p => `
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px">
            <div style="font-weight:800">${esc(p.project || '(tanpa nama project)')}</div>
            <div style="color:#475569;margin-top:2px">${esc(p.ps_number)} · ${esc(p.pt)}${p.customer ? ' → ' + esc(p.customer) : ''}</div>
            <div style="color:#64748b;font-size:12px;margin-top:2px">PO ${tglSaja(p.po_date)} · Margin ${esc(p.margin)} · diinput ${tgl(p.created_at)}</div>
          </div>`).join('');
      } else {
        h += `<div style="padding:12px 14px;border-radius:10px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;font-weight:800;margin-bottom:10px">
                ❌ BELUM ADA di SalesPulse — tidak ada PS yang cocok dengan "${esc(q)}"</div>
              <div style="color:#64748b;font-size:12px;margin-bottom:12px">Periksa ejaan, atau input PS-nya lewat menu Data → Import Project Sheet.</div>`;
      }
    }

    h += `<div style="font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#64748b;margin:14px 0 6px">
            ${q && q.trim() ? 'Riwayat terkait' : 'Riwayat input terbaru'}</div>`;
    h += log.length ? log.map(e => {
      const warna = /hapus/i.test(e.aksi) ? '#b91c1c' : /update/i.test(e.aksi) ? '#b45309' : '#166534';
      return `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <div style="min-width:118px;color:#64748b;font-size:12px">${tgl(e.at)}</div>
        <div style="flex:1">
          <div><strong>${esc(e.nama || e.email || '—')}</strong> · <span style="color:${warna};font-weight:700">${esc(e.aksi)}</span></div>
          ${e.project || e.ps_number ? `<div style="margin-top:1px">${esc(e.project)}${e.ps_number ? ' <span style="color:#64748b">(' + esc(e.ps_number) + ')</span>' : ''}</div>` : ''}
          ${e.pt || e.keterangan ? `<div style="color:#64748b;font-size:12px">${esc([e.pt, e.keterangan].filter(Boolean).join(' · '))}</div>` : ''}
        </div></div>`;
    }).join('') : `<div style="color:#64748b;padding:8px 0">Belum ada catatan${q && q.trim() ? ' untuk pencarian ini' : ''}. Riwayat mulai tercatat sejak 28 Okt 2026.</div>`;
    isi.innerHTML = h;
  }

  window.openRiwayatInput = function (q) {
    const m = modal();
    m.style.display = 'block';
    const inp = m.querySelector('#spRwCari');
    inp.value = q || '';
    setTimeout(() => inp.focus(), 50);
    muat(inp.value);
  };
})();
