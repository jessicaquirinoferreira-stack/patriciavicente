import express, { type Request } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '12mb' }));

// Admin credential session helpers
const ADMIN_LOGIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@x.com').trim().toLowerCase();
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin4321';
const ADMIN_COOKIE_NAME = 'pv_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret(): string {
  if (process.env.ADMIN_SESSION_SECRET) {
    return process.env.ADMIN_SESSION_SECRET;
  }
  return crypto
    .createHash('sha256')
    .update(`${ADMIN_LOGIN_EMAIL}:${ADMIN_LOGIN_PASSWORD}:pv-admin-session-v1`)
    .digest('hex');
}

function sha256Equal(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function signAdminSession(email: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ email, exp }), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminSessionToken(token: string | undefined): { email: string } | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');

  if (!sha256Equal(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
      exp?: number;
    };
    if (!parsed.email || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { email: parsed.email };
  } catch {
    return null;
  }
}

function extractSessionToken(req: Request): string | undefined {
  const authHeader = req.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === ADMIN_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return undefined;
}

app.post('/api/admin/login', (req, res) => {
  const { email, password } = (req.body || {}) as { email?: string; password?: string };
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const providedPassword = typeof password === 'string' ? password : '';

  if (
    !normalizedEmail ||
    !providedPassword ||
    !sha256Equal(normalizedEmail, ADMIN_LOGIN_EMAIL) ||
    !sha256Equal(providedPassword, ADMIN_LOGIN_PASSWORD)
  ) {
    res.status(401).json({ ok: false, error: 'Login ou senha inválidos.' });
    return;
  }

  const token = signAdminSession(normalizedEmail);
  const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/'
  });

  res.json({ ok: true, email: normalizedEmail, sessionToken: token });
});

app.get('/api/admin/session', (req, res) => {
  const token = extractSessionToken(req);
  const session = verifyAdminSessionToken(token);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true, email: session.email });
});

app.post('/api/admin/logout', (req, res) => {
  const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/'
  });
  res.json({ ok: true });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    timestamp: new Date().toISOString()
  });
});

// Vercel Blob upload endpoint (supports base64 JSON payload for images & PDFs)
app.post('/api/blob/upload', async (req, res) => {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const { fileName, contentType, base64Data, folder } = req.body as {
      fileName?: string;
      contentType?: string;
      base64Data?: string;
      folder?: string;
    };

    if (!fileName || !base64Data) {
      res.status(400).json({ error: 'Nome do arquivo e conteúdo são obrigatórios.' });
      return;
    }

    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
    const safeFolder = (folder || 'patricia-vicente').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!token) {
      res.status(501).json({
        error: 'BLOB_READ_WRITE_TOKEN não configurado neste ambiente.',
        fallbackAllowed: true
      });
      return;
    }

    const base64Body = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Body, 'base64');

    const blob = await put(`${safeFolder}/${Date.now()}-${cleanName}`, buffer, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      token
    });

    res.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: contentType || 'application/octet-stream',
      sizeBytes: buffer.length,
      storageProvider: 'vercel_blob'
    });
  } catch (error) {
    console.error('Erro ao enviar arquivo para Vercel Blob:', error);
    res.status(500).json({ error: 'Falha ao enviar arquivo para o armazenamento.' });
  }
});

// SEO: robots.txt
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      `Sitemap: ${baseUrl.replace(/\/$/, '')}/sitemap.xml`
    ].join('\n')
  );
});

// SEO: sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const staticRoutes = [
    '/',
    '/comprar',
    '/na-planta',
    '/prontos',
    '/condominios',
    '/empreendimentos',
    '/sobre',
    '/contato',
    '/privacidade'
  ];
  const today = new Date().toISOString().split('T')[0];
  const urls = staticRoutes
    .map(
      (route) => `  <url>\n    <loc>${baseUrl}${route}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${route === '/' ? '1.0' : '0.8'}</priority>\n  </url>`
    )
    .join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
  );
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
