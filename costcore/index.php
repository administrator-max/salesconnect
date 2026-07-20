<?php
require_once __DIR__ . '/../lib/costcore_gate.php';

// "Lock" action (header button): clear the PIN and show the gate again.
if (isset($_GET['lock'])) { costcore_lock(); header('Location: ./'); exit; }

// Handle PIN submission.
$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pin'])) {
    if (costcore_verify_pin($_POST['pin'])) { header('Location: ./'); exit; }
    $err = 'PIN salah. Coba lagi.';
}

// Locked -> render the PIN screen and stop (the app below never loads).
if (!costcore_pin_ok()) {
    $e = htmlspecialchars($err, ENT_QUOTES);
    echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
       . '<meta name="robots" content="noindex, nofollow"><title>Cost Core — PIN</title><style>'
       . '*{box-sizing:border-box;margin:0;padding:0}'
       . 'body{font-family:system-ui,Segoe UI,sans-serif;background:#f0f4f8;color:#1a2744;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}'
       . '.box{background:#fff;border:1px solid #b8c7db;border-radius:16px;padding:2.2rem;width:100%;max-width:360px;box-shadow:0 8px 30px rgba(0,0,0,.08);text-align:center}'
       . '.logo{width:64px;height:64px;border-radius:14px;background:#1a73e8;margin:0 auto .7rem;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.6rem;font-weight:700}'
       . 'h1{font-size:1.15rem;margin-bottom:.2rem}p.t{color:#7b8fa8;font-size:.8rem;margin-bottom:1.2rem}'
       . 'input{width:100%;padding:.6rem .8rem;font-size:1.1rem;text-align:center;letter-spacing:.3em;border:1px solid #b8c7db;border-radius:9px;background:#f0f4f8;outline:none}'
       . 'input:focus{border-color:#1a73e8}'
       . 'button{width:100%;margin-top:1rem;padding:.6rem;border:none;border-radius:9px;background:#1a73e8;color:#fff;font-weight:600;font-size:.95rem;cursor:pointer}'
       . 'button:hover{background:#1557b0}'
       . '.err{background:#fdecea;color:#e03e3e;border:1px solid rgba(224,62,62,.2);border-radius:8px;padding:.45rem;font-size:.8rem;margin-top:.9rem}'
       . '.bk{display:inline-block;margin-top:1.1rem;font-size:.8rem;font-weight:600;color:#1a73e8;text-decoration:none;padding:.4rem .85rem;border:1px solid #c7d2fe;border-radius:8px;background:#eef2ff}.bk:hover{background:#e0e7ff}'
       . '</style></head><body>'
       . '<form class="box" method="post" action="">'
       . '<div class="logo">CC</div><h1>Cost Core</h1><p class="t">Masukkan PIN untuk lanjut</p>'
       . '<input type="password" name="pin" inputmode="numeric" autocomplete="current-password" autofocus placeholder="&bull;&bull;&bull;&bull;">'
       . ($e !== '' ? '<div class="err">' . $e . '</div>' : '')
       . '<button type="submit">Buka</button>'
       . '<a class="bk" href="../">🏠 SalesConnect</a>'
       . '</form></body></html>';
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Cost Core - Steel Product Cost System (local, Google Sheets)">
<title>Cost Core - Local</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f0f4f8;--bg2:#fff;--bg3:#e8eef6;--bg4:#d5dfed;--bdr:#b8c7db;--bdr2:#dce4ef;
--t1:#1a2744;--t2:#2e4063;--t3:#4e6382;--t4:#7b8fa8;
--pr:#1a73e8;--pr2:#1557b0;--prBg:rgba(26,115,232,.06);--prBdr:rgba(26,115,232,.2);
--gn:#0d9f6e;--gnBg:rgba(13,159,110,.06);--gnBdr:rgba(13,159,110,.2);--rd:#e03e3e}
body{font-family:'DM Sans',system-ui,sans-serif;background:var(--bg);color:var(--t1);min-height:100vh;font-size:14px}
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}input[type=number]{-moz-appearance:textfield}
.mono{font-family:'JetBrains Mono',monospace}.wrap{max-width:1360px;margin:0 auto;padding:0 1rem}
.hdr{background:var(--bg2);border-bottom:1px solid var(--bdr);padding:.75rem 0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.hdr-in{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem}
.hdr-logo{width:36px;height:36px;border-radius:9px;overflow:hidden;box-shadow:0 2px 8px rgba(26,115,232,.3)}.hdr-logo img{width:100%;height:100%;object-fit:cover}
.hdr h1{font-size:1.05rem;font-weight:700}.hdr p{font-size:.64rem;color:var(--t4)}
.hdr-btns{display:flex;gap:.35rem;flex-wrap:wrap}
.btn{padding:.38rem .72rem;border-radius:8px;font-size:.73rem;font-weight:600;border:none;cursor:pointer;transition:all .12s;display:inline-flex;align-items:center;gap:.25rem;font-family:inherit;white-space:nowrap}
.btn-pr{background:var(--pr);color:#fff;box-shadow:0 1px 4px rgba(26,115,232,.25)}.btn-pr:hover{background:var(--pr2)}
.btn-o{background:var(--bg2);color:var(--t2);border:1px solid var(--bdr)}.btn-o:hover{background:var(--bg3)}
.btn-gn{background:var(--gnBg);color:var(--gn);border:1px solid var(--gnBdr)}.btn-gn:hover{background:rgba(13,159,110,.12)}
.btn-bl{background:var(--prBg);color:var(--pr);border:1px solid var(--prBdr)}.btn-bl:hover{background:rgba(26,115,232,.1)}
.btn-sm{padding:.26rem .5rem;font-size:.68rem}
.ptab{display:flex;background:var(--bg2);border-bottom:1px solid var(--bdr)}
.ptab button{padding:.55rem 1.4rem;border:none;border-bottom:2.5px solid transparent;background:none;color:var(--t4);font-weight:600;font-size:.82rem;cursor:pointer;font-family:inherit;transition:all .12s}
.ptab button.on{color:var(--pr);border-bottom-color:var(--pr);background:var(--prBg)}
.ptab button:hover:not(.on){background:var(--bg3)}
.pnl{background:var(--bg2);border:1px solid var(--bdr2);border-radius:12px;margin-bottom:.75rem;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.03)}
.pnl-h{display:flex;align-items:center;justify-content:space-between;padding:.48rem .9rem;border-bottom:1px solid var(--bdr2);background:var(--bg3)}
.pnl-h h3{font-size:.68rem;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:.3rem}
.pnl-h.clk{cursor:pointer}.pnl-h.clk:hover{background:var(--bg4)}
.pnl-b{padding:.9rem}.chv{color:var(--t4);transition:transform .2s;font-size:.7rem}.chv.open{transform:rotate(180deg)}
.fg{display:flex;flex-direction:column;gap:.1rem}.fl{font-size:.62rem;color:var(--t4);text-transform:uppercase;letter-spacing:.04em;font-weight:500}
.fi{width:100%;background:var(--bg);border:1px solid var(--bdr);border-radius:7px;padding:.36rem .52rem;font-size:.76rem;color:var(--t1);outline:none;transition:border .12s;font-family:inherit}
.fi:focus{border-color:var(--pr);box-shadow:0 0 0 2px rgba(26,115,232,.1)}.fi:disabled{opacity:.5;cursor:not-allowed;background:var(--bg3)}
.fi-w{position:relative}.fi-s{position:absolute;right:.45rem;top:50%;transform:translateY(-50%);font-size:.6rem;color:var(--t4);pointer-events:none}
.fi.suf{padding-right:2.4rem}
select.fi{appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237b8fa8'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right .5rem center;padding-right:1.4rem}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem}.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem}
.top-g{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:.7rem}
@media(max-width:900px){.g3,.g4{grid-template-columns:1fr 1fr}.top-g{grid-template-columns:1fr}}
@media(max-width:600px){.g2,.g3,.g4{grid-template-columns:1fr}}
.itm{display:flex;align-items:center;gap:.45rem;background:var(--bg);border:1px solid var(--bdr2);border-radius:9px;padding:.42rem .6rem;margin-bottom:.28rem;transition:border .12s;flex-wrap:wrap}
.itm:hover{border-color:var(--bdr)}
.itm-n{color:var(--t4);font-size:.73rem;width:1.4rem;text-align:center;flex-shrink:0;font-weight:600}
.ii{background:var(--bg2);border:1px solid var(--bdr);border-radius:6px;padding:.34rem .48rem;font-size:.76rem;color:var(--t1);outline:none;font-family:inherit}
.ii:focus{border-color:var(--pr)}.ii::placeholder{color:var(--t4)}
.ii.nm{flex:1;min-width:120px}.ii.nu{width:5.8rem;text-align:right}.ii.ci{width:6.8rem;text-align:right;color:var(--pr2);font-weight:600;border-color:var(--prBdr)}
.ii.rm{width:6.5rem;font-size:.7rem}
.itm-x{background:none;border:none;color:var(--t4);font-size:.95rem;cursor:pointer;padding:0 .15rem;flex-shrink:0}.itm-x:hover{color:var(--rd)}
.tw{overflow-x:auto;margin:0 -.9rem;padding:0 .9rem}
table{width:100%;border-collapse:collapse}
th{font-size:.62rem;color:var(--t4);text-transform:uppercase;letter-spacing:.04em;padding:.34rem .28rem;text-align:right;font-weight:600;white-space:nowrap;border-bottom:2px solid var(--bdr2)}
th:first-child,th:nth-child(2){text-align:left}
td{padding:.34rem .28rem;font-size:.74rem;text-align:right;border-top:1px solid var(--bdr2);color:var(--t2)}
td:first-child,td:nth-child(2){text-align:left}
tbody tr:hover{background:var(--bg)}
.tp{color:var(--pr2)}.tg{color:var(--gn)}.tm{color:var(--t4)}.tb{font-weight:700}
.t-tot{border-top:2px solid var(--prBdr);background:var(--prBg)}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin-top:.75rem}
.sc{background:var(--bg);border:1px solid var(--bdr2);border-radius:9px;padding:.6rem}
.sc.pr{border-color:var(--prBdr);background:var(--prBg)}.sc.gn{border-color:var(--gnBdr);background:var(--gnBg)}
.sc-l{font-size:.6rem;color:var(--t4);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.06rem;font-weight:500}
.sc-v{font-size:.92rem;font-weight:700}
@media(max-width:768px){.sg{grid-template-columns:1fr 1fr}}
.bd{display:flex;align-items:baseline;gap:.4rem;font-size:.76rem;color:var(--t3);padding:.07rem 0}
.bd.sep{border-top:1px solid var(--bdr2);padding-top:.2rem;margin-top:.07rem}
.bd.hl{color:var(--pr2);font-weight:700;font-size:.82rem}
.bd-l{width:12.5rem;flex-shrink:0}.bd-v{width:10.5rem;flex-shrink:0;text-align:right;font-weight:600;color:var(--t1)}.bd-n{font-size:.6rem;color:var(--t4)}
.mo{position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:rgba(26,34,54,.3);backdrop-filter:blur(3px)}
.mo.hide{display:none}
.mo-c{background:var(--bg2);border:1px solid var(--bdr);border-radius:14px;width:100%;max-width:600px;margin:.8rem;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.1)}
.mo-h{display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem;border-bottom:1px solid var(--bdr2)}
.mo-h h2{font-size:.92rem;font-weight:700}
.mo-x{color:var(--t4);font-size:1.2rem;cursor:pointer;background:none;border:none}.mo-x:hover{color:var(--t1)}
.mo-tabs{display:flex;border-bottom:1px solid var(--bdr2)}
.mo-tab{flex:1;padding:.48rem;font-size:.76rem;font-weight:500;background:none;border:none;color:var(--t4);cursor:pointer;font-family:inherit;border-bottom:2px solid transparent}
.mo-tab.on{color:var(--pr);border-bottom-color:var(--pr);background:var(--prBg)}
.mo-bd{padding:1rem;overflow-y:auto;flex:1}
.mo-ft{display:flex;align-items:center;justify-content:space-between;padding:.55rem 1rem;border-top:1px solid var(--bdr2);background:var(--bg3)}
.dz{border:2px dashed var(--bdr);border-radius:12px;padding:1.8rem;text-align:center;cursor:pointer;transition:all .12s}
.dz:hover{border-color:var(--t4);background:var(--bg3)}.dz.ov{border-color:var(--pr);background:var(--prBg)}
.pa{width:100%;min-height:140px;background:var(--bg);border:1px solid var(--bdr);border-radius:9px;padding:.6rem;font-size:.76rem;color:var(--t1);outline:none;font-family:'JetBrains Mono',monospace;resize:vertical;line-height:1.5}
.pa:focus{border-color:var(--pr)}.pa::placeholder{color:var(--t4)}
.al-ok{background:var(--gnBg);border:1px solid var(--gnBdr);border-radius:9px;padding:.4rem .55rem;font-size:.76rem;color:var(--gn);font-weight:500}
.al-er{background:rgba(224,62,62,.05);border:1px solid rgba(224,62,62,.15);border-radius:9px;padding:.5rem;font-size:.76rem;color:var(--rd)}
.ptbl{border:1px solid var(--bdr2);border-radius:9px;overflow:hidden}.ptbl th{background:var(--bg3)}
.hint{background:var(--bg);border:1px solid var(--bdr2);border-radius:9px;padding:.5rem .65rem;margin-bottom:.55rem}
.hint b{color:var(--pr);font-size:.62rem;text-transform:uppercase;display:block;margin-bottom:.12rem}
.hint p{font-size:.66rem;color:var(--t4);line-height:1.5}
.hint code{font-family:'JetBrains Mono',monospace;background:var(--bg3);padding:.04rem .2rem;border-radius:3px;font-size:.62rem;color:var(--t2)}
.spinner{width:26px;height:26px;border:3px solid var(--pr);border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto .5rem}
@keyframes spin{to{transform:rotate(360deg)}}
.mt{margin-top:.45rem}.mb{margin-bottom:.45rem}.gap{display:flex;gap:.3rem}.tar{text-align:right}
.footer{font-size:.6rem;color:var(--t4);text-align:center;padding:.9rem 0}
.cb-label{display:flex;align-items:center;gap:.3rem;font-size:.73rem;color:var(--t2);cursor:pointer}
.cb-label input{accent-color:#1a73e8;width:14px;height:14px}
.mg-row{display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem}
.mg-row .fl{width:3rem;flex-shrink:0}
.srch-wrap{position:relative}.srch-dd{position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--bdr);border-radius:0 0 7px 7px;max-height:180px;overflow-y:auto;z-index:10;box-shadow:0 6px 16px rgba(0,0,0,.08);display:none}
.srch-dd.show{display:block}.srch-dd div{padding:.35rem .55rem;font-size:.76rem;cursor:pointer;color:var(--t2)}.srch-dd div:hover,.srch-dd div.hl{background:var(--prBg);color:var(--pr)}
.info-box{background:var(--prBg);border:1px solid var(--prBdr);border-radius:8px;padding:.5rem .7rem;font-size:.72rem;color:var(--pr2);margin-top:.4rem}
.xl-mi{display:block;width:100%;text-align:left;padding:.55rem .85rem;background:none;border:none;font-family:inherit;font-size:.8rem;font-weight:500;color:var(--t1);cursor:pointer;white-space:nowrap}
.xl-mi:hover{background:var(--prBg);color:var(--pr)}
.info-box b{font-weight:700}.info-box .tm{color:var(--t4)}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body>
<noscript><div style="padding:20px;background:#e03e3e;color:#fff;text-align:center;font-family:sans-serif"><strong>JavaScript is required.</strong> Please enable JavaScript to use Cost Core.</div></noscript>

<div id="app"></div>

<div id="lockScreen" style="display:none;position:fixed;inset:0;z-index:9999;background:var(--bg);align-items:center;justify-content:center">
  <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:16px;padding:2.2rem;width:100%;max-width:380px;margin:1rem;box-shadow:0 8px 30px rgba(0,0,0,.08)">
    <div style="text-align:center;margin-bottom:1.2rem">
      <div style="width:64px;height:64px;border-radius:14px;background:#1a73e8;margin:0 auto .6rem;display:flex;align-items:center;justify-content:center;color:#fff;font-size:2rem;font-weight:bold;">CC</div>
      <h2 style="font-size:1.1rem;font-weight:700;color:var(--t1)">Cost Core</h2>
      <p id="lockMsg" style="font-size:.75rem;color:var(--t4);margin-top:.3rem">Enter passcode to continue</p>
    </div>
    <div style="margin-bottom:.8rem">
      <label style="font-size:.65rem;color:var(--t4);text-transform:uppercase;letter-spacing:.04em;font-weight:500;display:block;margin-bottom:.2rem" for="lockPw">Passcode</label>
      <input type="password" id="lockPw" class="fi" style="width:100%;font-size:.85rem;padding:.5rem .7rem" placeholder="Enter passcode" autocomplete="current-password" onkeydown="if(event.key==='Enter')authLogin()">
    </div>
    <div id="lockErr" style="display:none;background:rgba(224,62,62,.06);border:1px solid rgba(224,62,62,.15);border-radius:8px;padding:.4rem .6rem;font-size:.75rem;color:var(--rd);margin-bottom:.6rem;text-align:center"></div>
    <button onclick="authLogin()" style="width:100%;padding:.55rem;border-radius:8px;font-size:.82rem;font-weight:600;border:none;cursor:pointer;background:#1a73e8;color:#fff;font-family:inherit;box-shadow:0 2px 6px rgba(26,115,232,.3)">Unlock</button>
    <p style="font-size:.62rem;color:var(--t4);text-align:center;margin-top:.8rem">Local &bull; Google Sheets</p>
  </div>
</div>

<div id="loadCloudModal" style="display:none;position:fixed;inset:0;z-index:9998;background:rgba(26,34,54,.35);backdrop-filter:blur(3px);align-items:center;justify-content:center">
  <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:14px;padding:1.8rem;width:100%;max-width:500px;margin:1rem;box-shadow:0 16px 50px rgba(0,0,0,.1)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h2 style="font-size:1rem;font-weight:700">Load Saved Costing</h2>
      <button onclick="closeLoadModal()" style="background:none;border:none;color:var(--t4);font-size:1.2rem;cursor:pointer" aria-label="Close">&times;</button>
    </div>
    <div id="cloudList" style="max-height:300px;overflow-y:auto;border:1px solid var(--bdr2);border-radius:8px;padding:.5rem;"></div>
  </div>
</div>

<script>
// ═══ DATA CONSTANTS ═══
// Pricing logic, shipping parameters, and static dropdowns

const TRK_BB = {
    Cakung: { r: 36000, rt: 1800000 },
    Marunda: { r: 36000, rt: 1800000 },
    "Ujung Menteng": { r: 38400, rt: 1920000 },
    Bekasi: { r: 42000, rt: 2100000 },
    "Dadap / Kapuk": { r: 46000, rt: 2300000 },
    Cibitung: { r: 48000, rt: 2400000 },
    Tambun: { r: 48000, rt: 2400000 },
    Cikarang: { r: 52800, rt: 2640000 },
    Cileungsi: { r: 52800, rt: 2640000 },
    Depok: { r: 54000, rt: 2700000 },
    Tigaraksa: { r: 55200, rt: 2760000 },
    "Curug Tanggerang": { r: 55200, rt: 2760000 },
    "Pasar Kemis": { r: 55200, rt: 2760000 },
    Jatake: { r: 57600, rt: 2880000 },
    Balaraja: { r: 60000, rt: 3000000 },
    Karawang: { r: 60000, rt: 3000000 },
    Cikande: { r: 72000, rt: 3600000 },
    Purwakarta: { r: 78000, rt: 3900000 },
    "Serang Banten": { r: 84000, rt: 4200000 },
    Cilegon: { r: 96000, rt: 4800000 }
};

const TRK_CT = {
    Cakung: { f20: 1440000, f40: 1800000, cb: 2160000 },
    Marunda: { f20: 1440000, f40: 1800000, cb: 2160000 },
    Tambun: { f20: 1920000, f40: 2160000, cb: 2640000 },
    "Dadap / Kapuk": { f20: 2000000, f40: 2250000, cb: 2750000 },
    Cibitung: { f20: 2040000, f40: 2280000, cb: 2760000 },
    Cikarang: { f20: 2160000, f40: 2520000, cb: 3000000 },
    Cileungsi: { f20: 2160000, f40: 2520000, cb: 3000000 },
    Tigaraksa: { f20: 2280000, f40: 2640000, cb: 3120000 },
    "Curug Tanggerang": { f20: 2280000, f40: 2640000, cb: 3120000 },
    "Pasar Kemis": { f20: 2280000, f40: 2640000, cb: 3120000 },
    Karawang: { f20: 2640000, f40: 3000000, cb: 3360000 },
    Balaraja: { f20: 2760000, f40: 3000000, cb: 3600000 },
    "Serang Banten": { f20: 3120000, f40: 3480000, cb: 3960000 },
    Purwakarta: { f20: 3240000, f40: 3480000, cb: 3960000 }
};

const PBM_MAP = { breakbulk: 230, container20: 350, container40: 509 };

const PAY_OPTS = [
    "Cash Before Delivery (CBD)",
    "DP 50% + Balance Before Delivery",
    "DP 30% + Balance Before Delivery",
    "DP 10%, Balance Payment 90% 3 days after BL",
    "Full Payment 100% Before Delivery",
    "Cash on Delivery (COD)",
    "NET 7 Days",
    "NET 14 Days",
    "NET 30 Days"
];
</script>
<script>
// === SalesConnect integration: single login via session cookie (no passcode) ===
// This page is served behind the SalesConnect login guard (index.php), so the user
// is always authenticated here. API calls are same-origin, so the session cookie
// rides along automatically — no shared secret / bearer token needed.
var API_BASE=".";                                 // page at /costcore/ -> "./api/..."
function apiHeaders(withAuth){return {"Content-Type":"application/json"};}
function showApp(){var l=document.getElementById("lockScreen");if(l)l.style.display="none";document.getElementById("app").style.display="block";}
function showLock(){window.location.href="./?lock=1";}   // "Lock" = clear Cost Core PIN
var _unlocked=true;
// If the SalesConnect session expires mid-use, any API call returns 401 -> back to login.
(function(){var f=window.fetch.bind(window);window.fetch=function(u,o){return f(u,o).then(function(res){if(res&&res.status===401){window.location.href="./";}return res;});};})();
// Boot straight into the app (render() is defined later in this file).
document.addEventListener("DOMContentLoaded",function(){showApp();render();});

// ═══ APPLICATION STATE ═══
var G={page:"import"};

var I={shipType:"breakbulk",customer:"",kurs:17050,importDuty:0,wht:.025,portCharges:370,hedgeRate:2.2,hedgeDays:60,tujuan:"Cakung",isPipa:false,stripping:0,addCost:0,commission:0,commUnit:"idr",marginType:"fixed",margin:900,payTerms:PAY_OPTS[0],items:[_mi(),_mi(),_mi()],paramsOpen:true,bdOpen:true,showUpload:false,upTab:"excel",uping:false,upPreview:null,upErr:"",pasteTxt:"",showPL:false};
var D={customer:"",whtRate:.003,addCost:0,margins:[{name:"A",val:1000},{name:"B",val:800},{name:"C",val:600}],trkCost:0,trkFrom:"",trkTo:"",payTerms:PAY_OPTS[0],items:[_md(),_md(),_md()],showUpload:false,upTab:"excel",uping:false,upPreview:null,upErr:"",pasteTxt:"",showPL:false};

function _mi(){return{id:Date.now()+Math.random(),name:"",qty:"",cif:"",remark:""}}
function _md(){return{id:Date.now()+Math.random(),name:"",qtyKg:"",buyPrice:"",marginIdx:0,remark:""}}
function fI(v){if(isNaN(v)||v==null)return"-";return new Intl.NumberFormat("id-ID").format(Math.round(v))}
function fD(v,d){d=d||2;if(isNaN(v)||v==null)return"-";return new Intl.NumberFormat("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d}).format(v)}
function esc(s){var d=document.createElement("div");d.textContent=s||"";return d.innerHTML}
function r25(v){return Math.ceil(v/25)*25}

// ═══ CALCULATIONS ═══
function iKSO(t){if(t<=0)return 0;if(I.shipType==="breakbulk"){if(t<=180)return(315*I.kurs)/(t*1000);if(t<=1428)return(1.75*I.kurs)/1000;return(2500*I.kurs)/(t*1000)}var n=Math.ceil(t/20);if(n<=3)return(315*I.kurs)/(t*1000);if(n<=26)return(95*n*I.kurs)/(t*1000);return(2500*I.kurs)/(t*1000)}
function iTrk(t){if(t<=0)return 0;if(I.shipType==="breakbulk"){var d=TRK_BB[I.tujuan];if(!d)return 0;if(I.isPipa)return(Math.ceil(t/25)*d.rt)/(t*1000);var f=Math.floor(t/50),s=t-(f*50);var c=f*50*d.r;if(s>0)c+=s<45?d.rt:s*d.r;return c/(t*1000)}var d=TRK_CT[I.tujuan];if(!d)return 0;var n=Math.ceil(t/20);if(I.shipType==="container20")return(Math.floor(n/2)*d.cb+(n%2)*d.f20)/(t*1000);return(n*d.f40)/(t*1000)}
function iCalc(it,kso,trk){var cfr=Number(it.cif)||0,qty=Number(it.qty)||0,qk=qty*1000;var du=cfr*I.importDuty,wh=(cfr+du)*I.wht;var bU=cfr+du+wh,bI=bU*I.kurs/1000;var ins=1.1*bU*0.0005*I.kurs/1000;var hd=I.hedgeRate*cfr*I.hedgeDays/1000;var st=I.isPipa?120:I.stripping;var pc=I.portCharges,pb=PBM_MAP[I.shipType]||230;var cm=I.commUnit==="usd"?(I.commission*I.kurs/1000):I.commission;var ddp=bI+ins+pc+pb+kso+hd+trk+st+I.addCost+cm;var mV=0,sell=0;if(I.marginType==="percent"){var p=(I.margin||0)/100;mV=ddp/(1-p)-ddp;sell=ddp+mV}else{mV=I.margin||0;sell=ddp+mV}sell=r25(sell);mV=sell-ddp;var sp=r25(sell*1.11);return{qty:qty,qk:qk,du:du,wh:wh,bU:bU,bI:bI,ins:ins,pc:pc,pb:pb,kso:kso,hd:hd,trk:trk,st:st,ac:I.addCost,cm:cm,ddp:ddp,mV:mV,sell:sell,sp:sp,tM:mV*qk,tP:sell*qk,tPP:sp*qk}}
function iAll(){var tT=I.items.reduce(function(s,i){return s+(Number(i.qty)||0)},0);var kso=iKSO(tT),trk=iTrk(tT);var R=I.items.map(function(i){return{item:i,c:iCalc(i,kso,trk)}});return{R:R,tT:R.reduce(function(s,r){return s+r.c.qty},0),tP:R.reduce(function(s,r){return s+r.c.tP},0),tM:R.reduce(function(s,r){return s+r.c.tM},0),tPP:R.reduce(function(s,r){return s+r.c.tPP},0),kso:kso,trk:trk}}

function dTrk(totalKg){return D.trkCost||0}
function dCalc(it,tk){var q=Number(it.qtyKg)||0,bp=Number(it.buyPrice)||0;var wh=bp*D.whtRate,tb=bp+wh;var ac=Number(D.addCost)||0;var mg=D.margins[it.marginIdx]?D.margins[it.marginIdx].val:0;var raw=tb+tk+ac+mg;var sell=r25(raw);return{q:q,bp:bp,wh:wh,tb:tb,tk:tk,ac:ac,mg:mg,raw:raw,sell:sell,tM:mg*q,tP:sell*q}}
function dAll(){var tQ=D.items.reduce(function(s,i){return s+(Number(i.qtyKg)||0)},0);var tk=dTrk(tQ);var R=D.items.map(function(i){return{item:i,c:dCalc(i,tk)}});return{R:R,tQ:R.reduce(function(s,r){return s+r.c.q},0),tP:R.reduce(function(s,r){return s+r.c.tP},0),tM:R.reduce(function(s,r){return s+r.c.tM},0),tk:tk}}

// === CLOUD DATA SYNC (local runner -> Google Sheet) ===
function cleanState(s){var c={};for(var k in s){if(["showUpload","uping","upPreview","upErr","pasteTxt","showPL"].indexOf(k)>=0)continue;c[k]=s[k];}return c;}

async function saveCosting(){
  var type=G.page; var st=type==='import'?I:D;
  if(!st.customer){toast("Please provide a customer name to save.","err");return;}
  try{
    var res=await fetch(API_BASE+'/api/costings',{method:'POST',headers:apiHeaders(true),body:JSON.stringify({type:type,customer:st.customer,data:cleanState(st)})});
    var d=await res.json();
    if(res.ok){st._cloudId=d.id;toast("Saved to Google Sheet","ok");render();}
    else toast("Save failed: "+esc(d.error||"error"),"err");
  }catch(e){toast("Error saving to Sheet","err");}
}

async function updateCosting(){
  var type=G.page; var st=type==='import'?I:D;
  if(!st._cloudId){toast("Nothing loaded to update - use Save.","err");return;}
  if(!st.customer){toast("Please provide a customer name.","err");return;}
  try{
    var res=await fetch(API_BASE+'/api/costings/'+st._cloudId,{method:'PUT',headers:apiHeaders(true),body:JSON.stringify({customer:st.customer,data:cleanState(st)})});
    var d=await res.json();
    if(res.ok)toast("Updated in Google Sheet","ok");
    else toast("Update failed: "+esc(d.error||"error"),"err");
  }catch(e){toast("Error updating","err");}
}

async function loadCloudModalOpen(){
  document.getElementById("loadCloudModal").style.display="flex";
  var type=G.page; var cl=document.getElementById("cloudList");
  cl.innerHTML="<i>Loading saved costings...</i>";
  try{
    var res=await fetch(API_BASE+'/api/costings/'+type,{headers:apiHeaders(true)});
    if(!res.ok)throw new Error();
    var rows=await res.json();
    if(rows.length===0)cl.innerHTML="No costings found.";
    else{
      cl.innerHTML=rows.map(function(r){
        var d=new Date(r.created_at).toLocaleDateString();
        return `<div style="display:flex;justify-content:space-between;padding:.5rem;border-bottom:1px solid #ddd;align-items:center;gap:.4rem;"><div style="min-width:0;flex:1"><b>${esc(r.customer)}</b> <span style="font-size:12px;color:#777">${d}</span></div><div style="display:flex;gap:.35rem;flex-shrink:0"><button class="btn btn-bl btn-sm" onclick="loadSingleCosting('${r.id}')">Load</button><button class="btn btn-sm" style="background:#e03e3e;color:#fff;font-weight:600" onclick="deleteCosting('${r.id}', '${esc(r.customer).replace(/'/g, "\\'")}')" title="Delete">Del</button></div></div>`;
      }).join("");
    }
  }catch(e){cl.innerHTML="Error loading from Sheet.";}
}

function closeLoadModal(){document.getElementById("loadCloudModal").style.display="none";}

async function loadSingleCosting(id){
  try{
    var res=await fetch(API_BASE+'/api/costings/load/'+id,{headers:apiHeaders(true)});
    if(res.ok){var payload=await res.json();payload._cloudId=id;if(G.page==='import')I=payload;else D=payload;closeLoadModal();render();toast("Loaded - edits will Update this record","ok");}
    else toast("Failed to load costing","err");
  }catch(e){toast("Error retrieving costing data.","err");}
}

async function deleteCosting(id,name){
  if(!confirm('Delete costing "'+name+'"?\nThis cannot be undone.'))return;
  try{
    var res=await fetch(API_BASE+'/api/costings/'+id,{method:'DELETE',headers:apiHeaders(true)});
    if(res.ok){if(I._cloudId===id)I._cloudId=null;if(D._cloudId===id)D._cloudId=null;loadCloudModalOpen();}
    else toast("Failed to delete costing","err");
  }catch(e){toast("Error deleting costing.","err");}
}

// ═══ EXPORTS ═══
function xPDF(id,fn,ori){var el=document.getElementById(id);if(!el)return;el.style.display="block";html2pdf().set({margin:ori==="portrait"?12:8,filename:fn,html2canvas:{scale:2},jsPDF:{unit:"mm",format:"a4",orientation:ori}}).from(el).save().then(function(){el.style.display="none"})}

function xlReady(){
  if(typeof XLSX==="undefined"){
    alert("Excel export library is not ready. Please refresh the page and try again.");
    return false;
  }
  return true;
}
function xlName(s){return String(s||"Project").replace(/[\\/:*?"<>|]+/g," ").replace(/\s+/g," ").trim()||"Project"}
function xlNum(v){return {v:isFinite(Number(v))?Number(v):0,t:"n"}}
function xlFormula(f,v){return {f:f,v:isFinite(Number(v))?Number(v):0,t:"n"}}
function xlFinish(wb){
  wb.Workbook=wb.Workbook||{};
  wb.Workbook.CalcPr={fullCalcOnLoad:true};
  return wb;
}

function iBuildXLS(){
  if(!xlReady())return null;
  var a=iAll(),R=a.R,tT=a.tT;
  var sl=I.shipType==="breakbulk"?"Break Bulk":I.shipType==="container20"?"Container 20ft":"Container 40ft";
  var kurs=I.kurs,dutyPct=I.importDuty,whtPct=I.wht,hedgeR=I.hedgeRate,hedgeD=I.hedgeDays;
  var hdr=[["Import Costing — "+(I.customer||"Project")],
  ["Type",sl,"Kurs",kurs,"Dest",I.tujuan,"Duty%",dutyPct,"WHT%",whtPct,"HedgeRate",hedgeR,"HedgeDays",hedgeD],
  [],
  ["No","Item","QTY(T)","CFR(USD/T)","Duty(USD/T)","WHT(USD/T)","Based USD/T","Based IDR/kg","Insurance","Port","PBM","KSO","Hedge","Truck","Strip","Comm","Add Cost","DDP","Margin","Sell Price","Sell+VAT","Margin Tot","Project Tot"]];
  var ws=XLSX.utils.aoa_to_sheet(hdr);
  var dataRows=[];var row=5;
  R.forEach(function(rr,idx){
    var it=rr.item,c=rr.c;if(!it.cif||!it.qty)return;
    var n=row;
    XLSX.utils.sheet_add_aoa(ws,[[idx+1,it.name,c.qty,Number(it.cif)]],{origin:"A"+n});
    ws["E"+n]=xlFormula("D"+n+"*"+dutyPct,c.du); ws["F"+n]=xlFormula("(D"+n+"+E"+n+")*"+whtPct,c.wh); ws["G"+n]=xlFormula("D"+n+"+E"+n+"+F"+n,c.bU); ws["H"+n]=xlFormula("G"+n+"*"+kurs+"/1000",c.bI); ws["I"+n]=xlFormula("1.1*G"+n+"*0.0005*"+kurs+"/1000",c.ins); ws["J"+n]=xlNum(c.pc); ws["K"+n]=xlNum(c.pb); ws["L"+n]=xlNum(c.kso); ws["M"+n]=xlFormula(hedgeR+"*D"+n+"*"+hedgeD+"/1000",c.hd); ws["N"+n]=xlNum(c.trk); ws["O"+n]=xlNum(c.st); ws["P"+n]=xlNum(c.cm); ws["Q"+n]=xlNum(c.ac); ws["R"+n]=xlFormula("H"+n+"+I"+n+"+J"+n+"+K"+n+"+L"+n+"+M"+n+"+N"+n+"+O"+n+"+P"+n+"+Q"+n,c.ddp);
    if(I.marginType==="percent"){ ws["T"+n]=xlFormula("CEILING(R"+n+"/(1-"+(I.margin/100)+"),25)",c.sell); ws["S"+n]=xlFormula("T"+n+"-R"+n,c.mV); }
    else{ ws["T"+n]=xlFormula("CEILING(R"+n+"+"+I.margin+",25)",c.sell); ws["S"+n]=xlFormula("T"+n+"-R"+n,c.mV); }
    ws["U"+n]=xlFormula("CEILING(T"+n+"*1.11,25)",c.sp); ws["V"+n]=xlFormula("S"+n+"*C"+n+"*1000",c.tM); ws["W"+n]=xlFormula("T"+n+"*C"+n+"*1000",c.tP);
    dataRows.push(n); row++;
  });
  row++;var tn=row; ws["A"+tn]={v:"",t:"s"};ws["B"+tn]={v:"TOTAL",t:"s"};
  if(dataRows.length){ var f=dataRows[0],l=dataRows[dataRows.length-1]; ws["C"+tn]=xlFormula("SUM(C"+f+":C"+l+")",tT); ws["V"+tn]=xlFormula("SUM(V"+f+":V"+l+")",a.tM); ws["W"+tn]=xlFormula("SUM(W"+f+":W"+l+")",a.tP); }
  ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:tn-1,c:22}});
  ws["!cols"]=[{wch:4},{wch:28},{wch:8},{wch:9},{wch:9},{wch:9},{wch:10},{wch:11},{wch:9},{wch:6},{wch:6},{wch:7},{wch:7},{wch:7},{wch:6},{wch:6},{wch:7},{wch:10},{wch:9},{wch:10},{wch:10},{wch:13},{wch:14}];
  ws["!autofilter"]={ref:"A4:W"+(dataRows.length?dataRows[dataRows.length-1]:4)};
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Costing");
  return {wb:xlFinish(wb), filename:"Costing_Import_"+xlName(I.customer)+"_"+new Date().toISOString().slice(0,10)+".xlsx"};
}

function dBuildXLS(){
  if(!xlReady())return null;
  var a=dAll(),R=a.R,tQ=a.tQ,tk=a.tk;
  var whtR=D.whtRate;
  var addC=Number(D.addCost)||0;
  var hdr=[["Domestic Costing — "+(D.customer||"Project")], ["WHT%",whtR,"Trucking IDR/kg",tk,"Add Cost IDR/kg",addC], [], ["No","Item","QTY(KG)","Buy Price","WHT","Total Buy","Trucking","Add Cost","Margin","Sell Price","Margin Tot","Project Tot","Remark"]];
  var ws=XLSX.utils.aoa_to_sheet(hdr);
  var dataRows=[];var row=5;
  R.forEach(function(rr,idx){
    var it=rr.item,c=rr.c;if(!it.buyPrice||!it.qtyKg)return;
    var n=row;
    XLSX.utils.sheet_add_aoa(ws,[[idx+1,it.name,Number(it.qtyKg),Number(it.buyPrice)]],{origin:"A"+n});
    ws["E"+n]=xlFormula("D"+n+"*"+whtR,c.wh); ws["F"+n]=xlFormula("D"+n+"+E"+n,c.tb); ws["G"+n]=xlNum(c.tk); ws["H"+n]=xlNum(c.ac); ws["I"+n]=xlNum(c.mg); ws["J"+n]=xlFormula("CEILING(F"+n+"+G"+n+"+H"+n+"+I"+n+",25)",c.sell); ws["K"+n]=xlFormula("I"+n+"*C"+n,c.tM); ws["L"+n]=xlFormula("J"+n+"*C"+n,c.tP); ws["M"+n]={v:it.remark||"",t:"s"};
    dataRows.push(n); row++;
  });
  row++;var tn=row; ws["A"+tn]={v:"",t:"s"};ws["B"+tn]={v:"TOTAL",t:"s"};
  if(dataRows.length){ var f=dataRows[0],l=dataRows[dataRows.length-1]; ws["C"+tn]=xlFormula("SUM(C"+f+":C"+l+")",tQ); ws["K"+tn]=xlFormula("SUM(K"+f+":K"+l+")",a.tM); ws["L"+tn]=xlFormula("SUM(L"+f+":L"+l+")",a.tP); }
  ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:tn-1,c:12}});
  ws["!cols"]=[{wch:4},{wch:28},{wch:10},{wch:11},{wch:9},{wch:11},{wch:9},{wch:9},{wch:9},{wch:11},{wch:13},{wch:14},{wch:14}];
  ws["!autofilter"]={ref:"A4:M"+(dataRows.length?dataRows[dataRows.length-1]:4)};
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Costing");
  return {wb:xlFinish(wb), filename:"Costing_Domestic_"+xlName(D.customer)+"_"+new Date().toISOString().slice(0,10)+".xlsx"};
}

// ═══ EXCEL ACTIONS: Download vs Send to Drive ═══
function toast(msg, type){
  var t=document.getElementById("ccToast");
  if(!t){t=document.createElement("div");t.id="ccToast";t.style.cssText="position:fixed;bottom:20px;right:20px;z-index:10000;padding:.7rem 1rem;border-radius:10px;font-size:.82rem;font-weight:600;font-family:inherit;box-shadow:0 8px 30px rgba(0,0,0,.18);max-width:340px;transition:opacity .3s";document.body.appendChild(t)}
  var c=type==="err"?["#fdecea","#e03e3e"]:type==="info"?["#e8eef6","#1557b0"]:["#e6f6ef","#0d9f6e"];
  t.style.background=c[0];t.style.color=c[1];t.innerHTML=msg;t.style.opacity="1";
  clearTimeout(window._toastT);
  if(type!=="info")window._toastT=setTimeout(function(){t.style.opacity="0"},4500);
}

function xlBuild(){ return G.page==="import"?iBuildXLS():dBuildXLS(); }

function xlDownload(){
  
  var b=xlBuild(); if(!b){render();return;}
  XLSX.writeFile(b.wb, b.filename);
  render();
}

// ═══ UPLOAD & PARSING ═══
function parseXL(f,st){st.uping=true;st.upErr="";st.upPreview=null;render();var r=new FileReader();r.onload=function(e){try{var wb=XLSX.read(e.target.result,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],j=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});var h=(j[0]||[]).map(function(x){return String(x).toLowerCase()});var nc=-1,tc=-1,cc=-1;for(var i=0;i<h.length;i++){if(nc<0&&(h[i].includes("nama")||h[i].includes("name")||h[i].includes("item")||h[i].includes("type")||h[i].includes("desc")))nc=i;if(tc<0&&(h[i].includes("ton")||h[i].includes("qty")||h[i].includes("kg")||h[i].includes("weight")))tc=i;if(cc<0&&(h[i].includes("cfr")||h[i].includes("cif")||h[i].includes("price")||h[i].includes("harga")||h[i].includes("usd")||h[i].includes("buy")))cc=i}if(nc<0&&h.length>=2){nc=0;tc=1;if(h.length>=3)cc=2}var rows=j.slice(1).filter(function(r){return r.some(function(c){return c!==""})}).map(function(r){return{name:nc>=0?String(r[nc]||""):"",qty:tc>=0?parseFloat(r[tc])||"":"",price:cc>=0?parseFloat(r[cc])||"":""}}).filter(function(r){return r.name||r.qty||r.price});if(!rows.length){st.upErr="No data found.";st.uping=false;render();return}st.upPreview={rows:rows,info:"Detected "+rows.length+" items"}}catch(er){st.upErr="Error: "+er.message}st.uping=false;render()};r.readAsArrayBuffer(f)}
function parsePaste(st){var raw=st.pasteTxt.trim();if(!raw){st.upErr="Empty text.";render();return}st.upErr="";st.upPreview=null;var lines=raw.split(/\n/).map(function(l){return l.trim()}).filter(function(l){return l}),rows=[];for(var li=0;li<lines.length;li++){var ln=lines[li];var p;if(ln.indexOf("\t")>=0)p=ln.split("\t");else if(ln.indexOf(",")>=0)p=ln.split(",");else p=ln.split(/\s{2,}/);p=p.map(function(s){return s.trim()});var nums=[],txts=[];for(var pi=0;pi<p.length;pi++){var x=p[pi];var n=parseFloat(x.replace(/[^\d.\-]/g,""));if(!isNaN(n)&&/\d/.test(x))nums.push(n);else txts.push(x)}var nm=txts.join(" "),q="",pr="";if(nums.length>=2){q=nums[0];pr=nums[1]}else if(nums.length===1){nums[0]>500?pr=nums[0]:q=nums[0]}var lw=ln.toLowerCase();if(lw.indexOf("nama")>=0&&lw.indexOf("ton")>=0)continue;if(lw.indexOf("no")>=0&&lw.indexOf("item")>=0)continue;if(nm||q||pr)rows.push({name:nm,qty:q,price:pr})}if(!rows.length){st.upErr="No data detected.";render();return}st.upPreview={rows:rows,info:"Parsed "+rows.length+" items"};render()}
function handleFile(f,st){if(!f)return;st.upPreview=null;st.upErr="";var ext=f.name.split(".").pop().toLowerCase();if(["xlsx","xls","csv"].indexOf(ext)>=0){st.upTab="excel";parseXL(f,st)}else{st.upErr="Unsupported format.";render()}}
function closeM(st){st.showUpload=false;st.upPreview=null;st.upErr="";st.uping=false;st.pasteTxt="";render()}

function confirmImpI(){if(!I.upPreview)return;var ni=I.upPreview.rows.map(function(r){return{id:Date.now()+Math.random(),name:r.name||"",qty:r.qty||"",cif:r.price||""}});I.items=I.items.filter(function(i){return i.name||i.qty||i.cif}).concat(ni);closeM(I)}
function confirmImpD(){if(!D.upPreview)return;var ni=D.upPreview.rows.map(function(r){return{id:Date.now()+Math.random(),name:r.name||"",qtyKg:r.qty||"",buyPrice:r.price||"",marginIdx:0,remark:""}});D.items=D.items.filter(function(i){return i.name||i.qtyKg||i.buyPrice}).concat(ni);closeM(D)}

function resetAll(){
  if(!confirm("Reset all form values? This cannot be undone."))return;
  if(G.page==="import"){
    I.customer="";I.items=[_mi(),_mi(),_mi()];I.commission=0;I.addCost=0;I.stripping=0;I.margin=0;I.isPipa=false;I.importDuty=0;I.kurs=17050;I._cloudId=null;
  }else{
    D.customer="";D.items=[_md(),_md(),_md()];D.trkCost=0;D.trkFrom="";D.trkTo="";D.addCost=0;D._cloudId=null;
  }
  render();
}

function showTujDD(){var dd=document.getElementById("tujDD");if(dd)dd.classList.add("show");document.addEventListener("click",hideTujDD)}
function hideTujDD(e){var w=document.querySelector(".srch-wrap");if(w&&!w.contains(e.target)){var dd=document.getElementById("tujDD");if(dd)dd.classList.remove("show");document.removeEventListener("click",hideTujDD)}}
function filterTujDD(val){var dd=document.getElementById("tujDD");if(!dd)return;dd.classList.add("show");var items=dd.querySelectorAll("div");var lv=val.toLowerCase();items.forEach(function(d){d.style.display=d.textContent.toLowerCase().indexOf(lv)>=0?"":"none"})}
function pickTuj(v){I.tujuan=v;var dd=document.getElementById("tujDD");if(dd)dd.classList.remove("show");render()}


// ═══ HTML RENDERING LOGIC ═══
function render(){
    var h="";
    var today=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});

    h+='<div class="hdr"><div class="wrap"><div class="hdr-in"><div style="display:flex;align-items:center;gap:.5rem"><div style="width:36px;height:36px;border-radius:9px;background:#1a73e8;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2rem;font-weight:bold;">CC</div><div><h1 style="font-size:1.05rem;font-weight:700">Cost Core Cloud</h1><p style="font-size:.64rem;color:var(--t4)">Steel Product Cost System &bull; '+"Local (Google Sheets)"+'</p></div></div><div class="hdr-btns">';
    h+='<a class="btn btn-o" href="../" style="text-decoration:none" title="Kembali ke Tools Centre">🏠 SalesConnect</a>';

    // Cloud Actions
    h+='<button class="btn btn-bl" onclick="saveCosting()">☁️ Save Cloud</button>';
    h+='<button class="btn btn-o" onclick="loadCloudModalOpen()">📥 Load Cloud</button>';
    var _cur=G.page==="import"?I:D;
    if(_cur._cloudId) h+='<button class="btn btn-gn" onclick="updateCosting()">💾 Update</button>';
    h+='<span style="width:1px;height:22px;background:var(--bdr);margin:0 .15rem"></span>';

    if(G.page==="import"){
      var st=I;
      h+='<button class="btn btn-gn" onclick="xPDF(\'pArea\',\'Costing_Import_'+(I.customer||'Project')+'_'+new Date().toISOString().slice(0,10)+'.pdf\',\'landscape\')">\uD83D\uDCC4 Costing PDF</button>';
      h+='<button class="btn btn-o" onclick="xlDownload()">📈 Excel</button>';
      h+='<button class="btn btn-bl" onclick="xPDF(\'qArea\',\'Quotation_'+(I.customer||'Client')+'_'+new Date().toISOString().slice(0,10)+'.pdf\',\'portrait\')">\uD83D\uDCCB Quotation</button>';
    }else{
      h+='<button class="btn btn-gn" onclick="xPDF(\'dpArea\',\'Costing_Domestic_'+(D.customer||'Project')+'_'+new Date().toISOString().slice(0,10)+'.pdf\',\'landscape\')">\uD83D\uDCC4 Costing PDF</button>';
      h+='<button class="btn btn-o" onclick="xlDownload()">📈 Excel</button>';
      h+='<button class="btn btn-bl" onclick="xPDF(\'dqArea\',\'Quotation_Domestic_'+(D.customer||'Client')+'_'+new Date().toISOString().slice(0,10)+'.pdf\',\'portrait\')">\uD83D\uDCCB Quotation</button>';
    }

    h+='<span style="width:1px;height:22px;background:var(--bdr);margin:0 .15rem"></span>';
    
    h+='<button class="btn btn-o btn-sm" onclick="showLock()" title="Lock & Logout">\uD83D\uDD12 Lock</button>';
    h+='<button class="btn btn-sm" onclick="resetAll()" title="Clear Form" style="background:#e03e3e;color:#fff;font-weight:700;margin-left:auto">\u21BA Reset</button>';
    h+='</div></div></div></div>';

    h+='<div class="ptab"><button class="'+(G.page==="import"?"on":"")+'" onclick="G.page=\'import\';render()">\uD83D\uDEA2 Import Costing</button><button class="'+(G.page==="domestic"?"on":"")+'" onclick="G.page=\'domestic\';render()">\uD83C\uDFE0 Domestic Costing</button></div>';

    h+='<div class="wrap" style="padding:.9rem 1rem 1.2rem">';
    if(G.page==="import") h+=renderImport(today); else h+=renderDomestic(today);
    h+='<div class="footer">Cost Core Local v5.0 &bull; Google Sheets</div></div>';

    if(G.page==="import") h+=renderImportPDFs(today); else h+=renderDomesticPDFs(today);
    var st=G.page==="import"?I:D;
    h+=renderUploadModal(st);

    document.getElementById("app").innerHTML=h;
    
    // Drag/Drop Listeners for File uploads
    var dz=document.getElementById("dz");
    if(dz){
        dz.ondragover=function(e){e.preventDefault();dz.classList.add("ov")};
        dz.ondragleave=function(){dz.classList.remove("ov")};
        dz.ondrop=function(e){e.preventDefault();dz.classList.remove("ov");handleFile(e.dataTransfer.files[0],st)}
    }
}

function renderUploadModal(st){
    var isImp=G.page==="import";
    var h='<div class="mo '+(st.showUpload?"":"hide")+'" onclick="closeM('+(isImp?"I":"D")+')"><div class="mo-c" onclick="event.stopPropagation()"><div class="mo-h"><h2>Import Data</h2><button class="mo-x" onclick="closeM('+(isImp?"I":"D")+')">&times;</button></div><div class="mo-tabs"><button class="mo-tab '+(st.upTab==="excel"?"on":"")+'" onclick="'+(isImp?"I":"D")+'.upTab=\'excel\';'+(isImp?"I":"D")+'.upPreview=null;'+(isImp?"I":"D")+'.upErr=\'\';render()">Upload Excel</button><button class="mo-tab '+(st.upTab==="paste"?"on":"")+'" onclick="'+(isImp?"I":"D")+'.upTab=\'paste\';'+(isImp?"I":"D")+'.upPreview=null;'+(isImp?"I":"D")+'.upErr=\'\';render()">Paste Text</button></div><div class="mo-bd">';
    if(st.upTab==="excel"&&!st.upPreview&&!st.uping&&!st.upErr)h+='<div class="dz" id="dz" onclick="document.getElementById(\'fu\').click()"><input type="file" id="fu" style="display:none" accept=".xlsx,.xls,.csv" onchange="handleFile(this.files[0],'+(isImp?"I":"D")+')"><div style="font-size:2rem;margin-bottom:.5rem">\uD83D\uDCCA</div><div style="color:var(--t2);font-weight:500;margin-bottom:.2rem">Drop Excel/CSV file here</div><div style="color:var(--t4);font-size:.76rem">or click to browse</div></div>';
    if(st.uping)h+='<div style="padding:2rem;text-align:center"><div class="spinner"></div><div style="color:var(--t2)">Reading file...</div></div>';
    if(st.upTab==="paste"&&!st.upPreview)h+='<div class="hint"><b>How to use</b><p>Copy from <strong>Excel, WhatsApp, email</strong> and paste below.<br>Tab: <code>Item [tab] Qty [tab] Price</code></p></div><textarea class="pa" placeholder="Paste data here..." oninput="'+(isImp?"I":"D")+'.pasteTxt=this.value">'+esc(st.pasteTxt)+'</textarea><div class="tar mt"><button class="btn btn-pr" onclick="parsePaste('+(isImp?"I":"D")+')">\uD83D\uDD0D Parse</button></div>';
    if(st.upErr)h+='<div class="al-er mt">'+st.upErr+'</div>';
    if(st.upPreview){var p=st.upPreview;h+='<div class="al-ok mt mb">\u2713 '+p.rows.length+' items \u2014 '+p.info+'</div><div class="ptbl"><table><thead><tr><th style="text-align:left">#</th><th style="text-align:left">Name</th><th>Qty</th><th>Price</th></tr></thead><tbody>';p.rows.forEach(function(r,i){h+='<tr><td style="text-align:left" class="tm">'+(i+1)+'</td><td style="text-align:left">'+(esc(r.name)||"-")+'</td><td>'+(r.qty||"-")+'</td><td class="tp tb">'+(r.price||"-")+'</td></tr>'});h+='</tbody></table></div>'}
    h+='</div>';
    if(st.upPreview){
      h+='<div class="mo-ft"><button class="btn btn-o" onclick="'+(isImp?"I":"D")+'.upPreview=null;'+(isImp?"I":"D")+'.upErr=\'\';render()">\u2190 Back</button><button class="btn btn-pr" onclick="confirmImp'+(isImp?"I":"D")+'()">Import '+st.upPreview.rows.length+' Items</button></div>';
    }
    h+='</div></div>';
    return h;
}

function renderImport(today){
    var a=iAll(),R=a.R,tT=a.tT,tP=a.tP,tM=a.tM,tPP=a.tPP,kso=a.kso,trk=a.trk;
    var pbm=PBM_MAP[I.shipType]||230;
    var tujList=I.shipType==="breakbulk"?Object.keys(TRK_BB):Object.keys(TRK_CT);
    if(tujList.indexOf(I.tujuan)<0)I.tujuan=tujList[0]||"Cakung";
    var sl=I.shipType==="breakbulk"?"Break Bulk":I.shipType==="container20"?"Container 20ft":"Container 40ft";
    var h="";
    h+='<div class="top-g">';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCE6 Shipment</h3></div><div class="pnl-b"><div class="fg mb"><label class="fl">Shipment Type</label><select class="fi" onchange="I.shipType=this.value;render()"><option value="breakbulk" '+(I.shipType==="breakbulk"?"selected":"")+'>Break Bulk</option><option value="container20" '+(I.shipType==="container20"?"selected":"")+'>Container 20ft</option><option value="container40" '+(I.shipType==="container40"?"selected":"")+'>Container 40ft</option></select></div><div class="fg mb"><label class="fl">Trucking Destination</label><div class="srch-wrap"><input type="text" class="fi" id="tujSearch" value="'+esc(I.tujuan)+'" onfocus="showTujDD()" oninput="filterTujDD(this.value)" placeholder="Type to search..."><div class="srch-dd" id="tujDD">'+tujList.map(function(k){return'<div onclick="pickTuj(\''+k+'\')">'+k+'</div>'}).join("")+'</div></div></div><label class="cb-label"><input type="checkbox" '+(I.isPipa?"checked":"")+' onchange="I.isPipa=this.checked;render()"> Stripping Options</label><div class="info-box mt"><b>KSO:</b> '+fD(kso,2)+' IDR/kg <span class="tm">('+(tT<=0?"-":I.shipType==="breakbulk"?(tT<=180?"USD 315 total / "+fD(tT)+" MT":tT<=1428?"USD 1.75/MT":"USD 2500 total / "+fD(tT)+" MT"):(function(){var n=Math.ceil(tT/20);return n<=3?"USD 315 total / "+n+" cnt":n<=26?"USD 95 x "+n+" cnt":"USD 2500 total / "+n+" cnt"})())+')</span><br><b>Trucking:</b> '+fD(trk,2)+' IDR/kg <span class="tm">('+esc(I.tujuan)+(I.isPipa?", pipe":", non-pipe")+')</span></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCB1 Exchange Rate</h3></div><div class="pnl-b"><div class="fg mb"><label class="fl">Rate IDR/USD</label><input type="number" class="fi" value="'+I.kurs+'" onchange="I.kurs=Number(this.value);render()"></div><div class="fg mb"><label class="fl">Customer</label><input type="text" class="fi" value="'+esc(I.customer)+'" placeholder="Customer name" onchange="I.customer=this.value;render()"></div><div class="fg"><label class="fl">Hedging Days</label><select class="fi" onchange="I.hedgeDays=Number(this.value);render()"><option value="60" '+(I.hedgeDays===60?"selected":"")+'>60 days</option><option value="90" '+(I.hedgeDays===90?"selected":"")+'>90 days</option><option value="150" '+(I.hedgeDays===150?"selected":"")+'>150 days</option></select></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCC8 Margin & Costs</h3></div><div class="pnl-b"><div class="fg mb"><label class="fl">Margin Type</label><select class="fi" onchange="I.marginType=this.value;render()"><option value="fixed" '+(I.marginType==="fixed"?"selected":"")+'>Fixed (IDR/kg)</option><option value="percent" '+(I.marginType==="percent"?"selected":"")+'>Percentage (%)</option></select></div><div class="fg mb"><label class="fl">'+(I.marginType==="fixed"?"Margin (IDR/kg)":"Margin (%)")+'</label><div class="fi-w"><input type="number" class="fi suf" value="'+I.margin+'" onchange="I.margin=Number(this.value);render()"><span class="fi-s">'+(I.marginType==="fixed"?"IDR/kg":"%")+'</span></div></div><div class="fg mb"><label class="fl">Commission</label><div style="display:flex;gap:.35rem"><div class="fi-w" style="flex:1"><input type="number" class="fi suf" value="'+I.commission+'" onchange="I.commission=Number(this.value);render()" style="padding-right:3rem"><span class="fi-s">'+(I.commUnit==="idr"?"IDR/kg":"USD/MT")+'</span></div><select class="fi" style="width:5.2rem;flex-shrink:0" onchange="I.commUnit=this.value;render()"><option value="idr" '+(I.commUnit==="idr"?"selected":"")+'>IDR/kg</option><option value="usd" '+(I.commUnit==="usd"?"selected":"")+'>USD/MT</option></select></div></div><div class="fg mb"><label class="fl">Payment Terms</label><select class="fi" onchange="I.payTerms=this.value;render()">'+PAY_OPTS.map(function(o){return'<option value="'+o+'" '+(o===I.payTerms?"selected":"")+'>'+o+'</option>'}).join("")+'</select></div><div class="fg"><label class="fl">Additional Cost</label><div class="fi-w"><input type="number" class="fi suf" value="'+I.addCost+'" onchange="I.addCost=Number(this.value);render()"><span class="fi-s">IDR/kg</span></div></div></div></div>';
    h+='</div>';
    var po=I.paramsOpen;
    h+='<div class="pnl"><div class="pnl-h clk" onclick="I.paramsOpen=!I.paramsOpen;render()"><h3>\u2699\uFE0F Cost Parameters (auto)</h3><span class="chv '+(po?"open":"")+'">&#x25BE;</span></div>';
    if(po){h+='<div class="pnl-b"><div class="g4"><div class="fg"><label class="fl">Import Duty</label><div class="fi-w"><input type="number" class="fi suf" value="'+(I.importDuty*100)+'" onchange="I.importDuty=Number(this.value)/100;render()" step="0.1"><span class="fi-s">%</span></div></div><div class="fg"><label class="fl">WHT</label><div class="fi-w"><input type="number" class="fi suf" value="'+(I.wht*100)+'" onchange="I.wht=Number(this.value)/100;render()" step="0.1"><span class="fi-s">%</span></div></div><div class="fg"><label class="fl">Port Charges</label><div class="fi-w"><input type="number" class="fi suf" value="'+I.portCharges+'" disabled><span class="fi-s">IDR/kg</span></div></div><div class="fg"><label class="fl">PBM ('+sl+')</label><div class="fi-w"><input type="number" class="fi suf" value="'+pbm+'" disabled><span class="fi-s">IDR/kg</span></div></div><div class="fg"><label class="fl">KSO (auto)</label><div class="fi-w"><input type="number" class="fi suf" value="'+fD(kso,1)+'" disabled><span class="fi-s">IDR/kg</span></div></div><div class="fg"><label class="fl">Hedge Rate</label><div class="fi-w"><input type="number" class="fi suf" value="'+I.hedgeRate+'" onchange="I.hedgeRate=Number(this.value);render()" step="0.1"><span class="fi-s"></span></div></div><div class="fg"><label class="fl">Trucking (auto)</label><div class="fi-w"><input type="number" class="fi suf" value="'+fD(trk,1)+'" disabled><span class="fi-s">IDR/kg</span></div></div><div class="fg"><label class="fl">Stripping</label><div class="fi-w"><input type="number" class="fi suf" value="'+(I.isPipa?120:I.stripping)+'" '+(I.isPipa?"disabled":"")+' onchange="I.stripping=Number(this.value);render()"><span class="fi-s">IDR/kg</span></div></div></div></div>'}
    h+='</div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDD29 Items</h3><button class="btn btn-o btn-sm" onclick="I.showUpload=true;render()">\u2B06 Upload</button></div><div class="pnl-b">';
    I.items.forEach(function(it,i){h+='<div class="itm"><span class="itm-n">'+(i+1)+'</span><input type="text" class="ii nm" value="'+esc(it.name)+'" placeholder="Item detail & spec" onchange="I.items['+i+'].name=this.value;render()"><div class="fi-w"><input type="number" class="ii nu suf" value="'+it.qty+'" placeholder="0" onchange="I.items['+i+'].qty=this.value;render()" style="padding-right:2.1rem"><span class="fi-s">TON</span></div><div class="fi-w"><input type="number" class="ii ci suf" value="'+it.cif+'" placeholder="0" onchange="I.items['+i+'].cif=this.value;render()" style="padding-right:2.4rem"><span class="fi-s">USD/T</span></div><input type="text" class="ii rm" value="'+esc(it.remark)+'" placeholder="Remark" onchange="I.items['+i+'].remark=this.value;render()"><button class="itm-x" onclick="I.items.splice('+i+',1);if(!I.items.length)I.items=[_mi()];render()">\u00D7</button></div>'});
    h+='<div class="gap mt"><button class="btn btn-o btn-sm" onclick="I.items.push(_mi());render()">+ Add</button><button class="btn btn-o btn-sm" onclick="I.items=I.items.filter(function(i){return i.name||i.qty||i.cif});if(!I.items.length)I.items=[_mi()];render()">Remove Empty</button></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCCA Results</h3><span style="font-size:.6rem;color:var(--t4)">Selling price rounded up to nearest IDR 25</span></div><div class="pnl-b"><div class="tw"><table class="mono"><thead><tr><th style="text-align:left">#</th><th style="text-align:left">Item</th><th>QTY<br><span class="tm">TON</span></th><th>CFR<br><span class="tm">USD/T</span></th><th>Based<br><span class="tm">IDR/kg</span></th><th>DDP<br><span class="tm">IDR/kg</span></th><th class="tp">Margin<br><span style="color:var(--pr2)">IDR/kg</span></th><th class="tp tb">Sell Price<br><span style="color:var(--pr2)">IDR/kg</span></th><th class="tg">+VAT<br><span style="color:var(--gn)">IDR/kg</span></th><th>Margin<br><span class="tm">Total</span></th><th>Project<br><span class="tm">Total</span></th></tr></thead><tbody>';
    R.forEach(function(r,i){var it=r.item,c=r.c,ok=it.cif&&it.qty;h+='<tr><td style="text-align:left" class="tm">'+(i+1)+'</td><td style="text-align:left">'+(esc(it.name)||"-")+'</td><td>'+(ok?fD(c.qty):"-")+'</td><td>'+(ok?fI(it.cif):"-")+'</td><td>'+(ok?fI(c.bI):"-")+'</td><td>'+(ok?fI(c.ddp):"-")+'</td><td class="tp">'+(ok?fI(Math.round(c.mV)):"-")+'</td><td class="tp tb">'+(ok?fI(c.sell):"-")+'</td><td class="tg">'+(ok?fI(c.sp):"-")+'</td><td>'+(ok?fI(c.tM):"-")+'</td><td>'+(ok?fI(c.tP):"-")+'</td></tr>'});
    h+='</tbody><tfoot><tr class="t-tot"><td colspan="2" style="text-align:left;color:var(--pr2);font-size:.64rem;text-transform:uppercase" class="tb">Total</td><td class="tb">'+fD(tT)+'</td><td colspan="6"></td><td class="tp tb">'+fI(tM)+'</td><td class="tb">'+fI(tP)+'</td></tr></tfoot></table></div>';
    h+='<div class="sg"><div class="sc"><div class="sc-l">Total Tonnage</div><div class="sc-v">'+fD(tT)+' <span style="font-size:.7rem;color:var(--t4)">MT</span></div></div><div class="sc pr"><div class="sc-l">Total Margin</div><div class="sc-v tp">Rp '+fI(tM)+'</div></div><div class="sc"><div class="sc-l">Project (Ex VAT)</div><div class="sc-v">Rp '+fI(tP)+'</div></div><div class="sc gn"><div class="sc-l">Project (Incl VAT 11%)</div><div class="sc-v tg">Rp '+fI(tPP)+'</div></div></div></div></div>';
    var bdi=I.bdOpen;
    h+='<div class="pnl"><div class="pnl-h clk" onclick="I.bdOpen=!I.bdOpen;render()"><h3>\uD83D\uDCCB Cost Breakdown (per item)</h3><span class="chv '+(bdi?"open":"")+'">&#x25BE;</span></div>';
    if(bdi){
    R.forEach(function(rr,idx){
      var it=rr.item,c=rr.c;
      if(!it.cif||!it.qty)return;
      var cfr=Number(it.cif)||0;
      h+='<div class="pnl-b" style="'+(idx>0?"border-top:1px solid var(--bdr2)":"")+'"><div style="font-size:.78rem;font-weight:700;color:var(--pr);margin-bottom:.4rem">'+(idx+1)+'. '+(esc(it.name)||"Item "+(idx+1))+' <span style="font-weight:400;color:var(--t4)">('+fD(c.qty)+' MT / CFR $'+fI(cfr)+'/T)</span></div>';
      h+='<div class="bd"><span class="bd-l">CFR Price</span><span class="bd-v">$ '+fD(cfr,2)+' /MT</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Import Duty ('+fD(I.importDuty*100,1)+'%)</span><span class="bd-v">$ '+fD(c.du,2)+'</span><span class="bd-n">= CFR × '+fD(I.importDuty*100,1)+'%</span></div>';
      h+='<div class="bd"><span class="bd-l">+ WHT ('+fD(I.wht*100,1)+'%)</span><span class="bd-v">$ '+fD(c.wh,2)+'</span><span class="bd-n">= (CFR+Duty) × '+fD(I.wht*100,1)+'%</span></div>';
      h+='<div class="bd sep"><span class="bd-l">Based Price (USD/T)</span><span class="bd-v">$ '+fD(c.bU,2)+'</span><span class="bd-n">= CFR + Duty + WHT</span></div>';
      h+='<div class="bd"><span class="bd-l">Based Price (IDR/kg)</span><span class="bd-v">Rp '+fD(c.bI,2)+'</span><span class="bd-n">= Based × '+fI(I.kurs)+' / 1000</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Insurance</span><span class="bd-v">Rp '+fD(c.ins,2)+'</span><span class="bd-n">= 1.1 × Based × 0.05% × Kurs / 1000</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Port Charges</span><span class="bd-v">Rp '+fI(c.pc)+'</span></div>';
      h+='<div class="bd"><span class="bd-l">+ PBM ('+sl+')</span><span class="bd-v">Rp '+fI(c.pb)+'</span></div>';
      h+='<div class="bd"><span class="bd-l">+ KSO</span><span class="bd-v">Rp '+fD(c.kso,2)+'</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Hedging ('+I.hedgeDays+'d)</span><span class="bd-v">Rp '+fD(c.hd,2)+'</span><span class="bd-n">= '+I.hedgeRate+' × CFR × '+I.hedgeDays+' / 1000</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Trucking ('+esc(I.tujuan)+')</span><span class="bd-v">Rp '+fD(c.trk,2)+'</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Stripping</span><span class="bd-v">Rp '+fI(c.st)+'</span></div>';
      if(c.cm>0) h+='<div class="bd"><span class="bd-l">+ Commission</span><span class="bd-v">Rp '+fD(c.cm,2)+'</span></div>';
      if(c.ac>0) h+='<div class="bd"><span class="bd-l">+ Additional Cost</span><span class="bd-v">Rp '+fI(c.ac)+'</span></div>';
      h+='<div class="bd sep hl"><span class="bd-l">DDP (Landed Cost)</span><span class="bd-v">Rp '+fI(Math.round(c.ddp))+'</span></div>';
      h+='<div class="bd"><span class="bd-l">+ Margin'+(I.marginType==="percent"?" ("+I.margin+"%)":"")+'</span><span class="bd-v">Rp '+fI(Math.round(c.mV))+'</span></div>';
      h+='<div class="bd sep hl"><span class="bd-l">\u2192 Selling Price</span><span class="bd-v" style="color:var(--pr)">Rp '+fI(c.sell)+'</span><span class="bd-n">rounded \u2191 25</span></div>';
      h+='<div class="bd"><span class="bd-l">\u2192 + VAT 11%</span><span class="bd-v" style="color:var(--gn)">Rp '+fI(c.sp)+'</span></div>';
      h+='</div>';
    });
    }
    h+='</div>';
    return h;
}

function renderDomestic(today){
    var a=dAll(),R=a.R,tQ=a.tQ,tP=a.tP,tM=a.tM,tk=a.tk;
    var h="";
    h+='<div class="top-g"><div class="pnl"><div class="pnl-h"><h3>\uD83D\uDE9A Trucking</h3></div><div class="pnl-b"><div class="fg mb"><label class="fl">Trucking Cost (IDR/kg)</label><div class="fi-w"><input type="number" class="fi suf" value="'+D.trkCost+'" onchange="D.trkCost=Number(this.value);render()"><span class="fi-s">IDR/kg</span></div></div><div class="g2"><div class="fg"><label class="fl">Pickup Location</label><input type="text" class="fi" value="'+esc(D.trkFrom)+'" placeholder="e.g. Marunda" onchange="D.trkFrom=this.value;render()"></div><div class="fg"><label class="fl">Delivery Destination</label><input type="text" class="fi" value="'+esc(D.trkTo)+'" placeholder="e.g. Cikarang" onchange="D.trkTo=this.value;render()"></div></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83C\uDFE2 Customer & Terms</h3></div><div class="pnl-b"><div class="fg mb"><label class="fl">Customer</label><input type="text" class="fi" value="'+esc(D.customer)+'" placeholder="Customer name" onchange="D.customer=this.value;render()"></div><div class="fg mb"><label class="fl">WHT Rate</label><div class="fi-w"><input type="number" class="fi suf" value="'+(D.whtRate*100)+'" onchange="D.whtRate=Number(this.value)/100;render()" step="0.01"><span class="fi-s">%</span></div></div><div class="fg mb"><label class="fl">Additional Cost</label><div class="fi-w"><input type="number" class="fi suf" value="'+(D.addCost||0)+'" onchange="D.addCost=Number(this.value);render()"><span class="fi-s">IDR/kg</span></div></div><div class="fg"><label class="fl">Payment Terms</label><select class="fi" onchange="D.payTerms=this.value;render()">'+PAY_OPTS.map(function(o){return'<option value="'+o+'" '+(o===D.payTerms?"selected":"")+'>'+o+'</option>'}).join("")+'</select></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCB0 Margin Types (IDR/kg)</h3></div><div class="pnl-b">';
    D.margins.forEach(function(m,i){h+='<div class="mg-row"><span class="fl" style="width:2.5rem;font-weight:700;color:var(--pr)">'+esc(m.name)+'</span><input type="text" class="fi" style="width:4rem" value="'+esc(m.name)+'" onchange="D.margins['+i+'].name=this.value;render()" placeholder="Name"><input type="number" class="fi" style="width:7rem" value="'+m.val+'" onchange="D.margins['+i+'].val=Number(this.value);render()"><button class="itm-x" onclick="D.margins.splice('+i+',1);render()">\u00D7</button></div>'});
    h+='<button class="btn btn-o btn-sm mt" onclick="D.margins.push({name:String.fromCharCode(65+D.margins.length),val:500});render()">+ Add Margin Type</button>';
    h+='</div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDD29 Items</h3><button class="btn btn-o btn-sm" onclick="D.showUpload=true;render()">\u2B06 Upload</button></div><div class="pnl-b">';
    D.items.forEach(function(it,i){
      var mgOpts=D.margins.map(function(m,mi){return'<option value="'+mi+'" '+(it.marginIdx===mi?"selected":"")+'>'+esc(m.name)+' ('+fI(m.val)+')</option>'}).join("");
      h+='<div class="itm"><span class="itm-n">'+(i+1)+'</span><input type="text" class="ii nm" value="'+esc(it.name)+'" placeholder="Item name / spec" onchange="D.items['+i+'].name=this.value;render()"><div class="fi-w"><input type="number" class="ii nu suf" value="'+it.qtyKg+'" placeholder="0" onchange="D.items['+i+'].qtyKg=this.value;render()" style="padding-right:1.8rem"><span class="fi-s">KG</span></div><div class="fi-w"><input type="number" class="ii ci suf" value="'+it.buyPrice+'" placeholder="0" onchange="D.items['+i+'].buyPrice=this.value;render()" style="padding-right:2.8rem"><span class="fi-s">IDR/kg</span></div><select class="fi" style="width:6rem;padding:.34rem .3rem;font-size:.7rem" onchange="D.items['+i+'].marginIdx=Number(this.value);render()">'+mgOpts+'</select><input type="text" class="ii rm" value="'+esc(it.remark)+'" placeholder="Remark" onchange="D.items['+i+'].remark=this.value;render()"><button class="itm-x" onclick="D.items.splice('+i+',1);if(!D.items.length)D.items=[_md()];render()">\u00D7</button></div>'});
    h+='<div class="gap mt"><button class="btn btn-o btn-sm" onclick="D.items.push(_md());render()">+ Add</button><button class="btn btn-o btn-sm" onclick="D.items=D.items.filter(function(i){return i.name||i.qtyKg||i.buyPrice});if(!D.items.length)D.items=[_md()];render()">Remove Empty</button></div></div></div>';
    h+='<div class="pnl"><div class="pnl-h"><h3>\uD83D\uDCCA Results</h3><span style="font-size:.6rem;color:var(--t4)">Trucking: '+fD(tk,1)+' IDR/kg</span></div><div class="pnl-b"><div class="tw"><table class="mono"><thead><tr><th style="text-align:left">#</th><th style="text-align:left">Item</th><th>QTY<br><span class="tm">KG</span></th><th>Buy Price<br><span class="tm">IDR/kg</span></th><th>WHT</th><th>Total Buy</th><th>Truck</th><th>Add Cost</th><th>Margin</th><th class="tp tb">Sell Price<br><span style="color:var(--pr2)">IDR/kg</span></th><th>Margin<br><span class="tm">Total</span></th><th>Project<br><span class="tm">Total</span></th><th>Remark</th></tr></thead><tbody>';
    R.forEach(function(r,i){var it=r.item,c=r.c,ok=it.buyPrice&&it.qtyKg;var mgName=D.margins[it.marginIdx]?D.margins[it.marginIdx].name:"";h+='<tr><td style="text-align:left" class="tm">'+(i+1)+'</td><td style="text-align:left">'+(esc(it.name)||"-")+'</td><td>'+(ok?fI(c.q):"-")+'</td><td>'+(ok?fI(c.bp):"-")+'</td><td>'+(ok?fD(c.wh,1):"-")+'</td><td>'+(ok?fI(c.tb):"-")+'</td><td>'+(ok?fD(c.tk,1):"-")+'</td><td>'+(ok?fI(c.ac):"-")+'</td><td>'+(ok?fI(c.mg)+" <span class=tm>("+esc(mgName)+")</span>":"-")+'</td><td class="tp tb">'+(ok?fI(c.sell):"-")+'</td><td>'+(ok?fI(c.tM):"-")+'</td><td>'+(ok?fI(c.tP):"-")+'</td><td class="tm" style="font-size:.68rem">'+(esc(it.remark)||"")+'</td></tr>'});
    h+='</tbody><tfoot><tr class="t-tot"><td colspan="2" style="text-align:left;color:var(--pr2);font-size:.64rem;text-transform:uppercase" class="tb">Total</td><td class="tb">'+fI(tQ)+'</td><td colspan="7"></td><td class="tp tb">'+fI(tM)+'</td><td class="tb">'+fI(tP)+'</td><td></td></tr></tfoot></table></div>';
    h+='<div class="sg"><div class="sc"><div class="sc-l">Total Quantity</div><div class="sc-v">'+fI(tQ)+' <span style="font-size:.7rem;color:var(--t4)">KG</span></div></div><div class="sc pr"><div class="sc-l">Total Margin</div><div class="sc-v tp">Rp '+fI(tM)+'</div></div><div class="sc"><div class="sc-l">Project Total</div><div class="sc-v">Rp '+fI(tP)+'</div></div><div class="sc gn"><div class="sc-l">Incl VAT 11%</div><div class="sc-v tg">Rp '+fI(Math.round(tP*1.11))+'</div></div></div></div></div>';
    return h;
}

function renderImportPDFs(today){
    var a=iAll(),R=a.R,tT=a.tT,tP=a.tP,tM=a.tM,tPP=a.tPP;
    var sl=I.shipType==="breakbulk"?"Break Bulk":I.shipType==="container20"?"Container 20ft":"Container 40ft";
    var h="";
    h+='<div id="pArea" style="display:none;padding:16px;background:#fff;color:#1a2744;font-family:DM Sans,sans-serif;font-size:10px"><h2 style="margin:0 0 2px;font-size:14px;color:#1a2744">Import Costing \u2014 '+(esc(I.customer)||"Project")+'</h2><p style="color:#4e6382;font-size:9px;margin-bottom:8px">'+today+' \u2022 '+sl+' \u2192 '+I.tujuan+' \u2022 Rate: Rp '+fI(I.kurs)+' \u2022 Hedge: '+I.hedgeDays+'d</p><table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr style="background:#e8eef6"><th style="border:1px solid #b8c7db;padding:3px;text-align:left;color:#4e6382">No</th><th style="border:1px solid #b8c7db;padding:3px;text-align:left;color:#4e6382">Item</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">QTY</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">CFR</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Based</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">DDP</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#1a73e8;font-weight:700">Sell Price</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#0d9f6e">+VAT</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Margin Tot</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Project Tot</th></tr></thead><tbody>';
    R.forEach(function(r,i){var it=r.item,c=r.c;if(!it.cif||!it.qty)return;h+='<tr><td style="border:1px solid #b8c7db;padding:2px 3px">'+(i+1)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px">'+esc(it.name)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fD(c.qty)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(it.cif)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.bI)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.ddp)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right;font-weight:700;color:#1a73e8">'+fI(c.sell)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right;color:#0d9f6e">'+fI(c.sp)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.tM)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.tP)+'</td></tr>'});
    h+='<tr style="background:#e8eef6;font-weight:700"><td colspan="2" style="border:1px solid #b8c7db;padding:2px 3px">TOTAL</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fD(tT)+'</td><td colspan="5"></td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(tM)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(tP)+'</td></tr></tbody></table></div>';
    h+='<div id="qArea" style="display:none;padding:28px 34px;background:#fff;color:#1a2744;font-family:DM Sans,sans-serif;font-size:11px;line-height:1.5"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;border-bottom:2px solid #1a73e8;padding-bottom:14px"><div><h1 style="font-size:18px;font-weight:700;color:#1a2744;margin:0 0 3px">QUOTATION</h1><p style="font-size:10px;color:#4e6382;margin:0">Date: '+today+'</p></div></div><div style="margin-bottom:16px"><p style="font-size:10px;color:#7b8fa8;margin:0 0 2px">Customer:</p><p style="font-size:13px;font-weight:700;margin:0;color:#1a2744">'+(esc(I.customer)||"[Customer Name]")+'</p></div><table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:16px"><thead><tr style="background:#e8eef6"><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">No</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">Item Description</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Qty (MT)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Unit Price (IDR/kg)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Amount (IDR)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">Remarks</th></tr></thead><tbody>';
    var qn=0;R.forEach(function(r){var it=r.item,c=r.c;if(!it.cif||!it.qty)return;qn++;h+='<tr><td style="border:1px solid #b8c7db;padding:4px 7px">'+qn+'</td><td style="border:1px solid #b8c7db;padding:4px 7px">'+esc(it.name)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">'+fD(c.qty)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:600">Rp '+fI(c.sell)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">Rp '+fI(c.tP)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;font-size:9px;color:#4e6382">'+(esc(it.remark)||"")+'</td></tr>'});
    h+='<tr style="background:#e8eef6"><td colspan="2" style="border:1px solid #b8c7db;padding:4px 7px;font-weight:700">Subtotal</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:700">'+fD(tT)+' MT</td><td></td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:700">Rp '+fI(tP)+'</td><td></td></tr><tr><td colspan="4" style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;color:#4e6382">VAT 11%</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">Rp '+fI(tP*0.11)+'</td><td></td></tr><tr style="background:rgba(26,115,232,.06)"><td colspan="4" style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-weight:700;font-size:12px;color:#1557b0">GRAND TOTAL</td><td style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-weight:700;font-size:12px;color:#1557b0">Rp '+fI(tPP)+'</td><td></td></tr></tbody></table>';
    h+='<div style="margin-top:18px;padding:12px 16px;background:#e8eef6;border:1px solid #b8c7db;border-radius:8px;font-size:10px;color:#2e4063"><p style="font-weight:700;font-size:11px;margin:0 0 6px;color:#1a2744">Terms & Conditions</p><table style="font-size:10px;line-height:1.6;border:none;width:100%"><tr><td style="padding:1px 0;vertical-align:top;width:4px;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none"><strong>Franco:</strong> '+esc(I.tujuan)+'</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">All prices exclude VAT</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none"><strong>Payment Terms:</strong> '+esc(I.payTerms)+'</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">Prices are subject to change without prior notice</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">Product availability and stock must be confirmed at the time of order</td></tr></table></div><div style="margin-top:32px;display:flex;justify-content:space-between"><div style="text-align:center;width:180px"><div style="border-top:1px solid #b8c7db;padding-top:5px;font-size:10px;color:#4e6382">Authorized Signature</div></div><div style="text-align:center;width:180px"><div style="border-top:1px solid #b8c7db;padding-top:5px;font-size:10px;color:#4e6382">Customer Approval</div></div></div></div>';
    return h;
}

function renderDomesticPDFs(today){
    var a=dAll(),R=a.R,tQ=a.tQ,tP=a.tP,tM=a.tM;
    var h="";
    h+='<div id="dpArea" style="display:none;padding:16px;background:#fff;color:#1a2744;font-family:DM Sans,sans-serif;font-size:10px"><h2 style="margin:0 0 2px;font-size:14px;color:#1a2744">Domestic Costing \u2014 '+(esc(D.customer)||"Project")+'</h2><p style="color:#4e6382;font-size:9px;margin-bottom:8px">'+today+' \u2022 WHT: '+(D.whtRate*100)+'%'+(D.trkFrom||D.trkTo?' \u2022 Route: '+(esc(D.trkFrom)||"-")+' \u2192 '+(esc(D.trkTo)||"-"):'')+'</p><table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr style="background:#e8eef6"><th style="border:1px solid #b8c7db;padding:3px;text-align:left;color:#4e6382">No</th><th style="border:1px solid #b8c7db;padding:3px;text-align:left;color:#4e6382">Item</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">QTY(KG)</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Buy Price</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">WHT</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Total Buy</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Truck</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Add Cost</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Margin</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#1a73e8;font-weight:700">Sell Price</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Margin Tot</th><th style="border:1px solid #b8c7db;padding:3px;text-align:right;color:#4e6382">Project Tot</th></tr></thead><tbody>';
    R.forEach(function(r,i){var it=r.item,c=r.c;if(!it.buyPrice||!it.qtyKg)return;h+='<tr><td style="border:1px solid #b8c7db;padding:2px 3px">'+(i+1)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px">'+esc(it.name)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.q)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.bp)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fD(c.wh,1)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.tb)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fD(c.tk,1)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.ac)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.mg)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right;font-weight:700;color:#1a73e8">'+fI(c.sell)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.tM)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(c.tP)+'</td></tr>'});
    h+='<tr style="background:#e8eef6;font-weight:700"><td colspan="2" style="border:1px solid #b8c7db;padding:2px 3px">TOTAL</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(tQ)+'</td><td colspan="7"></td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(tM)+'</td><td style="border:1px solid #b8c7db;padding:2px 3px;text-align:right">'+fI(tP)+'</td></tr></tbody></table></div>';
    h+='<div id="dqArea" style="display:none;padding:28px 34px;background:#fff;color:#1a2744;font-family:DM Sans,sans-serif;font-size:11px;line-height:1.5"><div style="margin-bottom:22px;border-bottom:2px solid #1a73e8;padding-bottom:14px"><h1 style="font-size:18px;font-weight:700;color:#1a2744;margin:0 0 3px">QUOTATION</h1><p style="font-size:10px;color:#4e6382;margin:0">Date: '+today+'</p></div><div style="margin-bottom:16px"><p style="font-size:10px;color:#7b8fa8;margin:0 0 2px">Customer:</p><p style="font-size:13px;font-weight:700;margin:0;color:#1a2744">'+(esc(D.customer)||"[Customer Name]")+'</p></div><table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:16px"><thead><tr style="background:#e8eef6"><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">No</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">Item Description</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Qty (KG)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Unit Price (IDR/kg)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-size:9px;color:#4e6382">Amount (IDR)</th><th style="border:1px solid #b8c7db;padding:5px 7px;text-align:left;font-size:9px;color:#4e6382">Remarks</th></tr></thead><tbody>';
    var qn=0;R.forEach(function(r){var it=r.item,c=r.c;if(!it.buyPrice||!it.qtyKg)return;qn++;h+='<tr><td style="border:1px solid #b8c7db;padding:4px 7px">'+qn+'</td><td style="border:1px solid #b8c7db;padding:4px 7px">'+esc(it.name)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">'+fI(c.q)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:600">Rp '+fI(c.sell)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">Rp '+fI(c.tP)+'</td><td style="border:1px solid #b8c7db;padding:4px 7px;font-size:9px;color:#4e6382">'+(esc(it.remark)||"")+'</td></tr>'});
    h+='<tr style="background:#e8eef6"><td colspan="2" style="border:1px solid #b8c7db;padding:4px 7px;font-weight:700">Subtotal</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:700">'+fI(tQ)+' KG</td><td></td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;font-weight:700">Rp '+fI(tP)+'</td><td></td></tr><tr><td colspan="4" style="border:1px solid #b8c7db;padding:4px 7px;text-align:right;color:#4e6382">VAT 11%</td><td style="border:1px solid #b8c7db;padding:4px 7px;text-align:right">Rp '+fI(tP*0.11)+'</td><td></td></tr><tr style="background:rgba(26,115,232,.06)"><td colspan="4" style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-weight:700;font-size:12px;color:#1557b0">GRAND TOTAL</td><td style="border:1px solid #b8c7db;padding:5px 7px;text-align:right;font-weight:700;font-size:12px;color:#1557b0">Rp '+fI(Math.round(tP*1.11))+'</td><td></td></tr></tbody></table>';
    h+='<div style="margin-top:18px;padding:12px 16px;background:#e8eef6;border:1px solid #b8c7db;border-radius:8px;font-size:10px;color:#2e4063"><p style="font-weight:700;font-size:11px;margin:0 0 6px;color:#1a2744">Terms & Conditions</p><table style="font-size:10px;line-height:1.6;border:none;width:100%"><tr><td style="padding:1px 0;vertical-align:top;width:4px;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none"><strong>Franco:</strong> '+(esc(D.trkTo)||"TBD")+'</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">All prices exclude VAT</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none"><strong>Payment Terms:</strong> '+esc(D.payTerms)+'</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">Prices are subject to change without prior notice</td></tr><tr><td style="padding:1px 0;vertical-align:top;border:none">\u2022</td><td style="padding:1px 0 1px 6px;border:none">Product availability and stock must be confirmed at the time of order</td></tr></table></div><div style="margin-top:32px;display:flex;justify-content:space-between"><div style="text-align:center;width:180px"><div style="border-top:1px solid #b8c7db;padding-top:5px;font-size:10px;color:#4e6382">Authorized Signature</div></div><div style="text-align:center;width:180px"><div style="border-top:1px solid #b8c7db;padding-top:5px;font-size:10px;color:#4e6382">Customer Approval</div></div></div></div>';
    return h;
}

</script>
</body>
</html>