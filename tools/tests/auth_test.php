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
t('jumlah orang terdaftar', count($a['people']), 15);
t('akses cil',        count($a['access']['cil']), 9);
t('akses taskflow',   count($a['access']['taskflow']), 9);
t('akses costcore',   count($a['access']['costcore']), 12);
t('akses salespulse', count($a['access']['salespulse']), 12);
t('akses iqdash',     count($a['access']['iqdash']), 14);
t('akses scot',       count($a['access']['scot']), 13);
t('Putri TIDAK di scot', in_array('putri', $a['access']['scot'], true), false);
t('Jeany: iqdash + scot', sc_person_by_email('operations2@gunungprisma.com')['tools'],
                          ['iqdash', 'scot']);
t('Maya hanya di scot',  sc_person_by_email('maya.ristiana@gunungprisma.com')['tools'], ['scot']);
t('Putri: 3 dashboard',  sc_person_by_email('putri.aulia@gunungprisma.com')['tools'],
                         ['costcore', 'salespulse', 'iqdash']);
t('David: 6 dashboard',  count(sc_person_by_email('davidadi.nugroho@gunungprisma.com')['tools']), 6);
t('Liwa: SEMUA dashboard', sc_person_by_email('liwa.s@gunungprisma.com')['tools'],
                           array_keys($a['access']));
t('Liwa bukan admin', !empty(sc_person_by_email('liwa.s@gunungprisma.com')['admin']), false);
t('Herdiani hanya di iqdash', sc_person_by_email('herdiani@gunungprisma.com')['tools'], ['iqdash']);
t('Herdiani bukan admin', !empty(sc_person_by_email('herdiani@gunungprisma.com')['admin']), false);
t('Hendra: SEMUA dashboard', sc_person_by_email('hendra.satria@gunungprisma.com')['tools'],
                             array_keys($a['access']));
t('Hendra bukan admin', !empty(sc_person_by_email('hendra.satria@gunungprisma.com')['admin']), false);
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

// Jeany: SCOT + IQ Dash, bukan yang lain.
sc_logout();
$jeany = sc_person_by_email('operations2@gunungprisma.com');
sc_start_session_for($jeany, 'otp');
t('Jeany boleh scot',           sc_user_can('scot'), true);
t('Jeany boleh iqdash',         sc_user_can('iqdash'), true);
t('Jeany tidak boleh cil',      sc_user_can('cil'), false);
t('Jeany tidak boleh costcore', sc_user_can('costcore'), false);
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
// Dipakai Maya, bukan Jeany: uji ini butuh orang yang hanya punya SATU modul,
// supaya modul lain jadi kontrol yang jelas. Jeany kini punya dua.
sc_logout();
$maya = sc_person_by_email('maya.ristiana@gunungprisma.com');
sc_start_session_for($maya, 'otp');           // Maya: hanya SCOT

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

$_SESSION['sc_user']['name'] = 'Bukan Maya';
t('nama ikut disegarkan', sc_user()['name'], 'Maya');

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

// ── Masa berlaku sesi ────────────────────────────────────────────────────
// Aturannya: berlaku sekian jam sejak MASUK, dan tidak digeser oleh aktivitas.
// Dua sifat itu diuji terpisah karena keduanya mudah rusak sendiri-sendiri.
t('umur sesi default 24 jam', sc_session_hours(), 24);
t('umur sesi dalam detik',    sc_session_ttl(), 24 * 3600);

sc_logout();
sc_start_session_for($maya, 'otp');
t('sesi baru langsung sah', sc_current_user(), 'maya.ristiana@gunungprisma.com');

// Menganggur lama TIDAK memutus sesi — inti dari keluhan "buka lagi siang,
// disuruh masuk lagi". Yang menentukan hanya waktu login.
sc_session_start();
$_SESSION['sc_last']     = time() - 6 * 3600;      // 6 jam tidak menyentuh apa pun
$_SESSION['sc_login_at'] = time() - 6 * 3600;      // login 6 jam lalu
t('6 jam menganggur tetap sah', sc_current_user(), 'maya.ristiana@gunungprisma.com');

// Lewat batas: harus keluar.
$_SESSION['sc_login_at'] = time() - (sc_session_ttl() + 60);
t('lewat 24 jam -> sesi berakhir', sc_user(), null);
t('benar-benar keluar sesudah kedaluwarsa', sc_current_user(), null);

// Aktivitas TIDAK memperpanjang: sesi yang hampir habis tetap habis walau
// barusan dipakai. Kalau ini gagal, "sekali sehari" diam-diam jadi
// "sekali selamanya" untuk orang yang membuka dashboard tiap hari.
sc_logout();
sc_start_session_for($maya, 'otp');
sc_session_start();
$_SESSION['sc_login_at'] = time() - (sc_session_ttl() - 30);   // sisa 30 detik
t('hampir habis masih sah', sc_current_user(), 'maya.ristiana@gunungprisma.com');
$_SESSION['sc_login_at'] = time() - (sc_session_ttl() - 30) - 60;
t('aktivitas tidak memperpanjang', sc_user(), null);

t('email yang diingat kosong tanpa cookie', sc_remembered_email(), '');
sc_logout();

// ── Penyimpanan ──────────────────────────────────────────────────────────
t('direktori auth bisa ditulis', is_writable(sc_auth_dir()), true);
t('direktori sesi bisa ditulis', sc_session_dir() !== '', true);

echo "\n$pass lulus, $fail gagal\n";
exit($fail ? 1 : 0);
