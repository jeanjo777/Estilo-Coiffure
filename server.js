/* ============================================
   ESTILO COIFFURE — Proxy API Higgsfield
   Protège les clés API côté serveur
   ============================================ */

import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PORT = process.env.PORT || 3000;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_API_SECRET = process.env.HF_API_SECRET;
const HF_BASE = 'https://cloud.higgsfield.ai/api/v1';

// --- Runway API (simulateur femme) ---
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || '';
const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_MODEL = process.env.RUNWAY_MODEL || 'gen4_image';

// --- Higgsfield CDN (image upload for Runway) ---
const HIGGSFIELD_CDN_BASE = 'https://platform.higgsfield.ai';
const HF_CDN_CREDENTIALS = HF_API_KEY && HF_API_SECRET ? `${HF_API_KEY}:${HF_API_SECRET}` : '';

// --- Rate limiting & concurrency ---
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MIN || 10) * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 10);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 20);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let activeGenerations = 0;
const generationQueue = [];
const rateLimitMap = new Map();

// --- Style catalog ---
function loadStyleCatalog() {
  const p = join(__dirname, 'styles.json');
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      if (raw.femme) return raw;
      return { femme: raw };
    } catch (e) { console.error('Invalid styles.json:', e.message); }
  }
  return { femme: {} };
}

const STYLE_CATALOG = loadStyleCatalog();

function findStylePreset(styleId, gender) {
  const presets = STYLE_CATALOG[gender || 'femme'] || {};
  return presets[styleId] || null;
}

if (!HF_API_KEY || !HF_API_SECRET) {
  console.warn('AVERTISSEMENT: HF_API_KEY et HF_API_SECRET absents — simulateur homme (face-swap) désactivé');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Helpers ---

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX = 10 * 1024 * 1024; // 10 Mo max

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error('Fichier trop volumineux (max 10 Mo)'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// --- Higgsfield API ---

async function hfRequest(endpoint, body) {
  const token = Buffer.from(`${HF_API_KEY}:${HF_API_SECRET}`).toString('base64');

  const response = await fetch(`${HF_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield ${response.status}: ${text}`);
  }

  return response.json();
}

async function hfStatus(requestId) {
  const token = Buffer.from(`${HF_API_KEY}:${HF_API_SECRET}`).toString('base64');

  const response = await fetch(`${HF_BASE}/requests/${requestId}`, {
    headers: { Authorization: `Basic ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield status ${response.status}: ${text}`);
  }

  return response.json();
}

async function hfUpload(base64Data, contentType) {
  const token = Buffer.from(`${HF_API_KEY}:${HF_API_SECRET}`).toString('base64');
  const buffer = Buffer.from(base64Data, 'base64');

  const response = await fetch(`${HF_BASE}/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Authorization: `Basic ${token}`,
    },
    body: buffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Higgsfield upload ${response.status}: ${text}`);
  }

  return response.json();
}

// --- Runway helpers (simulateur femme) ---

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.length > 0) ? fwd.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
}

function assertRateLimit(ip) {
  const now = Date.now();
  const bucket = (rateLimitMap.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket[0])) / 1000));
    const err = new Error('Limite temporaire atteinte. Réessayez dans quelques minutes.');
    err.statusCode = 429;
    err.retryAfter = retryAfter;
    throw err;
  }
  bucket.push(now);
  rateLimitMap.set(ip, bucket);
}

function enqueueGeneration() {
  return new Promise((resolve, reject) => {
    if (activeGenerations < MAX_CONCURRENT) { activeGenerations++; resolve(); return; }
    if (generationQueue.length >= MAX_QUEUE) {
      reject(Object.assign(new Error("File d'attente pleine."), { statusCode: 503 }));
      return;
    }
    generationQueue.push({ resolve, reject });
  });
}

function releaseGeneration() {
  activeGenerations--;
  if (generationQueue.length > 0 && activeGenerations < MAX_CONCURRENT) {
    const next = generationQueue.shift();
    activeGenerations++;
    next.resolve();
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!match) {
    const err = new Error('Image invalide. Utilisez PNG, JPG ou WEBP.');
    err.statusCode = 400;
    throw err;
  }
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    const err = new Error('Image trop lourde. Maximum 8 Mo.');
    err.statusCode = 400;
    throw err;
  }
  return { mime, buffer };
}

async function uploadToCDN(buffer, mime) {
  const linkRes = await fetch(`${HIGGSFIELD_CDN_BASE}/files/generate-upload-url`, {
    method: 'POST',
    headers: { Authorization: `Key ${HF_CDN_CREDENTIALS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: mime }),
  });
  if (!linkRes.ok) throw new Error(`CDN upload URL failed: ${linkRes.status}`);
  const linkData = await linkRes.json();
  const uploadRes = await fetch(linkData.upload_url, { method: 'PUT', headers: { 'Content-Type': mime }, body: buffer });
  if (!uploadRes.ok) throw new Error(`CDN upload failed: ${uploadRes.status}`);
  return linkData.public_url;
}

async function generateWithRunway(imageUrl, prompt) {
  const submitRes = await fetch(`${RUNWAY_BASE}/text_to_image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNWAY_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      promptText: prompt,
      model: RUNWAY_MODEL,
      ratio: '1024:1024',
      referenceImages: [{ uri: imageUrl, tag: 'person' }],
    }),
  });
  if (!submitRes.ok) {
    const t = await submitRes.text();
    throw new Error(`Runway submit failed: ${submitRes.status} ${t.slice(0, 180)}`);
  }
  const { id: taskId } = await submitRes.json();
  if (!taskId) throw new Error('Runway returned no task ID.');

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${RUNWAY_API_KEY}`, 'X-Runway-Version': '2024-11-06' },
    });
    if (!pollRes.ok) { if (pollRes.status >= 500) continue; throw new Error(`Polling failed: ${pollRes.status}`); }
    const pollData = await pollRes.json();
    const status = String(pollData.status || '').toUpperCase();
    if (status === 'SUCCEEDED') return pollData.output?.[0] || null;
    if (status === 'FAILED') throw new Error(pollData.failure || pollData.error || 'La génération a échoué.');
  }
  throw new Error("Temps d'attente dépassé.");
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function buildEditPrompt(stylePreset, color, length, finish, options) {
  const colorMap = { noir: 'black', brun: 'brown', auburn: 'auburn', blond: 'blonde', cuivre: 'copper' };
  const colorText = colorMap[color] || 'black';
  const lengthMap = { court: 'short', mi_long: 'medium-length', long: 'long', tres_long: 'very long' };
  const lengthText = lengthMap[length] || 'long';
  const finishMap = { naturel: 'natural', defini: 'defined', volume: 'voluminous', editorial: 'editorial' };
  const finishText = finishMap[finish] || 'natural';

  return [
    `A photorealistic portrait of @person, a woman, with a ${stylePreset.label} haircut.`,
    stylePreset.prompt,
    `The hair is ${colorText}, ${lengthText}, with a ${finishText} finish.`,
    'IMPORTANT: This is the EXACT same person as in the reference photo.',
    'Preserve every detail of their face: same eyes, nose, lips, jawline, skin tone, skin texture, facial structure, expression, and head shape.',
    'Preserve the same lighting, background, clothing, and camera angle.',
    'The ONLY change is the hairstyle on top of the person\'s head.',
    'Do NOT change the person\'s identity, age, gender, ethnicity, or body.',
    'Professional salon photography, sharp focus, natural lighting.',
  ].join(' ');
}

async function handleHairstylePreview(req, res) {
  const ip = getClientIp(req);
  assertRateLimit(ip);

  if (!RUNWAY_API_KEY) {
    return jsonResponse(res, 503, { ok: false, error: 'Le simulateur IA est temporairement indisponible. Veuillez réessayer plus tard.' });
  }

  const raw = await readBody(req);
  const body = JSON.parse(raw.toString());

  const stylePreset = findStylePreset(body.styleId, 'femme');
  if (!stylePreset) return jsonResponse(res, 400, { ok: false, error: 'Coiffure invalide.' });
  if (body.consent !== true) return jsonResponse(res, 400, { ok: false, error: 'Consentement requis.' });

  const color = normalizeChoice(body.color, ['noir', 'brun', 'auburn', 'blond', 'cuivre'], 'noir');
  const length = normalizeChoice(body.length, ['court', 'mi_long', 'long', 'tres_long'], 'long');
  const finish = normalizeChoice(body.finish, ['naturel', 'defini', 'volume', 'editorial'], 'naturel');

  const { mime, buffer } = parseDataUrl(body.photoDataUrl);
  const imageUrl = await uploadToCDN(buffer, mime);
  const prompt = buildEditPrompt(stylePreset, color, length, finish, {});

  await enqueueGeneration();
  let resultUrl;
  try { resultUrl = await generateWithRunway(imageUrl, prompt); } finally { releaseGeneration(); }
  if (!resultUrl) throw new Error("Aucune image générée n'a été retournée.");

  jsonResponse(res, 200, {
    ok: true,
    imageUrl: resultUrl,
    selectedStyle: stylePreset.label,
  });
}

function handleTryOnStatus(res) {
  const configured = Boolean(RUNWAY_API_KEY);
  jsonResponse(res, 200, {
    ok: true,
    configured,
    provider: configured ? 'Runway' : 'Aucun',
    model: configured ? RUNWAY_MODEL : null,
    rateLimit: { maxRequests: RATE_LIMIT_MAX, windowMinutes: RATE_LIMIT_WINDOW_MS / 60000 },
    queue: { active: activeGenerations, waiting: generationQueue.length, maxConcurrent: MAX_CONCURRENT, maxQueue: MAX_QUEUE },
    styles: Object.entries(STYLE_CATALOG.femme || {}).map(([id, v]) => ({ id, label: v.label })),
  });
}

// --- Routes API (face-swap Higgsfield) ---

async function handleFaceSwap(req, res) {
  try {
    const raw = await readBody(req);
    const { sourceImage, targetImage } = JSON.parse(raw.toString());

    if (!sourceImage || !targetImage) {
      return jsonResponse(res, 400, { error: 'sourceImage et targetImage requis' });
    }

    // Upload des images vers Higgsfield
    const sourceMatch = sourceImage.match(/^data:(image\/\w+);base64,(.+)/);
    const targetMatch = targetImage.match(/^data:(image\/\w+);base64,(.+)/);

    if (!sourceMatch || !targetMatch) {
      return jsonResponse(res, 400, { error: 'Format base64 invalide' });
    }

    const [sourceUpload, targetUpload] = await Promise.all([
      hfUpload(sourceMatch[2], sourceMatch[1]),
      hfUpload(targetMatch[2], targetMatch[1]),
    ]);

    // Soumettre le face swap
    const result = await hfRequest('/requests', {
      application: 'higgsfield/face-swap',
      arguments: {
        source_image: sourceUpload.url,
        target_image: targetUpload.url,
      },
    });

    jsonResponse(res, 200, { requestId: result.request_id || result.id });
  } catch (err) {
    console.error('Face swap error:', err.message);
    jsonResponse(res, 500, { error: err.message });
  }
}

async function handleStatus(req, res) {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const requestId = url.searchParams.get('id');

    if (!requestId) {
      return jsonResponse(res, 400, { error: 'Paramètre id requis' });
    }

    const result = await hfStatus(requestId);
    jsonResponse(res, 200, result);
  } catch (err) {
    console.error('Status error:', err.message);
    jsonResponse(res, 500, { error: err.message });
  }
}

// --- Serveur de fichiers statiques ---

async function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const fullPath = join(__dirname, filePath);

  // Sécurité : empêcher la traversée de répertoire
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Accès refusé');
    return;
  }

  try {
    await stat(fullPath);
    const ext = extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentType, ...corsHeaders() });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 — Page non trouvée</h1>');
  }
}

// --- Routeur ---

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Routes API — Simulateur femme (Runway)
  if (req.url === '/api/hairstyle-preview' && req.method === 'POST') {
    try {
      return await handleHairstylePreview(req, res);
    } catch (error) {
      const code = error.statusCode || 500;
      if (code >= 500) console.error('[hairstyle-preview]', error.message);
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      return jsonResponse(res, code, { ok: false, error: code >= 500 ? 'Génération indisponible pour le moment.' : error.message });
    }
  }

  if (req.url === '/api/try-on-status' && req.method === 'GET') {
    return handleTryOnStatus(res);
  }

  // Routes API — Simulateur homme (Higgsfield face-swap)
  if (req.url === '/api/face-swap' && req.method === 'POST') {
    return handleFaceSwap(req, res);
  }

  if (req.url?.startsWith('/api/status') && req.method === 'GET') {
    return handleStatus(req, res);
  }

  // Fichiers statiques
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Estilo Coiffure      → http://localhost:${PORT}`);
  console.log(`Simulateur homme     → http://localhost:${PORT}/simulateur.html`);
  console.log(`Simulateur femme IA  → http://localhost:${PORT}/simulateur-femme.html`);
});
