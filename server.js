/* ============================================
   ESTILO COIFFURE — Proxy API Higgsfield
   Protège les clés API côté serveur
   ============================================ */

import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PORT = process.env.PORT || 3000;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_API_SECRET = process.env.HF_API_SECRET;
const HF_BASE = 'https://cloud.higgsfield.ai/api/v1';

if (!HF_API_KEY || !HF_API_SECRET) {
  console.error('ERREUR: HF_API_KEY et HF_API_SECRET requis dans .env');
  process.exit(1);
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

// --- Routes API ---

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

  // Routes API
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
  console.log(`Estilo Coiffure → http://localhost:${PORT}`);
  console.log(`Simulateur     → http://localhost:${PORT}/simulateur.html`);
});
