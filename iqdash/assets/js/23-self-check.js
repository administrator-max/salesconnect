/* ═══════════════════════════════════════════════════════════════════════════
   PEMERIKSA MANDIRI — dashboard memeriksa dirinya sendiri, tiap kali data
   berubah.

   KENAPA ADA
   Dilaporkan pemilik data 10-Sep-2026: "jangan sampai setiap input selalu ada
   case, perbaiki." Keluhannya tepat, dan pola kejadiannya jelas kalau
   ditelusuri ke belakang — hampir semua perbaikan beberapa minggu terakhir
   punya bentuk yang sama:

       tim menginput sesuatu berbentuk baru
         -> satu permukaan tidak ikut menanganinya
           -> TIM yang menemukannya, berhari-hari kemudian
             -> lapor -> diperbaiki satu per satu

   Contohnya berderet: kuota baru tanpa baris stats (SNSD), company bersection
   PENDING yang tidak masuk kolam Waiting, gelombang kedatangan ganda yang
   menggandakan baris (SGD, AMP), angka pil yang berbeda dari isi tabelnya,
   realisasi yang tidak muncul karena halaman tidak pernah menyegarkan diri.

   Yang salah bukan satu pun dari perbaikan itu. Yang salah adalah SIAPA yang
   menemukan. Dashboard punya semua bahan untuk mengetahui dirinya tidak
   konsisten — kartu bisa dibandingkan dengan tabelnya, pil dengan barisnya,
   daftar company dengan tab-tabnya — tapi tidak pernah diminta melakukannya.

   Berkas ini yang memintanya. Pemeriksaannya adalah invarian yang SUDAH pernah
   rusak di lapangan; masing-masing mewakili satu kejadian nyata. Kalau salah
   satu rusak lagi, yang memberitahu adalah dashboard, saat itu juga — bukan
   tim, seminggu kemudian.

   SIFATNYA
   · Tidak pernah melempar. Kegagalan pemeriksa tidak boleh merusak dashboard.
   · Tidak mengubah apa pun. Hanya membaca dan melaporkan.
   · Diam saat semuanya cocok — lencana kecil abu-abu, tidak menuntut perhatian.
     Menyala oranye hanya bila ada yang tidak cocok.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Setiap pemeriksaan memulangkan '' bila lolos, atau kalimat temuan. */
const _SC_PERIKSA = [

  ['Company ber-kuota muncul di semua tab', () => {
    const semua = [].concat(SPI || [], PENDING || []);
    const berkuota = semua.filter(c => (Number(canonicalObtained(c)) || 0) > 0).map(c => c.code);
    const isi = id => { const e = document.getElementById(id); return e ? e.innerHTML : ''; };
    const label = k => (typeof coLabel === 'function' ? coLabel(k) : k);
    const cek = (id, nama) => {
      const h = isi(id);
      if (!h) return null;                       // tab belum dirender — bukan temuan
      const kurang = berkuota.filter(k => !h.includes("'" + k + "'") && !h.includes('>' + label(k) + '<'));
      return kurang.length ? nama + ': ' + kurang.join(', ') : null;
    };
    return [cek('mainBody', 'All Companies'), cek('avqTableBody', 'Available Quota'),
            cek('spiTerbitBody', 'PERTEK & SPI'), cek('utilBody', 'Utilization')]
           .filter(Boolean).join(' · ');
  }],

  ['Angka pil sama dengan isi tabelnya', () => {
    /* Pil yang menulis angka berbeda dari jumlah baris yang dimunculkannya
       adalah cacat yang paling merusak kepercayaan — dua-duanya di layar yang
       sama, dan pembaca tidak punya cara menebak mana yang benar. Pernah
       terjadi pada "Revision" (pil 4, tabel 1) dan "Re-Apply Eligible"
       (pil 23, tabel 24), karena keduanya ditulis dari sumber yang berbeda
       dari tabelnya. */
    const beda = [];
    [['pillMAll', () => (filteredSPI().length + filteredPending().length)],
     ['pillMSPI', () => filteredSPI().length],
     ['pillMPending', () => filteredPending().length]].forEach(([id, hitung]) => {
      const el = document.getElementById(id);
      if (!el || el.textContent === '—' || el.textContent === '') return;
      const tertulis = Number(el.textContent);
      const benar = hitung();
      if (!isNaN(tertulis) && tertulis !== benar) beda.push(id + ' ' + tertulis + ' vs ' + benar);
    });
    return beda.join(' · ');
  }],

  ['Σ Available di tabel = kartu Available Quota', () => {
    if (typeof availableQuotaRows !== 'function') return '';
    const baris = availableQuotaRows();
    if (!baris.length) return '';
    const tabel = baris.reduce((s, x) => s + (Number(x.avq) || 0), 0);
    const kartu = [].concat(SPI || [], PENDING || [])
      .reduce((s, c) => s + (Number(cumulativeAvailable(c)) || 0), 0);
    return Math.abs(tabel - kartu) > 0.01
      ? 'tabel ' + tabel.toFixed(3) + ' vs kartu ' + kartu.toFixed(3) : '';
  }],

  ['Σ Realized di tabel = kartu Realized', () => {
    const tb = document.getElementById('utilBody');
    if (!tb || !tb.querySelectorAll('tr').length) return '';
    const sel = t => [...t.querySelectorAll('td')].map(td => td.textContent.trim().replace(/\s+/g, ' '));
    const num = s => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;
    const induk = [...tb.querySelectorAll('tr')].filter(t => (sel(t)[0] || '') !== '');
    if (!induk.length) return '';
    const tabel = induk.reduce((s, t) => s + num(sel(t)[5]), 0);
    const kartu = reportRealizedTotal().mt;
    return Math.abs(tabel - kartu) > 0.01
      ? 'tabel ' + tabel.toFixed(3) + ' vs kartu ' + kartu.toFixed(3) : '';
  }],

  ['Obtained per produk = Obtained per company', () => {
    /* Pemeriksaan yang sama dengan __auditObtained(): stats per produk yang
       menyimpang dari siklus. Menemukan SJH (cycles 300 vs stats 390), yang
       ternyata siklus Re-Apply #1-nya belum pernah dicatat. */
    const beda = [];
    [].concat(SPI || [], PENDING || []).forEach(co => {
      const agg = getObtainedByProdAgg(co) || {};
      const sum = Object.values(agg).reduce((s, v) => s + (Number(v) || 0), 0);
      const can = Number(canonicalObtained(co)) || 0;
      if (Math.abs(sum - can) > 0.5) beda.push(co.code + ' ' + Math.round(sum) + ' vs ' + Math.round(can));
    });
    return beda.slice(0, 6).join(' · ');
  }],

  ['Tidak ada company kembar', () => {
    const n = {};
    [].concat(SPI || [], PENDING || []).forEach(c => { n[c.code] = (n[c.code] || 0) + 1; });
    return Object.keys(n).filter(k => n[k] > 1).join(', ');
  }],

  ['Tidak ada nilai kosong yang tercetak', () => {
    /* "null", "undefined", "NaN" yang tembus ke layar. Pernah terjadi pada
       kolom Group untuk tujuh company yang belum dikonfigurasi. */
    const t = document.body.innerText || '';
    const ketemu = [];
    ['null', 'undefined', 'NaN', '[object Object]'].forEach(x => {
      const re = new RegExp('(^|[^A-Za-z])' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z]|$)', 'g');
      const c = (t.match(re) || []).length;
      /* Satu kemunculan "null"/"undefined" di dropdown Input Data adalah teks
         sah milik opsi, bukan kebocoran; ambangnya karena itu bukan nol. */
      if (c > 1) ketemu.push('"' + x + '" ×' + c);
    });
    return ketemu.join(' · ');
  }],
];

let _scTemuan = [];

/** Jalankan semua pemeriksaan. Tidak pernah melempar. */
function iqPeriksaMandiri() {
  const hasil = [];
  _SC_PERIKSA.forEach(([nama, fn]) => {
    let pesan = '';
    try { pesan = fn() || ''; }
    catch (e) { pesan = 'pemeriksaan gagal dijalankan: ' + (e && e.message ? e.message : e); }
    if (pesan) hasil.push({ nama, pesan });
  });
  _scTemuan = hasil;
  _scGambar();
  return hasil;
}

function _scGambar() {
  const el = document.getElementById('scLencana');
  if (!el) return;
  if (!_scTemuan.length) {
    el.textContent = '✓ konsisten';
    el.style.color = 'var(--txt3)';
    el.style.cursor = 'default';
    el.title = 'Seluruh pemeriksaan kecocokan lolos';
    return;
  }
  el.textContent = '⚠ ' + _scTemuan.length + ' tidak cocok';
  el.style.color = '#d97706';
  el.style.cursor = 'pointer';
  el.title = _scTemuan.map(t => t.nama + ' — ' + t.pesan).join('\n');
}

/** Rincian temuan, untuk diklik dari lencananya. */
function iqTampilkanTemuan() {
  if (!_scTemuan.length) { alert('Semua pemeriksaan kecocokan lolos.'); return; }
  alert('Pemeriksaan yang tidak cocok:\n\n'
      + _scTemuan.map((t, i) => (i + 1) + '. ' + t.nama + '\n   ' + t.pesan).join('\n\n')
      + '\n\nAngka di layar mungkin belum bisa dipercaya sepenuhnya. '
      + 'Tunjukkan pesan ini saat melaporkan.');
}

window.iqPeriksaMandiri   = iqPeriksaMandiri;
window.iqTampilkanTemuan  = iqTampilkanTemuan;
