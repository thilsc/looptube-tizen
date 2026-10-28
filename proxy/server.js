const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');

const app = express();

let YT_API_KEY = process.env.YT_API_KEY;
if (!YT_API_KEY && process.env.YT_API_KEY_FILE) {
  try {
    YT_API_KEY = fs.readFileSync(process.env.YT_API_KEY_FILE, 'utf8').trim();
  } catch (e) {
    console.error('Falha ao ler YT_API_KEY_FILE:', e.message);
    process.exit(1);
  }
}
if (!YT_API_KEY) {
  console.error('YT_API_KEY não configurada. Defina YT_API_KEY ou YT_API_KEY_FILE.');
  process.exit(1);
}

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const EXTRA_PATH = process.env.EXTRA_PATH || '/home/thiago/.nvm/versions/node/v25.6.1/bin';
const PORT = Number(process.env.PORT) || 5000;
const CACHE_TTL = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;
const YTDLP_TIMEOUT = Number(process.env.YTDLP_TIMEOUT_MS) || 30000;
const YTDLP_FORMAT =
  process.env.YTDLP_FORMAT || 'best[ext=mp4][vcodec^=avc1][acodec^=mp4a]/best[ext=mp4]/best';
const YTDLP_COOKIES = process.env.YTDLP_COOKIES || '';

const defaultOrigins = ['http://localhost', 'https://localhost', 'https://thilsc.github.io'];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : process.env.CORS_ALLOW_ALL === '1'
    ? ['*']
    : defaultOrigins;
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins
  })
);

// Cabeçalhos básicos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS) || 60000;
const RATE_MAX = Number(process.env.RATE_MAX) || 60;

// Rate limit distribuído via Redis (se REDIS_URL) com fallback em memória
let redisClient = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redisClient.connect().catch(() => {
      redisClient = null;
    });
  } catch {
    redisClient = null;
  }
}

const memoryBuckets = new Map();
async function rateLimitCheck(ip) {
  if (redisClient) {
    try {
      const key = `rl:${ip}`;
      const count = await redisClient.incr(key);
      if (count === 1) await redisClient.pexpire(key, RATE_WINDOW_MS);
      return count <= RATE_MAX;
    } catch {
      // fallback
    }
  }
  const now = Date.now();
  let bucket = memoryBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    memoryBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_MAX;
}

app.use(async (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ok = await rateLimitCheck(ip);
  if (!ok) {
    return res.status(429).json({ error: 'Muitas requisições' });
  }
  next();
});

app.use(express.json());

// Cache em memória de URLs de stream resolvidas
const streamCache = new Map();
function getCached(id) {
  const entry = streamCache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    streamCache.delete(id);
    return null;
  }
  return entry.url;
}
function setCached(id, url) {
  streamCache.set(id, { url, ts: Date.now() });
}

async function fetchPlaylistItems(playlistId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
    throw new Error('ID de playlist inválido');
  }
  const items = [];
  let pageToken = '';

  do {
    const url = new URL(`${YT_API_BASE}/playlistItems`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', YT_API_KEY);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let msg = `YouTube API: ${res.status}`;
      try {
        const err = await res.json();
        if (err?.error?.message) msg = err.error.message;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    for (const item of data.items || []) {
      const videoId = item?.contentDetails?.videoId;
      if (videoId) items.push(videoId);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return items;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/playlist/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const videoIds = await fetchPlaylistItems(id);
    if (!videoIds.length) {
      return res.status(404).json({ error: 'Playlist vazia ou não encontrada' });
    }
    const base = `${req.protocol}://${req.get('host')}`;
    const videoUrls = videoIds.map((videoId) => `${base}/proxy/${encodeURIComponent(videoId)}`);
    console.log(`Playlist ${id}: ${videoUrls.length} vídeos encontrados`);
    return res.json(videoUrls);
  } catch (e) {
    console.error('Erro ao buscar playlist:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

function ytdlpArgs(videoId, extractorArgs) {
  const args = [
    '--no-playlist',
    '--extractor-args',
    extractorArgs,
    '-f',
    YTDLP_FORMAT,
    '--get-url',
    `https://www.youtube.com/watch?v=${videoId}`
  ];
  if (YTDLP_COOKIES) {
    args.unshift('--cookies', YTDLP_COOKIES);
  }
  // Sem cookies configurados, tenta sem cookies (evita dependência de navegador local)
  return args;
}

function runYtDlpGetUrl(videoId, extractorArgs) {
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP_BIN,
      ytdlpArgs(videoId, extractorArgs),
      {
        timeout: YTDLP_TIMEOUT,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${process.env.PATH || ''}:${EXTRA_PATH}`
        }
      },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message || '').trim()));
        const url = (stdout || '').trim().split('\n').filter(Boolean)[0];
        if (!url) return reject(new Error('Nenhuma URL retornada pelo yt-dlp'));
        resolve(url);
      }
    );
  });
}

app.get('/proxy/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: 'ID de vídeo inválido' });
  }

  const cached = getCached(id);
  if (cached) {
    return res.redirect(cached);
  }

  const clients = [
    'youtube:player_client=android',
    'youtube:player_client=ios',
    'youtube:player_client=mweb',
    'youtube:player_client=web'
  ];

  for (const c of clients) {
    try {
      const mediaUrl = await runYtDlpGetUrl(id, c);
      setCached(id, mediaUrl);
      return res.redirect(mediaUrl);
    } catch (e) {
      console.warn(`Falhou com ${c}: ${e.message}`);
    }
  }

  return res.status(500).json({ error: 'Falha ao obter stream (todos os clientes)' });
});

// Handler de erros centralizado
app.use((err, _req, res, _next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const httpsKeyPath = process.env.HTTPS_KEY;
const httpsCertPath = process.env.HTTPS_CERT;

let server;
if (httpsKeyPath && httpsCertPath) {
  const options = {
    key: fs.readFileSync(httpsKeyPath),
    cert: fs.readFileSync(httpsCertPath)
  };
  server = https
    .createServer(options, app)
    .listen(PORT, () => console.log(`Proxy HTTPS rodando em https://localhost:${PORT}`));
} else {
  server = http
    .createServer(app)
    .listen(PORT, () => console.log(`Proxy HTTP rodando em http://localhost:${PORT}`));
}

function shutdown() {
  console.log('Encerrando servidor…');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
