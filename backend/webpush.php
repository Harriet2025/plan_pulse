<?php
declare(strict_types=1);

/**
 * Web Push for AuraGoal: sends a notification to a browser even when the site is closed.
 *
 *   - Message encryption:   RFC 8291 (aes128gcm)
 *   - Server identification: RFC 8292 (VAPID, a signed token proving the message comes from this app)
 *
 * Browsers hand each device a "subscription" (an address on Google's, Mozilla's or Apple's push service plus two
 * keys). We encrypt the message so only that device can read it, then POST it to the address.
 */

function b64u_enc(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function b64u_dec(string $text): string
{
    return (string) base64_decode(strtr($text, '-_', '+/') . str_repeat('=', (4 - strlen($text) % 4) % 4), true);
}

/** PHP on Windows cannot generate EC keys without being told where OpenSSL's config file is. */
function wp_ssl_config(): array
{
    $candidates = array_filter([
        getenv('OPENSSL_CONF') ?: null,
        dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf',
        dirname(PHP_BINARY, 2) . '/apache/conf/openssl.cnf',
    ]);
    foreach ($candidates as $file) {
        if (is_file($file)) {
            return ['config' => $file];
        }
    }
    return [];
}

function wp_new_ec_key(): OpenSSLAsymmetricKey
{
    $key = openssl_pkey_new(wp_ssl_config() + ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$key) {
        throw new RuntimeException('Cannot generate an EC key: ' . openssl_error_string());
    }
    return $key;
}

/** The 65-byte uncompressed public point (0x04 || X || Y) of an EC key. */
function wp_public_point(OpenSSLAsymmetricKey $key): string
{
    $ec = openssl_pkey_get_details($key)['ec'];
    return "\x04" . str_pad($ec['x'], 32, "\0", STR_PAD_LEFT) . str_pad($ec['y'], 32, "\0", STR_PAD_LEFT);
}

function wp_public_pem(string $point): string
{
    if (strlen($point) !== 65 || $point[0] !== "\x04") {
        throw new InvalidArgumentException('Not an uncompressed P-256 public key');
    }
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;   // SubjectPublicKeyInfo header for P-256
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** Builds a private key from its raw 32-byte value (used to check the RFC's published example). */
function wp_private_from_raw(string $d, string $point): OpenSSLAsymmetricKey
{
    $der = hex2bin('30770201010420') . $d . hex2bin('a00a06082a8648ce3d030107a144034200') . $point;
    $key = openssl_pkey_get_private("-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n");
    if (!$key) {
        throw new RuntimeException('Bad private key: ' . openssl_error_string());
    }
    return $key;
}

/**
 * Encrypts $payload for one subscription and returns the request body.
 * $salt and $senderKey are only passed by tests; normally both are fresh random values.
 */
function wp_encrypt(string $payload, string $uaPublic, string $authSecret, ?string $salt = null, ?OpenSSLAsymmetricKey $senderKey = null): string
{
    if (strlen($authSecret) !== 16) {
        throw new InvalidArgumentException('The auth secret must be 16 bytes');
    }
    if (strlen($payload) > 3800) {
        throw new InvalidArgumentException('Push payload too large');
    }
    $salt ??= random_bytes(16);
    $senderKey ??= wp_new_ec_key();
    $senderPublic = wp_public_point($senderKey);

    $uaKey = openssl_pkey_get_public(wp_public_pem($uaPublic));
    $shared = openssl_pkey_derive($uaKey, $senderKey, 32);                       // ECDH
    if ($shared === false) {
        throw new RuntimeException('ECDH failed: ' . openssl_error_string());
    }

    $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $senderPublic, $authSecret);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);

    $tag = '';
    $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);   // 0x02 marks the last (only) record
    if ($cipher === false) {
        throw new RuntimeException('Encryption failed: ' . openssl_error_string());
    }
    return $salt . pack('N', 4096) . chr(65) . $senderPublic . $cipher . $tag;
}

// ---------------------------------------------------------------
// VAPID: this app's identity, as a key pair kept in storage/vapid.json (created on first use)
// ---------------------------------------------------------------

/** @return array{private:string,public:string} private is a PEM, public is the base64url point browsers need */
function wp_vapid_keys(): array
{
    $file = dirname(__DIR__) . '/storage/vapid.json';
    if (is_file($file)) {
        $k = json_decode((string) file_get_contents($file), true);
        if (is_array($k) && isset($k['private'], $k['public'])) {
            return $k;
        }
    }
    $key = wp_new_ec_key();
    openssl_pkey_export($key, $pem, null, wp_ssl_config());
    $keys = ['private' => $pem, 'public' => b64u_enc(wp_public_point($key))];
    if (!is_dir(dirname($file)) && !mkdir(dirname($file), 0755, true) && !is_dir(dirname($file))) {
        throw new RuntimeException('Cannot create the storage folder');
    }
    file_put_contents($file, json_encode($keys), LOCK_EX);
    return $keys;
}

/** ES256 signatures are the raw 64 bytes R||S, while OpenSSL returns them wrapped in DER. */
function wp_der_to_raw(string $der): string
{
    $off = 2 + (ord($der[1]) & 0x80 ? ord($der[1]) & 0x7f : 0);
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        $len = ord($der[$off + 1]);
        $int = substr($der, $off + 2, $len);
        $parts[] = str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
        $off += 2 + $len;
    }
    return $parts[0] . $parts[1];
}

function wp_vapid_jwt(string $audience, array $vapid, string $subject, ?int $expires = null): string
{
    $head = b64u_enc(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u_enc(json_encode(['aud' => $audience, 'exp' => $expires ?? time() + 12 * 3600, 'sub' => $subject]));
    if (!openssl_sign("{$head}.{$claims}", $der, openssl_pkey_get_private($vapid['private']), OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Cannot sign the VAPID token: ' . openssl_error_string());
    }
    return "{$head}.{$claims}." . b64u_enc(wp_der_to_raw($der));
}

// ---------------------------------------------------------------
// Sending
// ---------------------------------------------------------------

/**
 * Only real push services are allowed as destinations. The address comes from the user's browser, so without this
 * an attacker could subscribe with an address inside our own network and make the server call it.
 */
function wp_endpoint_allowed(string $endpoint): bool
{
    $p = parse_url($endpoint);
    if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || isset($p['port']) && (int) $p['port'] !== 443) {
        return false;
    }
    $host = strtolower($p['host']);
    foreach (['fcm.googleapis.com', 'android.googleapis.com'] as $exact) {
        if ($host === $exact) {
            return true;
        }
    }
    foreach (['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'] as $suffix) {
        if (str_ends_with($host, $suffix)) {
            return true;
        }
    }
    return false;
}

/**
 * @param array{endpoint:string,p256dh:string,auth:string} $sub as saved from the browser (keys are base64url)
 * @return array{ok:bool,gone:bool,status:int,error:?string}
 */
function wp_send(array $sub, string $payload, string $subject, int $ttl = 3600, ?string $override = null): array
{
    // $override lets tests send to a local fake push service; it is never used in the app
    $target = $override ?? $sub['endpoint'];
    if ($override === null && !wp_endpoint_allowed($sub['endpoint'])) {
        return ['ok' => false, 'gone' => true, 'status' => 0, 'error' => 'Endpoint is not a known push service'];
    }
    try {
        $body = wp_encrypt($payload, b64u_dec($sub['p256dh']), b64u_dec($sub['auth']));
        $vapid = wp_vapid_keys();
        $parts = parse_url($sub['endpoint']);
        $jwt = wp_vapid_jwt($parts['scheme'] . '://' . $parts['host'], $vapid, $subject);
    } catch (Throwable $e) {
        return ['ok' => false, 'gone' => false, 'status' => 0, 'error' => $e->getMessage()];
    }

    $ch = curl_init($target);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/octet-stream', 'Content-Encoding: aes128gcm', "TTL: {$ttl}", 'Urgency: normal',
            "Authorization: vapid t={$jwt}, k={$vapid['public']}",
        ],
    ]);
    $caBundle = ini_get('curl.cainfo') ?: ini_get('openssl.cafile');
    if (!$caBundle) {   // XAMPP ships a bundle but does not always point PHP at it
        foreach ([dirname(PHP_BINARY, 2) . '/apache/bin/curl-ca-bundle.crt', dirname(PHP_BINARY) . '/extras/ssl/cacert.pem'] as $f) {
            if (is_file($f)) { curl_setopt($ch, CURLOPT_CAINFO, $f); break; }
        }
    }
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = $response === false ? curl_error($ch) : null;
    curl_close($ch);

    $ok = $status >= 200 && $status < 300;
    return [
        'ok'     => $ok,
        'gone'   => $status === 404 || $status === 410,   // the user removed the subscription: forget it
        'status' => $status,
        'error'  => $ok ? null : ($error ?? 'Push service answered HTTP ' . $status . ' ' . substr((string) $response, 0, 120)),
    ];
}
