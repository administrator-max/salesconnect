<?php
/** Gemini multimodal OCR for SCOT — extract shipment fields from a document. */

const SCOT_OCR_FIELD_KEYS = ['cargo_type','consignee','project_name','product','quantity_mt',
    'bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route',
    'etd','eta','shipment_type','vendor_trucking','warehouse_location','pib_billing','remarks','year'];

const SCOT_OCR_SYSTEM_PROMPT =
"You extract shipment data from logistics documents (Ocean Bill of Lading, PIB/customs declaration, Surat Jalan/delivery note, invoices).\n"
."Return ONLY a JSON object, no prose, no markdown fences, with exactly this shape:\n"
."{\"fields\": { ... }, \"confidence\": { ... }}\n"
."\"fields\" may contain only these keys (omit any you cannot find - do not guess):\n"
."  cargo_type Import or Domestic; consignee; project_name; product; quantity_mt (metric tons, number only);\n"
."  bl_number; shipping_line; vessel_name; voyage_number (strip leading V.); pol; pod;\n"
."  shipment_route Direct or Transit; etd (YYYY-MM-DD); eta (YYYY-MM-DD); shipment_type Container or Breakbulk;\n"
."  vendor_trucking; warehouse_location; pib_billing (YYYY-MM-DD); remarks; year (4-digit number).\n"
."\"confidence\" maps each field you returned to a number 0..1. Dates MUST be YYYY-MM-DD. Numbers MUST be plain.";

const SCOT_GEMINI_MAX_BYTES = 12582912; // 12 MB inline cap

function scot_gemini_strip_json(string $s): string {
    if ($s === '') return '{}';
    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $s, $m)) $s = $m[1];
    if (preg_match('/\{[\s\S]*\}/', $s, $m2)) return $m2[0];
    return '{}';
}

function scot_gemini_filter(array $obj): array {
    $fields = [];
    $src = (isset($obj['fields']) && is_array($obj['fields'])) ? $obj['fields'] : [];
    foreach (SCOT_OCR_FIELD_KEYS as $k) {
        if (isset($src[$k]) && $src[$k] !== '' && $src[$k] !== null) $fields[$k] = $src[$k];
    }
    $confidence = [];
    $csrc = (isset($obj['confidence']) && is_array($obj['confidence'])) ? $obj['confidence'] : [];
    foreach (array_keys($fields) as $k) {
        $c = is_numeric($csrc[$k] ?? null) ? (float)$csrc[$k] : null;
        $confidence[$k] = ($c === null) ? 0.5 : max(0.0, min(1.0, $c));
    }
    return ['fields' => $fields, 'confidence' => $confidence];
}

function scot_gemini_ocr(string $bytes, string $mime, string $name, array $cfg): array {
    $key = $cfg['gemini_api_key'] ?? '';
    if ($key === '') return ['status' => 'error', 'error' => 'OCR not configured'];
    if (strlen($bytes) > SCOT_GEMINI_MAX_BYTES) {
        return ['status' => 'error', 'error' => 'File too large for inline Gemini (>12MB)'];
    }
    $model = $cfg['gemini_model'] ?? 'gemini-2.5-flash';
    $isPdf = preg_match('/pdf/i', $mime) || preg_match('/\.pdf$/i', $name);
    $inlineMime = $isPdf ? 'application/pdf'
        : (preg_match('/png/i', $mime) ? 'image/png'
        : (preg_match('/webp/i', $mime) ? 'image/webp'
        : (preg_match('/tif/i', $mime) ? 'image/tiff' : 'image/jpeg')));

    $body = ['contents' => [['parts' => [
        ['text' => SCOT_OCR_SYSTEM_PROMPT . "\n\nRead the attached document and extract the fields."],
        ['inline_data' => ['mime_type' => $inlineMime, 'data' => base64_encode($bytes)]],
    ]]], 'generationConfig' => ['temperature' => 0, 'responseMimeType' => 'application/json']];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
         . rawurlencode($model) . ':generateContent?key=' . urlencode($key);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 60,
    ]);
    $out  = curl_exec ($ch);
    if ($out === false) { $e = curl_error($ch); curl_close($ch); return ['status'=>'error','error'=>'cURL: '.$e]; }
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300) return ['status'=>'error','error'=>'Gemini API '.$code.': '.substr($out,0,300)];

    $data = json_decode($out, true);
    $txt = '';
    foreach ($data['candidates'][0]['content']['parts'] ?? [] as $p) { if (!empty($p['text'])) $txt .= $p['text']; }
    $parsed = scot_gemini_filter(json_decode(scot_gemini_strip_json($txt), true) ?: []);
    return ['status'=>'done','method'=>'gemini-vision','source'=>'gemini',
            'fields'=>$parsed['fields'],'confidence'=>$parsed['confidence'],'textPreview'=>''];
}
