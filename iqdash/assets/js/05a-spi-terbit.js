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

/* ── Penyaring tambahan: Products, Validity Date, rentang SPI Date ─────────
   Diminta tim 31-Agu-2026.

   Bentuknya mengikuti sebaran datanya, bukan seragam asal ada:

     · Products      13 nilai berbeda  -> dropdown, dibangun DARI data
     · Validity Date  2 nilai (31/12/2026 + kosong) -> dropdown; akan tumbuh
                      sendiri begitu kuota 2027 masuk
     · SPI Date      32 nilai tersebar Nov-2025..Agu-2026 -> dropdown tidak
                      terpakai, yang berguna RENTANG dari/sampai

   Tanggal di sumber TIDAK seragam: sebagian "16/07/2026", sebagian "17/07/26"
   (5 baris). Karena itu perbandingan lewat pDate(), bukan pencocokan teks —
   membandingkan string mentah akan membuang baris bertahun dua digit tanpa
   sepatah kata pun. */

let _stFProduk = '';
let _stFValid  = '';
let _stFDari   = '';
let _stFSampai = '';

/* Tanggal apa pun -> angka YYYYMMDD yang bisa dibandingkan. null bila tak
   terbaca; pemanggil memutuskan artinya, supaya "tidak terbaca" tidak diam-diam
   menjadi "1 Januari 1970". */
function _stHari(v) {
  if (typeof pDate !== 'function') return null;
  const d = pDate(String(v || '').trim());
  if (!d || isNaN(d.getTime())) return null;
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function setStFilterProduk(v) { _stFProduk = v || ''; buildSpiTerbitTable(); }
function setStFilterValid(v)  { _stFValid  = v || ''; buildSpiTerbitTable(); }
function setStFilterTgl()     {
  _stFDari   = ((document.getElementById('stFSpiDari')   || {}).value || '');
  _stFSampai = ((document.getElementById('stFSpiSampai') || {}).value || '');
  buildSpiTerbitTable();
}

function resetStFilters() {
  _stFProduk = _stFValid = _stFDari = _stFSampai = '';
  ['stFProduk', 'stFValidity', 'stFSpiDari', 'stFSpiSampai'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const q = document.getElementById('spiTerbitQ'); if (q) q.value = '';
  buildSpiTerbitTable();
}

/* Apakah satu baris lolos ketiga penyaring baru. Dipisah dari buildSpiTerbitTable()
   supaya hitungan pil bisa memakai aturan yang SAMA PERSIS — kalau tidak, angka
   di pil dan isi tabel bisa bercerita berbeda, dan itu kelas bug yang sudah
   berulang di dashboard ini. */
function _stLolosFilter(r) {
  if (_stFProduk && String(r.product) !== _stFProduk) return false;

  if (_stFValid) {
    const v = String(r.validityDate || '');
    if (_stFValid === '__KOSONG__') { if (v) return false; }
    else if (v !== _stFValid) return false;
  }

  if (_stFDari || _stFSampai) {
    const h = _stHari(r.spiDate);
    /* Baris tanpa tanggal SPI yang terbaca TIDAK bisa dinilai masuk rentang.
       Disembunyikan, bukan diam-diam dianggap lolos — dan jumlahnya disebut
       di kaki tabel supaya tidak hilang tanpa jejak. */
    if (h === null) return false;
    if (_stFDari) {
      const d = _stHari(_stFDari);
      if (d !== null && h < d) return false;
    }
    if (_stFSampai) {
      const s = _stHari(_stFSampai);
      if (s !== null && h > s) return false;
    }
  }
  return true;
}

/* Isi kedua dropdown dibangun dari baris yang ADA, bukan daftar tetap.
   Dibangun ulang hanya ketika daftar nilainya berubah — kalau tiap render
   ditulis ulang, pilihan pemakai ikut hilang setiap kali mengetik di kolom
   pencarian. Tanda tangan daftar dipakai sebagai kunci, pola yang sama dengan
   pil produk di chart Available Quota. */
function _stIsiDropdown(all) {
  const isi = (id, nilai, label, terpilih) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sig = nilai.join('|');
    if (el._sig === sig) { el.value = terpilih; return; }
    el._sig = sig;
    el.innerHTML = [`<option value="">${label}</option>`]
      .concat(nilai.map(v => {
        const teks = v.teks !== undefined ? v.teks : v;
        const val  = v.val  !== undefined ? v.val  : v;
        return `<option value="${_stEsc(val)}">${_stEsc(teks)}</option>`;
      })).join('');
    /* Pilihan yang produknya sudah tidak ada dikembalikan ke "semua" — kalau
       tidak, tabelnya kosong tanpa satu pun kontrol yang terlihat aktif. */
    el.value = nilai.some(v => (v.val !== undefined ? v.val : v) === terpilih) ? terpilih : '';
  };

  const produk = [...new Set(all.map(r => String(r.product)).filter(Boolean))].sort();
  isi('stFProduk', produk, '— Semua Produk —', _stFProduk);
  if (!produk.includes(_stFProduk)) _stFProduk = '';

  const adaKosong = all.some(r => !r.validityDate);
  const tgl = [...new Set(all.map(r => String(r.validityDate || '')).filter(Boolean))]
    .sort((a, b) => (_stHari(a) || 0) - (_stHari(b) || 0))
    .map(v => ({ val: v, teks: (typeof fmtDateStd === 'function' ? (fmtDateStd(v) || v) : v) }));
  if (adaKosong) tgl.push({ val: '__KOSONG__', teks: '(belum ada Validity)' });
  isi('stFValidity', tgl, '— Semua Validity —', _stFValid);
  if (_stFValid && !tgl.some(v => v.val === _stFValid)) _stFValid = '';
}

function buildSpiTerbitTable() {
  const tbody = document.getElementById('spiTerbitBody');
  if (!tbody) return;

  const all = (typeof spiTerbitRows === 'function') ? spiTerbitRows() : [];
  const q   = ((document.getElementById('spiTerbitQ') || {}).value || '').trim().toLowerCase();

  /* Angka di pil dihitung dari BARIS yang sama dengan isi tabel — bukan dari
     daftar company terpisah. Dulu keduanya diturunkan sendiri-sendiri dan bisa
     berbeda tanpa ada yang menyadarinya. */
  _stIsiDropdown(all);

  /* Pil dihitung atas baris yang sudah LOLOS penyaring lain (produk, validity,
     rentang tanggal, pencarian) — bukan atas seluruh 56 baris. Kalau dihitung
     atas semuanya, pil bertuliskan "52 Completed" sementara tabel di bawahnya
     hanya berisi 3 baris, dan angka itu berbohong tentang apa yang sedang
     dilihat. */
  const cocokQ = r => !q || (
       r.code.toLowerCase().includes(q)
    || String(r.product).toLowerCase().includes(q)
    || String(r.group).toLowerCase().includes(q)
    || String(r.spiNo).toLowerCase().includes(q)
    || String(r.pertekNo).toLowerCase().includes(q)
    || String(r.remarks).toLowerCase().includes(q));
  const dasar = all.filter(r => _stLolosFilter(r) && cocokQ(r));

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('stPillAll',       dasar.length);
  setTxt('stPillCompleted', dasar.filter(r => r.processKey === 'completed').length);
  setTxt('stPillUnder',     dasar.filter(r => r.processKey === 'under').length);
  setTxt('stPillPending',   dasar.filter(r => r.processKey === 'pending').length);
  setTxt('stPillNewsub',    dasar.filter(r => r.processKey === 'newsub').length);

  const rows = dasar.filter(r => {
    const want = _ST_PILL[spiTerbitFilter];
    return !want || r.processKey === want;
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
      Tidak ada data untuk tahun kuota ${QUOTA_YEAR}${
        (q || _stFProduk || _stFValid || _stFDari || _stFSampai)
          ? ' dengan penyaring yang sedang aktif — klik Reset untuk menampilkan semuanya' : ''}.
    </td></tr>`;
  }

  const foot = document.getElementById('spiTerbitFoot');
  if (foot) {
    const nAktif  = rows.filter(r => r.status === 'active').length;
    const nMati   = rows.filter(r => r.status === 'inactive').length;
    const nBelum  = rows.filter(r => r.status === 'none').length;
    /* Penyaring yang sedang aktif DINYATAKAN. Tabel yang menampilkan 3 dari 56
       baris tanpa mengatakan kenapa terbaca seperti data hilang. */
    const aktif = [];
    if (_stFProduk) aktif.push('produk ' + _stFProduk);
    if (_stFValid)  aktif.push('validity ' + (_stFValid === '__KOSONG__' ? 'belum ada'
                      : (typeof fmtDateStd === 'function' ? (fmtDateStd(_stFValid) || _stFValid) : _stFValid)));
    if (_stFDari || _stFSampai) {
      aktif.push('SPI ' + (_stFDari ? (typeof fmtDateStd === 'function' ? fmtDateStd(_stFDari) : _stFDari) : '…')
                + ' – ' + (_stFSampai ? (typeof fmtDateStd === 'function' ? fmtDateStd(_stFSampai) : _stFSampai) : '…'));
    }
    if (q) aktif.push('cari "' + q + '"');
    /* Baris yang SPI-nya belum terbit tidak punya tanggal, jadi tidak bisa
       dinilai masuk rentang mana pun — tersingkir oleh filter tanggal. Itu
       benar, tapi harus terlihat. */
    const takBertanggal = (_stFDari || _stFSampai)
      ? all.filter(r => _stLolosFilter({ ...r, spiDate: '01/01/2000' }) && _stHari(r.spiDate) === null).length : 0;

    foot.innerHTML =
      `<span>${rows.length} baris · ${new Set(rows.map(r => r.code)).size} company · tahun kuota <strong>${QUOTA_YEAR}</strong>` +
      (aktif.length ? ` · <strong style="color:var(--navy)">disaring:</strong> ${aktif.join(' · ')} <span style="color:var(--txt3)">(dari ${all.length} baris)</span>` : '') +
      (takBertanggal ? ` · <span style="color:var(--orange)">${takBertanggal} baris tanpa tanggal SPI tidak masuk rentang</span>` : '') +
      `</span>` +
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
