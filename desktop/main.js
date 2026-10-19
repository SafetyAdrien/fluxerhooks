// FluxerHooks pour Linux — processus principal Electron.
// L'interface est exactement celle de l'app Android (export web d'Expo, dossier web/) ;
// ce fichier fournit ce que le navigateur seul ne sait pas faire : stockage chiffré des tokens,
// fichiers, solveur de CAPTCHA natif, accès à l'API Fluxer sans blocage CORS, zone de notification.
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, protocol, safeStorage, session, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const http = require('node:http');

const ORIGIN = 'app://fluxerhooks';
// Numérotation propre à la version Desktop (« beta-0.0.1 »…), distincte de celle de l'app Mobile.
const DESKTOP_VERSION = require('./package.json').fluxerhooksVersion;
const WEB_DIR = path.join(__dirname, 'web');
const ICON = path.join(__dirname, 'build', 'icon.png');
// Le fil de calcul est hors de l'archive asar (asarUnpack) : les workers Node ne lisent pas l'asar.
const ALTCHA_WORKER = path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'altcha-worker.js');

app.setName('FluxerHooks');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let keepInBackground = false;
let quitting = false;

const dataDir = () => app.getPath('userData');
const filesDir = () => path.join(dataDir(), 'files');
const secretsFile = () => path.join(dataDir(), 'secrets.json');

/* ---------- Fichiers de l'app (protocole app://) ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'fluxerhooks') return new Response('Not found', { status: 404 });
  const pathname = decodeURIComponent(url.pathname);
  let file;
  if (pathname.startsWith('/userfiles/')) {
    file = path.join(filesDir(), path.basename(pathname));
    if (!inside(filesDir(), file)) return new Response('Forbidden', { status: 403 });
  } else {
    file = path.join(WEB_DIR, path.normalize(pathname));
    if (pathname === '/' || !inside(WEB_DIR, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(WEB_DIR, 'index.html');
    }
  }
  try {
    const body = await fsp.readFile(file);
    return new Response(body, { status: 200, headers: { 'content-type': mimeOf(file), 'cache-control': 'no-cache' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/* ---------- API Fluxer : l'app Android n'envoie pas d'en-tête Origin, on fait pareil ---------- */

function setupNetwork(ses) {
  const preflightHeaders = new Map();
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  ses.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
    const h = details.requestHeaders;
    const origin = h.Origin || h.origin;
    if (origin === ORIGIN) {
      delete h.Origin;
      delete h.origin;
      if (details.method === 'OPTIONS') preflightHeaders.set(details.id, h['Access-Control-Request-Headers'] || h['access-control-request-headers'] || '');
    }
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived(filter, (details, cb) => {
    // Seules les requêtes de l'interface (page app://) sont concernées.
    const fromApp = details.webContentsId && win && !win.isDestroyed() && details.webContentsId === win.webContents.id && details.resourceType !== 'mainFrame';
    if (!fromApp) return cb({});
    const headers = {};
    for (const [k, v] of Object.entries(details.responseHeaders || {})) {
      if (!k.toLowerCase().startsWith('access-control-')) headers[k] = v;
    }
    headers['Access-Control-Allow-Origin'] = [ORIGIN];
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
    headers['Access-Control-Expose-Headers'] = ['*'];
    headers['Access-Control-Max-Age'] = ['600'];
    if (details.method === 'OPTIONS') {
      const asked = preflightHeaders.get(details.id);
      preflightHeaders.delete(details.id);
      headers['Access-Control-Allow-Headers'] = [asked || 'Authorization, Content-Type, X-Captcha-Token, X-Captcha-Type, X-Fluxer-Features, X-Fluxer-Platform'];
      return cb({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
    }
    cb({ responseHeaders: headers });
  });
  ses.setPermissionRequestHandler((_wc, permission, done) => {
    done(['clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(permission));
  });
}

ipcMain.on('app:version', (e) => (e.returnValue = DESKTOP_VERSION));

/* ---------- Secrets (tokens) : trousseau du système via safeStorage ---------- */

let secretsCache = null;
function readSecrets() {
  if (secretsCache) return secretsCache;
  try {
    secretsCache = JSON.parse(fs.readFileSync(secretsFile(), 'utf8'));
  } catch {
    secretsCache = {};
  }
  return secretsCache;
}
function writeSecrets() {
  const tmp = secretsFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(secretsCache), { mode: 0o600 });
  fs.renameSync(tmp, secretsFile());
}
const encrypt = (v) =>
  safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(v).toString('base64') : 'b64:' + Buffer.from(v, 'utf8').toString('base64');
function decrypt(stored) {
  if (typeof stored !== 'string') return null;
  if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
  if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
  return null;
}
const validKey = (k) => typeof k === 'string' && /^[\w.\-:]{1,200}$/.test(k);

ipcMain.handle('secret:get', (_e, key) => {
  if (!validKey(key)) return null;
  try {
    return decrypt(readSecrets()[key]);
  } catch {
    return null;
  }
});
ipcMain.handle('secret:set', (_e, key, value) => {
  if (!validKey(key) || typeof value !== 'string') return;
  readSecrets()[key] = encrypt(value);
  writeSecrets();
});
ipcMain.handle('secret:del', (_e, key) => {
  if (!validKey(key)) return;
  delete readSecrets()[key];
  writeSecrets();
});

/* ---------- Fichiers ---------- */

ipcMain.handle('files:save', async (_e, defaultName, text) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('downloads'), path.basename(String(defaultName || 'fluxerhooks.json'))),
    filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePath) return null;
  await fsp.writeFile(res.filePath, String(text), 'utf8');
  return res.filePath;
});
ipcMain.handle('files:store', async (_e, name, data) => {
  await fsp.mkdir(filesDir(), { recursive: true });
  const safe = path.basename(String(name || 'file')).replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
  const file = `${crypto.randomBytes(6).toString('hex')}-${safe}`;
  await fsp.writeFile(path.join(filesDir(), file), Buffer.from(data));
  return `${ORIGIN}/userfiles/${encodeURIComponent(file)}`;
});
ipcMain.handle('files:remove', async (_e, url) => {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'app:' || !u.pathname.startsWith('/userfiles/')) return;
    const f = path.join(filesDir(), path.basename(decodeURIComponent(u.pathname)));
    if (inside(filesDir(), f)) await fsp.rm(f, { force: true });
  } catch {
    // déjà supprimé
  }
});

/* ---------- CAPTCHA ALTCHA : PBKDF2 d'OpenSSL sur tous les cœurs ---------- */

let altchaJob = null;
function stopAltcha() {
  if (!altchaJob) return;
  altchaJob.workers.forEach((w) => w.terminate().catch(() => {}));
  clearInterval(altchaJob.ticker);
  clearTimeout(altchaJob.timer);
  altchaJob = null;
}
ipcMain.handle('altcha:cancel', () => {
  if (altchaJob) altchaJob.reject(new Error('Annulé.'));
  stopAltcha();
});
ipcMain.handle('altcha:solve', (e, opts) => {
  stopAltcha();
  const digest = { 'PBKDF2/SHA-256': 'sha256', 'PBKDF2/SHA-384': 'sha384', 'PBKDF2/SHA-512': 'sha512' }[opts.algorithm];
  if (!digest) throw new Error(`Algorithme de CAPTCHA non pris en charge : ${opts.algorithm}`);
  const shared = new SharedArrayBuffer(16);
  const state = new BigInt64Array(shared); // [0] = prochain indice, [1] = tentatives
  const n = Math.max(1, Math.min(os.cpus().length || 2, 16));
  return new Promise((resolve, reject) => {
    const job = { workers: [], reject, ticker: null, timer: null };
    altchaJob = job;
    const finish = (fn) => {
      if (altchaJob !== job) return;
      stopAltcha();
      fn();
    };
    job.ticker = setInterval(() => {
      if (!e.sender.isDestroyed()) e.sender.send('altcha:progress', { tries: Number(Atomics.load(state, 1)) });
    }, 150);
    job.timer = setTimeout(() => finish(() => reject(new Error('Le CAPTCHA a pris trop de temps, réessaie.'))), opts.timeoutMs || 180000);
    for (let i = 0; i < n; i++) {
      const w = new Worker(ALTCHA_WORKER, {
        workerData: {
          shared,
          digest,
          nonce: opts.nonce,
          salt: opts.salt,
          cost: opts.cost,
          keyLength: opts.keyLength || 32,
          keyPrefix: String(opts.keyPrefix).toLowerCase(),
          hintLo: opts.hintLo ?? 500,
          hintHi: opts.hintHi ?? 1000,
        },
      });
      w.on('message', (m) => finish(() => resolve({ counter: m.counter, derivedKey: m.derivedKey, tries: Number(Atomics.load(state, 1)) })));
      w.on('error', (err) => finish(() => reject(err)));
      job.workers.push(w);
    }
  });
});

/* ---------- Connexion d'appareils : serveur local (réseau local) ---------- */

const LINK_PORTS = [47321, 47322, 47323, 47324, 47325];
const MAX_LINK_BODY = 64 * 1024 * 1024;
let linkServer = null;
let linkPort = 0;
const linkPending = new Map();

ipcMain.on('app:hostname', (e) => (e.returnValue = os.hostname()));
ipcMain.on('link:response', (_e, r) => {
  const p = linkPending.get(r?.id);
  if (!p) return;
  linkPending.delete(r.id);
  p(r);
});

function onLinkHttp(req, res) {
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
  };
  if (!String(req.url || '').startsWith('/fluxerhooks/')) return reply(404, '{"error":"not_found"}');
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_LINK_BODY) req.destroy();
    else chunks.push(c);
  });
  req.on('end', () => {
    if (!win || win.isDestroyed()) return reply(503, '{"error":"unavailable"}');
    const id = crypto.randomBytes(8).toString('hex');
    const timer = setTimeout(() => {
      linkPending.delete(id);
      reply(504, '{"error":"timeout"}');
    }, 90000);
    linkPending.set(id, (r) => {
      clearTimeout(timer);
      reply(Number(r.status) || 500, String(r.body ?? ''));
    });
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v ?? '');
    win.webContents.send('link:request', { id, method: req.method, path: req.url, headers, body: Buffer.concat(chunks).toString('utf8') });
  });
}

function startLinkServer() {
  if (linkServer) return Promise.resolve(linkPort);
  return new Promise((resolve) => {
    const tryPort = (i) => {
      if (i >= LINK_PORTS.length) return resolve(null);
      const srv = http.createServer(onLinkHttp);
      srv.once('error', () => tryPort(i + 1));
      srv.listen(LINK_PORTS[i], '0.0.0.0', () => {
        linkServer = srv;
        linkPort = LINK_PORTS[i];
        resolve(linkPort);
      });
    };
    tryPort(0);
  });
}
function stopLinkServer() {
  if (!linkServer) return;
  linkServer.close();
  linkServer = null;
  linkPort = 0;
}
ipcMain.handle('link:serve', async (_e, on) => (on ? startLinkServer() : (stopLinkServer(), null)));
ipcMain.handle('link:port', () => linkPort);
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|tun|tap|zt|tailscale)/.test(name)) continue;
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
ipcMain.handle('link:addresses', () => lanAddresses());
// Requêtes vers un autre appareil lié : réseau local uniquement (plages privées ou même sous-réseau que cet ordinateur).
const subnet = (ip) => ip.split('.').slice(0, 3).join('.');
const isLocalHost = (h) =>
  h === 'localhost' ||
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
  (/^\d+\.\d+\.\d+\.\d+$/.test(h) && lanAddresses().some((a) => subnet(a) === subnet(h)));
ipcMain.handle('link:request', (_e, url, method, body, timeoutMs) => {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return { status: 0, body: '' };
  }
  if (u.protocol !== 'http:' || !isLocalHost(u.hostname)) return { status: 0, body: '' };
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: method === 'POST' ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, timeout: Math.min(Number(timeoutMs) || 15000, 120000) },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > MAX_LINK_BODY) req.destroy();
          else chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => resolve({ status: 0, body: '' }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ status: 0, body: '' }));
    if (body != null) req.write(String(body));
    req.end();
  });
});

/* ---------- Arrière-plan (automatisations) ---------- */

function ensureTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 22, height: 22 }));
  tray.setToolTip('FluxerHooks');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Ouvrir FluxerHooks', click: showWindow },
      { type: 'separator' },
      { label: 'Quitter', click: () => ((quitting = true), app.quit()) },
    ]),
  );
  tray.on('click', showWindow);
}
ipcMain.handle('app:background', (_e, enabled) => {
  keepInBackground = !!enabled;
  if (keepInBackground) ensureTray();
  else if (tray && win?.isVisible()) {
    tray.destroy();
    tray = null;
  }
});

/* ---------- Fenêtre ---------- */

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    title: 'FluxerHooks',
    icon: ICON,
    backgroundColor: '#16171B',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      // Les automatisations continuent quand la fenêtre est cachée dans la zone de notification.
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith(ORIGIN)) {
      ev.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  win.on('close', (ev) => {
    if (keepInBackground && !quitting) {
      ev.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => (win = null));
  win.loadURL(`${ORIGIN}/`);
}

app.on('second-instance', showWindow);
app.on('before-quit', () => (quitting = true));
app.on('window-all-closed', () => {
  if (!keepInBackground) app.quit();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', serve);
  setupNetwork(session.defaultSession);
  createWindow();
});
