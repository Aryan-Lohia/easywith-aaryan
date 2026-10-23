<?php
/**
 * Form relay: receives form submissions from the website, filters spam,
 * signs the payload with your secret and forwards it to your webhook.
 * Settings come from config.php, which build.mjs generates from site.config.js.
 *
 * Webhook request headers:
 *   Content-Type:         application/json
 *   X-Webhook-Event:      form.<form-name>         e.g. form.implementation-application
 *   X-Webhook-Timestamp:  unix seconds
 *   X-Webhook-Signature:  sha256=HMAC_SHA256(secret, "<timestamp>.<raw body>")
 *   X-Webhook-Secret:     <secret>   (for tools that can only compare a header value)
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$config = require __DIR__ . '/config.php';

function respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

// Same-site requests only.
$origin = rtrim($_SERVER['HTTP_ORIGIN'] ?? '', '/');
$host = ($_SERVER['HTTPS'] ?? '') === 'on' ? 'https://' : 'http://';
$self = $host . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin !== '' && $origin !== $self && !in_array($origin, $config['allowedOrigins'], true)) {
    respond(403, ['ok' => false, 'error' => 'origin_not_allowed']);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 64000) respond(413, ['ok' => false, 'error' => 'too_large']);
$in = json_decode($raw, true);
if (!is_array($in) || !is_array($in['data'] ?? null)) respond(400, ['ok' => false, 'error' => 'bad_request']);

// Spam: honeypot field filled, or the form was submitted inhumanly fast. Pretend success.
if (trim((string)($in['data']['website'] ?? '')) !== '' || (int)($in['elapsedMs'] ?? 99999) < 2500) {
    respond(200, ['ok' => true]);
}

// Simple rate limit: 8 submissions per IP per 10 minutes.
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$bucket = sys_get_temp_dir() . '/ewa_rl_' . hash('sha256', $ip);
$now = time();
$hits = array_filter(
    is_file($bucket) ? (json_decode((string)file_get_contents($bucket), true) ?: []) : [],
    fn($t) => $t > $now - 600
);
if (count($hits) >= 8) respond(429, ['ok' => false, 'error' => 'rate_limited']);
$hits[] = $now;
@file_put_contents($bucket, json_encode(array_values($hits)), LOCK_EX);

// Clean the fields.
$clean = static fn($v, int $max) => mb_substr(trim(strip_tags((string)$v)), 0, $max);
$form = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($in['form'] ?? 'form'))) ?: 'form';
$data = [];
foreach (array_slice($in['data'], 0, 40, true) as $k => $v) {
    $key = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$k);
    if ($key === '' || $key === 'website') continue;
    $data[$key] = $clean(is_array($v) ? implode(', ', $v) : $v, 5000);
}
$attr = [];
foreach ((array)($in['attribution'] ?? []) as $k => $v) {
    $attr[preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$k)] = $clean($v, 500);
}

$payload = [
    'event'       => 'form_submission',
    'form'        => $form,
    'submittedAt' => gmdate('c'),
    'site'        => $config['siteUrl'],
    'page'        => $clean($in['page'] ?? '', 300),
    'data'        => $data,
    'attribution' => $attr,
    'meta'        => [
        'ip'        => $ip,
        'userAgent' => $clean($_SERVER['HTTP_USER_AGENT'] ?? '', 400),
    ],
];
$body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$delivered = false;

if ($config['webhookUrl'] !== '') {
    $ts = (string)time();
    $headers = [
        'Content-Type: application/json',
        'User-Agent: EasyWithAaryan-FormRelay/1.0',
        'X-Webhook-Event: form.' . $form,
        'X-Webhook-Timestamp: ' . $ts,
    ];
    if ($config['webhookSecret'] !== '') {
        $headers[] = 'X-Webhook-Signature: sha256=' . hash_hmac('sha256', $ts . '.' . $body, $config['webhookSecret']);
        $headers[] = 'X-Webhook-Secret: ' . $config['webhookSecret'];
    }
    foreach ($config['extraHeaders'] as $name => $value) {
        $headers[] = preg_replace('/[^A-Za-z0-9\-]/', '', (string)$name) . ': ' . str_replace(["\r", "\n"], '', (string)$value);
    }
    $ch = curl_init($config['webhookUrl']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 12,
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $delivered = $status >= 200 && $status < 300;
}

if ($config['notifyEmail'] !== '') {
    $lines = [];
    foreach ($data as $k => $v) $lines[] = ucfirst(str_replace(['_', '-'], ' ', $k)) . ": " . $v;
    $sent = @mail(
        $config['notifyEmail'],
        '[' . $config['fromName'] . '] New ' . str_replace('-', ' ', $form),
        implode("\n", $lines) . "\n\nPage: " . $payload['page'] . "\nTime: " . $payload['submittedAt'],
        'Content-Type: text/plain; charset=utf-8'
    );
    $delivered = $delivered || $sent;
}

respond($delivered ? 200 : 502, ['ok' => $delivered, 'error' => $delivered ? null : 'not_delivered']);
