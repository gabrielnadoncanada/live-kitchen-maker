<?php
// Réception d'un lead depuis le configurateur (POST JSON).
// Stockage en JSON Lines par client : api/data/{client}.jsonl
// + notification courriel optionnelle au cuisiniste.

header('Access-Control-Allow-Origin: *'); // le widget peut être embarqué sur le site du client
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['erreur' => 'POST requis']);
  exit;
}

$raw = file_get_contents('php://input');
$lead = json_decode($raw, true);
if (!is_array($lead) || empty($lead['client']) || empty($lead['contact']['courriel'])) {
  http_response_code(400);
  echo json_encode(['erreur' => 'Lead invalide']);
  exit;
}

$clients = require __DIR__ . '/config.php';
$client = preg_replace('/[^a-z0-9-]/i', '', $lead['client']);
if (!isset($clients[$client])) {
  http_response_code(404);
  echo json_encode(['erreur' => 'Client inconnu']);
  exit;
}

$lead['recu'] = date('c');
$lead['ip'] = $_SERVER['REMOTE_ADDR'] ?? '';

$dir = __DIR__ . '/data';
if (!is_dir($dir)) {
  mkdir($dir, 0750, true);
}
$ok = file_put_contents(
  "$dir/$client.jsonl",
  json_encode($lead, JSON_UNESCAPED_UNICODE) . "\n",
  FILE_APPEND | LOCK_EX
);

if ($ok === false) {
  http_response_code(500);
  echo json_encode(['erreur' => 'Écriture impossible']);
  exit;
}

// Notification courriel au cuisiniste (best-effort : l'échec n'invalide pas le lead).
// Renseigner l'adresse de destination par client ici ou dans config.php au déploiement.
$notify = getenv('LEAD_NOTIFY_' . strtoupper(str_replace('-', '_', $client)));
if ($notify) {
  $c = $lead['contact'];
  $total = $lead['devis']['total'] ?? 0;
  $sujet = '=?UTF-8?B?' . base64_encode("Nouveau lead cuisine — {$c['nom']} (" . number_format($total, 0, ',', ' ') . ' $)') . '?=';
  $corps = "Nouveau lead via le configurateur 3D\n\n"
    . "Nom : {$c['nom']}\nCourriel : {$c['courriel']}\nTéléphone : " . ($c['telephone'] ?? '') . "\n"
    . "Code postal : " . ($c['codePostal'] ?? '') . "\nHorizon : " . ($c['horizon'] ?? '') . "\n"
    . "Budget configuré : " . number_format($total, 0, ',', ' ') . " $\n";
  @mail($notify, $sujet, $corps, "Content-Type: text/plain; charset=utf-8\r\n");
}

echo json_encode(['ok' => true]);
