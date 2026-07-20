<?php
/**
 * Minimal Google Sheets (v4) client for shared hosting.
 * - Service-account auth via JWT signed with openssl (no google/apiclient).
 * - Short-TTL file cache on reads; every write clears it.
 * - High-level table helpers (header-aware rows, append/update/delete by id).
 */
require_once __DIR__ . '/helpers.php';

class GoogleSheets {

    private $email;
    private $privateKey;
    private $cacheDir;
    private $cacheTtl;
    private $tokenFile;

    public function __construct($serviceAccountPath = null) {
        $cfg  = sc_config();
        $path = $serviceAccountPath ?: $cfg['service_account'];
        if (!is_file($path)) {
            throw new Exception('Service account key not found. Expected at: ' . $path);
        }
        $sa = json_decode((string) file_get_contents($path), true);
        if (!$sa || empty($sa['client_email']) || empty($sa['private_key'])) {
            throw new Exception('Invalid service account JSON (missing client_email/private_key).');
        }
        $this->email      = $sa['client_email'];
        $this->privateKey = $sa['private_key'];
        $this->cacheDir   = rtrim($cfg['cache_dir'], '/');
        $this->cacheTtl   = (int) $cfg['cache_ttl'];
        $this->tokenFile  = $this->cacheDir . '/token.json';
        if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir, 0700, true);
    }

    // ── OAuth: service-account JWT -> access token (file-cached) ───────────
    private function accessToken() {
        if (is_file($this->tokenFile)) {
            $t = json_decode((string) file_get_contents($this->tokenFile), true);
            if ($t && !empty($t['access_token']) && ($t['exp'] ?? 0) > time() + 60) {
                return $t['access_token'];
            }
        }
        $now    = time();
        $header = $this->b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claim  = $this->b64url(json_encode([
            'iss'   => $this->email,
            'scope' => 'https://www.googleapis.com/auth/spreadsheets',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'exp'   => $now + 3600,
            'iat'   => $now,
        ]));
        $input = $header . '.' . $claim;
        $sig   = '';
        if (!openssl_sign($input, $sig, $this->privateKey, OPENSSL_ALGO_SHA256)) {
            throw new Exception('Failed to sign JWT (check OpenSSL and the private key).');
        }
        $assertion = $input . '.' . $this->b64url($sig);

        $resp = $this->httpForm('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $assertion,
        ]);
        if (empty($resp['access_token'])) {
            throw new Exception('OAuth token error: ' . json_encode($resp));
        }
        $exp = $now + (int) ($resp['expires_in'] ?? 3600);
        @file_put_contents($this->tokenFile,
            json_encode(['access_token' => $resp['access_token'], 'exp' => $exp]));
        @chmod($this->tokenFile, 0600);
        return $resp['access_token'];
    }

    private function b64url($s) {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    // ── Low-level HTTP ────────────────────────────────────────────────────
    private function httpForm($url, array $fields) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($fields),
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $out = curl_exec($ch);
        if ($out === false) { $e = curl_error($ch); curl_close($ch); throw new Exception('cURL: ' . $e); }
        curl_close($ch);
        return json_decode($out, true) ?: [];
    }

    /**
     * Call the Sheets API with automatic retry on rate-limit / transient
     * errors (HTTP 429 & 503). Backoff is exponential with jitter:
     * ~1s, 2s, 4s (+0-500ms) before attempts 2, 3, 4. Only 429/503 are
     * retried - Google rejects the request BEFORE executing it on those,
     * so retrying a write is safe (no double insert). Other errors and
     * network failures throw immediately, preserving the previous behaviour.
     */
    private function api($method, $url, $body = null) {
        $payload = $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : null;
        $delays  = [1, 2, 4];                 // seconds before retries 2,3,4
        $maxAttempts = count($delays) + 1;    // 4 total
        $lastCode = 0; $lastOut = '';

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            $ch      = curl_init($url);
            $headers = ['Authorization: Bearer ' . $this->accessToken()];
            $opts    = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST  => $method,
                CURLOPT_TIMEOUT        => 25,
            ];
            if ($payload !== null) {
                $opts[CURLOPT_POSTFIELDS] = $payload;
                $headers[] = 'Content-Type: application/json';
            }
            $opts[CURLOPT_HTTPHEADER] = $headers;
            curl_setopt_array($ch, $opts);
            $out = curl_exec($ch);
            if ($out === false) { $e = curl_error($ch); curl_close($ch); throw new Exception('cURL: ' . $e); }
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $json = json_decode($out, true);

            if ($code >= 200 && $code < 300) {
                return $json ?: [];
            }

            // Retry only on rate-limit (429) or transient unavailable (503).
            if (($code === 429 || $code === 503) && $attempt < $maxAttempts) {
                $this->backoff($delays[$attempt - 1]);
                $lastCode = $code; $lastOut = $out;
                continue;
            }

            $msg = $json['error']['message'] ?? ('HTTP ' . $code . ' ' . $out);
            throw new Exception('Sheets API ' . $code . ': ' . $msg);
        }

        // Retries exhausted (still 429/503).
        $json = json_decode($lastOut, true);
        $msg  = $json['error']['message'] ?? ('HTTP ' . $lastCode . ' ' . $lastOut);
        throw new Exception('Sheets API ' . $lastCode . ' (after ' . $maxAttempts . ' attempts): ' . $msg);
    }

    /** Sleep for $seconds plus 0-500ms jitter (de-synchronise concurrent retries). */
    private function backoff($seconds) {
        $jitterUs = function_exists('random_int') ? random_int(0, 500000) : mt_rand(0, 500000);
        usleep((int) ($seconds * 1000000) + $jitterUs);
    }

    private function baseUrl($id) {
        return 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($id);
    }

    // ── Read cache ────────────────────────────────────────────────────────
    private function cacheGet($key) {
        $f = $this->cacheDir . '/rd_' . md5($key) . '.json';
        if (is_file($f) && (time() - filemtime($f) < $this->cacheTtl)) {
            return json_decode((string) file_get_contents($f), true);
        }
        return null;
    }
    private function cachePut($key, $data) {
        @file_put_contents($this->cacheDir . '/rd_' . md5($key) . '.json', json_encode($data));
    }
    public function cacheClear() {
        foreach ((array) glob($this->cacheDir . '/rd_*.json') as $f) @unlink($f);
    }

    // ── Values API ────────────────────────────────────────────────────────
    public function getValues($id, $range, $useCache = true, $unformatted = false) {
        $key = 'gv|' . $id . '|' . $range . ($unformatted ? '|u' : '');
        if ($useCache) { $c = $this->cacheGet($key); if ($c !== null) return $c; }
        $url = $this->baseUrl($id) . '/values/' . rawurlencode($range);
        if ($unformatted) $url .= '?valueRenderOption=UNFORMATTED_VALUE';
        $res  = $this->api('GET', $url);
        $vals = $res['values'] ?? [];
        if ($useCache) $this->cachePut($key, $vals);
        return $vals;
    }

    public function append($id, $tab, array $rows) {
        if (!$rows) return null;
        $url = $this->baseUrl($id) . '/values/' . rawurlencode($tab)
             . ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
        $r = $this->api('POST', $url, ['values' => $rows]);
        $this->cacheClear();
        return $r;
    }

    public function updateRange($id, $range, array $rows) {
        $url = $this->baseUrl($id) . '/values/' . rawurlencode($range) . '?valueInputOption=RAW';
        $r = $this->api('PUT', $url, ['values' => $rows]);
        $this->cacheClear();
        return $r;
    }

    public function clearValues($id, $range) {
        $url = $this->baseUrl($id) . '/values/' . rawurlencode($range) . ':clear';
        $r = $this->api('POST', $url, new stdClass());
        $this->cacheClear();
        return $r;
    }

    /** Overwrite an entire tab: clear A1:<lastCol> then write $matrix (header + rows). */
    public function replaceTable($id, $tab, array $matrix, $lastColCount = null) {
        $cols = $lastColCount ?: (count($matrix[0] ?? []) ?: 1);
        $this->clearValues($id, $tab . '!A1:' . $this->colLetterPublic($cols));
        $this->updateRange($id, $tab . '!A1', $matrix);
    }

    public function batchUpdate($id, array $requests) {
        if (!$requests) return null;
        $r = $this->api('POST', $this->baseUrl($id) . ':batchUpdate', ['requests' => $requests]);
        $this->cacheClear();
        return $r;
    }

    /** Map of tab title => numeric sheetId. */
    public function sheetMeta($id) {
        $key = 'meta|' . $id;
        $c = $this->cacheGet($key); if ($c !== null) return $c;
        $res = $this->api('GET', $this->baseUrl($id) . '?fields=sheets.properties(sheetId,title)');
        $map = [];
        foreach ($res['sheets'] ?? [] as $s) {
            $map[$s['properties']['title']] = $s['properties']['sheetId'];
        }
        $this->cachePut($key, $map);
        return $map;
    }

    // ── High-level table helpers ──────────────────────────────────────────

    /** Header row (row 1) of a tab. */
    public function headers($id, $tab) {
        $vals = $this->getValues($id, $tab . '!1:1', true);
        return $vals[0] ?? [];
    }

    /**
     * Read a whole tab as associative rows.
     * Each row includes '_row' = its 1-based sheet row number.
     */
    public function table($id, $tab, $useCache = true) {
        $values  = $this->getValues($id, $tab, $useCache);
        $headers = $values[0] ?? [];
        $rows    = [];
        $n = count($values);
        for ($i = 1; $i < $n; $i++) {
            $raw   = $values[$i];
            $assoc = ['_row' => $i + 1];
            foreach ($headers as $c => $h) {
                $assoc[$h] = $raw[$c] ?? '';
            }
            $rows[] = $assoc;
        }
        return ['headers' => $headers, 'rows' => $rows];
    }

    private function assocToRow($id, $tab, array $assoc) {
        $headers = $this->headers($id, $tab);
        $row = [];
        foreach ($headers as $h) $row[] = array_key_exists($h, $assoc) ? $assoc[$h] : '';
        return $row;
    }

    public function appendAssoc($id, $tab, array $assoc) {
        return $this->append($id, $tab, [$this->assocToRow($id, $tab, $assoc)]);
    }

    public function appendAssocBulk($id, $tab, array $assocList) {
        if (!$assocList) return null;
        $headers = $this->headers($id, $tab);
        $rows = [];
        foreach ($assocList as $a) {
            $row = [];
            foreach ($headers as $h) $row[] = array_key_exists($h, $a) ? $a[$h] : '';
            $rows[] = $row;
        }
        return $this->append($id, $tab, $rows);
    }

    /** Overwrite a single sheet row (1-based) with associative values. */
    public function updateAssoc($id, $tab, $sheetRow, array $assoc) {
        $headers = $this->headers($id, $tab);
        $row = [];
        foreach ($headers as $h) $row[] = array_key_exists($h, $assoc) ? $assoc[$h] : '';
        $range = $tab . '!A' . $sheetRow . ':' . $this->colLetter(count($headers)) . $sheetRow;
        return $this->updateRange($id, $range, [$row]);
    }

    /** Physically delete rows by 1-based sheet row numbers (bottom-up). */
    public function deleteRows($id, $tab, array $sheetRows) {
        if (!$sheetRows) return null;
        $sheetId = $this->sheetMeta($id)[$tab] ?? null;
        if ($sheetId === null) throw new Exception('Tab not found: ' . $tab);
        rsort($sheetRows, SORT_NUMERIC);
        $reqs = [];
        foreach ($sheetRows as $r) {
            $reqs[] = ['deleteDimension' => ['range' => [
                'sheetId'    => $sheetId,
                'dimension'  => 'ROWS',
                'startIndex' => $r - 1,
                'endIndex'   => $r,
            ]]];
        }
        return $this->batchUpdate($id, $reqs);
    }

    private function colLetter($n) {
        $s = '';
        while ($n > 0) { $m = ($n - 1) % 26; $s = chr(65 + $m) . $s; $n = intdiv($n - 1, 26); }
        return $s !== '' ? $s : 'A';
    }

    public function colLetterPublic($n) { return $this->colLetter($n); }
}
