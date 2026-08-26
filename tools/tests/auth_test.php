<?php
/** Uji lokal alur auth OTP (dijalankan dari CLI, lalu dihapus). */
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
require_once __DIR__ . '/../../lib/tool_guard.php';

$pass = 0; $fail = 0;
function t(string $name, $got, $want) {
    global $pass, $fail;
    $ok = $got === $want;
    if ($ok) { $pass++; } else { $fail++; }
    printf("%s %-56s got=%s want=%s\n", $ok ? 'OK  ' : 'FAIL', $name,
        var_export($got, true), var_export($want, true));
}

// ── Daftar orang & hak akses ─────────────────────────────────────────────
$a = sc_access();
t('jumlah orang terdaftar', count($a['people']), 13);
t('akses cil',        count($a['access']['cil']), 8);
t('akses taskflow',   count($a['access']['taskflow']), 8);
t('akses costcore',   count($a['access']['costcore']), 11);
t('akses salespulse', count($a['access']['salespulse']), 11);
t('akses iqdash',     count($a['access']['iqdash']), 11);
t('akses scot',       count($a['access']['scot']), 12);
t('Putri TIDAK di scot', in_array('putri', $a['access']['scot'], true), false);
t('Jeany hanya di scot', sc_person_by_email('operations2@gunungprisma.com')['tools'], ['scot']);
t('Maya hanya di scot',  sc_person_by_email('maya.ristiana@gunungprisma.com')['tools'], ['scot']);
t('Putri: 3 dashboard',  sc_person_by_email('putri.aulia@gunungprisma.com')['tools'],
                         ['costcore', 'salespulse', 'iqdash']);
t('David: 6 dashboard',  count(sc_person_by_email('davidadi.nugroho@gunungprisma.com')['tools']), 6);
t('Liwa: SEMUA dashboard', sc_person_by_email('liwa.s@gunungprisma.com')['tools'],
                           array_keys($a['access']));
t('Liwa bukan admin', !empty(sc_person_by_email('liwa.s@gunungprisma.com')['admin']), false);
t('email besar-kecil',   sc_person_by_email('  JERI@GunungPrisma.com ')['name'], 'Ko Jeri');
t('email asing ditolak', sc_person_by_email('orang.luar@example.com'), null);
t('Aldi admin',   !empty(sc_person_by_email('aldi.pratantio@gunungcapital.com')['admin']), true);
t('Trian bukan admin', !empty(sc_person_by_email('komangtrian.mp@gunungcapital.com')['admin']), false);

// Setiap kunci di 'access' harus ada di 'people' (salah ketik = akses hilang diam-diam).
$unknown = [];
foreach ($a['access'] as $tool => $keys) {
    foreach ($keys as $k) {
        $found = false;
        foreach ($a['people'] as $p) if ($p['key'] === $k) { $found = true; break; }
        if (!$found) $unknown[] = "$tool:$k";
    }
}
t('tidak ada kunci orang yang salah ketik', $unknown, []);
t('semua modul punya kartu', array_diff(array_keys($a['access']), array_keys($a['tools'])), []);

// ── Alur OTP ─────────────────────────────────────────────────────────────
$email = 'ridwan.abdillah@gunungcapital.com';
sc_otp_clear($email);
t('verifikasi tanpa kode aktif', sc_otp_verify($email, '123456')['ok'], false);

$code = '654321';
sc_otp_write($email, ['hash' => password_hash($code, PASSWORD_DEFAULT),
                      'exp' => time() + 600, 'attempts' => 0, 'created' => time()]);
t('kode salah ditolak', sc_otp_verify($email, '000000')['ok'], false);
t('percobaan salah tercatat', (int) sc_otp_read($email)['attempts'], 1);
t('kode benar diterima', sc_otp_verify($email, $code)['ok'], true);
t('sesi terbentuk', sc_current_user(), $email);
t('sesi punya nama', sc_user()['name'], 'Ridwan');
t('kode hangus sesudah dipakai', sc_otp_read($email), null);
t('boleh buka iqdash', sc_user_can('iqdash'), true);
t('boleh buka cil',    sc_user_can('cil'), true);

// Jeany: hanya SCOT.
sc_logout();
$jeany = sc_person_by_email('operations2@gunungprisma.com');
sc_start_session_for($jeany, 'otp');
t('Jeany boleh scot',        sc_user_can('scot'), true);
t('Jeany tidak boleh iqdash', sc_user_can('iqdash'), false);
t('Jeany tidak boleh cil',    sc_user_can('cil'), false);
sc_logout();
t('sesudah logout tidak ada user', sc_current_user(), null);
t('tanpa sesi tidak boleh apa pun', sc_user_can('scot'), false);

// Kode kadaluarsa & kunci setelah 5 kali salah.
sc_otp_write($email, ['hash' => password_hash('111111', PASSWORD_DEFAULT),
                      'exp' => time() - 1, 'attempts' => 0, 'created' => time() - 700]);
t('kode kadaluarsa ditolak', sc_otp_verify($email, '111111')['ok'], false);

sc_otp_write($email, ['hash' => password_hash('222222', PASSWORD_DEFAULT),
                      'exp' => time() + 600, 'attempts' => SC_OTP_MAX_ATTEMPTS, 'created' => time()]);
$r = sc_otp_verify($email, '222222');
t('kode terkunci setelah 5x salah', $r['ok'], false);
t('kode terkunci ikut dihapus', sc_otp_read($email), null);

// ── Hak akses dibaca ulang tiap permintaan ───────────────────────────────
// Inti aturannya: salinan hak akses yang menempel di sesi TIDAK PERNAH
// dipercaya. Diuji dengan cara merusak salinan itu, lalu memastikan jawabannya
// tetap mengikuti lib/access.php — persis yang terjadi kalau access.php diubah
// sementara sesi seseorang masih berjalan.
sc_logout();
sc_start_session_for($jeany, 'otp');          // Jeany: hanya SCOT

sc_session_start();
$_SESSION['sc_user']['tools'] = ['iqdash', 'cil'];      // seolah dulu ia berhak
t('hak lama di sesi diabaikan (iqdash)', sc_user_can('iqdash'), false);
t('hak lama di sesi diabaikan (cil)',    sc_user_can('cil'), false);
t('hak asli tetap berlaku (scot)',       sc_user_can('scot'), true);
t('sesi ikut dikoreksi',                 sc_user()['tools'], ['scot']);

$_SESSION['sc_user']['tools'] = [];                     // seolah haknya dikosongkan
t('hak yang ada dipulihkan dari berkas', sc_user_can('scot'), true);

$_SESSION['sc_user']['admin'] = true;                   // seolah ia mengangkat diri jadi admin
t('status admin ikut disegarkan', sc_user()['admin'], false);

$_SESSION['sc_user']['name'] = 'Bukan Jeany';
t('nama ikut disegarkan', sc_user()['name'], 'Jeany');

// Orang yang dihapus dari access.php: sesinya ditutup pada permintaan berikutnya.
$_SESSION['sc_user']['email'] = 'sudah.dihapus@gunungprisma.com';
t('akun dihapus -> sesi ditutup', sc_user(), null);
t('benar-benar keluar',           sc_current_user(), null);

// Pintu darurat: sumbernya config.php['users'], bukan access.php.
$cfgUsers = array_keys(sc_config()['users'] ?? []);
if ($cfgUsers) {
    sc_logout();
    sc_start_session_for(['key' => $cfgUsers[0], 'name' => $cfgUsers[0], 'email' => $cfgUsers[0],
                          'admin' => true, 'tools' => []], 'password');
    t('pintu darurat: dapat semua modul', sc_user()['tools'], array_keys($a['access']));

    sc_session_start();
    $_SESSION['sc_user']['key'] = 'akun-yang-sudah-dihapus';
    t('akun darurat dihapus -> sesi ditutup', sc_user(), null);
} else {
    echo "LEWAT config.php['users'] kosong — dua uji pintu darurat dilewati\n";
}
sc_logout();

// ── Penyimpanan ──────────────────────────────────────────────────────────
t('direktori auth bisa ditulis', is_writable(sc_auth_dir()), true);

echo "\n$pass lulus, $fail gagal\n";
exit($fail ? 1 : 0);
