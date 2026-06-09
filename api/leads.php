<?php
// Consultation de la boîte à leads d'un client : GET ?client=xxx&cle=SECRET
// Utilisé par admin.html (tableau + export CSV).
header('Content-Type: application/json; charset=utf-8');

$clients = require __DIR__ . '/config.php';
$client = preg_replace('/[^a-z0-9-]/i', '', $_GET['client'] ?? '');
$cle = $_GET['cle'] ?? '';

if (!isset($clients[$client]) || !hash_equals($clients[$client], $cle)) {
  http_response_code(403);
  echo json_encode(['erreur' => 'Accès refusé']);
  exit;
}

$file = __DIR__ . "/data/$client.jsonl";
$leads = [];
if (is_file($file)) {
  foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    $l = json_decode($line, true);
    if ($l) $leads[] = $l;
  }
}
echo json_encode(['client' => $client, 'total' => count($leads), 'leads' => array_reverse($leads)], JSON_UNESCAPED_UNICODE);
