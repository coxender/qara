import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const defaultConfig = {
  inviteToken: 'local-wedding-invite-change-me',
  guestPassword: 'celebrate',
  hostPassword: 'host-change-me'
};
const inviteToken = process.env.INVITE_TOKEN || defaultConfig.inviteToken;
const guestPassword = process.env.GUEST_PASSWORD || defaultConfig.guestPassword;
const hostPassword = process.env.HOST_PASSWORD || defaultConfig.hostPassword;
const youtubeKey = process.env.YOUTUBE_API_KEY;
const sessions = new Map();
const requests = [];
const requestLimits = new Map();
const songMetadata = new Map();

const defaultWeddingConfig = {
  brandName: 'THE HARPER WEDDING',
  eventDate: 'September 20, 2026',
  location: 'Hudson Valley',
  guestGreeting: 'What should we\nplay next?',
  guestAccessGreeting: 'Let’s make a\nplaylist together.',
  hostGreeting: 'Keep the floor\nmoving.',
  hostAccessGreeting: 'Welcome\nback.',
  colors: { ink: '#9A0913', olive: '#95C79D', cream: '#fff7f7', paper: '#fffefe', sage: '#e4f2e6', line: '#edcbd0', coral: '#FFB0B8', muted: '#7c5559' }
};

function textConfig(value, fallback) { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function colorConfig(value, fallback) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
async function loadWeddingConfig() {
  const configPath = path.resolve(root, process.env.WEDDING_CONFIG_PATH || 'config.json');
  try {
    const source = JSON.parse(await readFile(configPath, 'utf8'));
    return {
      ...Object.fromEntries(Object.entries(defaultWeddingConfig).filter(([key]) => key !== 'colors').map(([key, value]) => [key, textConfig(source[key], value)])),
      colors: Object.fromEntries(Object.entries(defaultWeddingConfig.colors).map(([key, value]) => [key, colorConfig(source.colors?.[key], value)]))
    };
  } catch (error) {
    if (error.code === 'ENOENT') return defaultWeddingConfig;
    throw new Error(`Unable to load wedding configuration: ${error.message}`);
  }
}
const wedding = await loadWeddingConfig();

if (production) {
  const unsafeValues = Object.entries({ inviteToken, guestPassword, hostPassword })
    .filter(([name, value]) => value === defaultConfig[name])
    .map(([name]) => name);
  if (unsafeValues.length) throw new Error(`Set non-default production configuration for: ${unsafeValues.join(', ')}`);
}

const demoSongs = [
  { id: 'demo-1', title: 'September', artist: 'Earth, Wind & Fire', duration: '3:35' },
  { id: 'demo-2', title: 'Dancing Queen', artist: 'ABBA', duration: '3:51' },
  { id: 'demo-3', title: 'Lovely Day', artist: 'Bill Withers', duration: '4:15' },
  { id: 'demo-4', title: 'Levitating', artist: 'Dua Lipa', duration: '3:23' }
];

function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function multilineHtml(value) { return escapeHtml(value).replace(/\n/g, '<br>'); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim().split('=').map(decodeURIComponent)).filter(p => p.length === 2)); }
function setCookie(res, name, value, maxAge) { res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${production ? '; Secure' : ''}`); }
function sessionFor(req) { const id = parseCookies(req).wedding_session; const session = id && sessions.get(id); if (!session || session.expires < Date.now()) { if (id) sessions.delete(id); return null; } return session; }
function createSession(res, role) { const id = crypto.randomBytes(32).toString('base64url'); sessions.set(id, { role, expires: Date.now() + (role === 'host' ? 12 : 8) * 60 * 60 * 1000 }); setCookie(res, 'wedding_session', id, role === 'host' ? 43200 : 28800); }
function readJson(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => { data += chunk; if (data.length > 32_000) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid request.')); } }); }); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function sendPage(res, content) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(content); }
function redirect(res, location) { res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' }); res.end(); }
function isSameOrigin(req) { const origin = req.headers.origin; return !origin || origin === publicOrigin; }
function requireRole(req, res, role) { const session = sessionFor(req); if (!session || session.role !== role) { json(res, 401, { error: 'Please sign in again.' }); return null; } return session; }
function slowEqual(a, b) { const left = crypto.createHash('sha256').update(a).digest(), right = crypto.createHash('sha256').update(b).digest(); return crypto.timingSafeEqual(left, right); }
function parseYoutubeDuration(value = '') { const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!match) return 0; return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0); }
function durationLabel(seconds) { return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'YouTube'; }
function markedExplicit(song) { return /\b(explicit|e\s*version)\b/i.test(`${song.title} ${song.artist}`); }
function saveSongs(songs) { songs.forEach(song => songMetadata.set(song.id, song)); return songs; }
function passwordPage(error = '') { return page('Join the music queue', `<main class="login"><a class="wordmark" href="/">${escapeHtml(wedding.brandName)}</a><section class="login-card"><p class="eyebrow">Guest access</p><h1>${multilineHtml(wedding.guestAccessGreeting)}</h1><p class="intro">Enter the wedding password to request songs for tonight’s celebration.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<form method="post" action="/join/${encodeURIComponent(inviteToken)}"><label>Wedding password<input name="password" type="password" autocomplete="current-password" required autofocus></label><button>Enter the queue <span>→</span></button></form><p class="quiet">Your requests are reviewed by the DJ.</p></section></main>`); }
function guestPage() { const approved = requests.filter(r => r.status === 'approved').length; return page('Wedding music queue', `<header class="top"><a class="wordmark" href="/">${escapeHtml(wedding.brandName)}</a><span class="live"><i></i> LIVE QUEUE</span></header><main class="guest"><section class="hero"><p class="eyebrow">${escapeHtml(wedding.eventDate)} · ${escapeHtml(wedding.location)}</p><h1>${multilineHtml(wedding.guestGreeting)}</h1><p>Add a song to the DJ review queue. Your great taste is officially invited.</p></section><section class="request-box"><label for="search">Find a song on YouTube</label><div class="search"><span>⌕</span><input id="search" placeholder="Song title or artist" autocomplete="off"></div><div id="results" class="results"><p class="hint">Start typing to search YouTube.</p></div><label class="note-label" for="note">Dedication <small>(optional)</small></label><input id="note" class="note" placeholder="A note for the happy couple"><button id="request-button" class="request-button" disabled>Add selected song <span>+</span></button></section><section class="queue"><div class="queue-title"><div><p class="eyebrow">Playing tonight</p><h2>Up next</h2></div><span id="queue-count">${approved} approved</span></div><div id="queue-items" class="queue-items">${renderQueue()}</div></section></main><div class="toast" id="toast" role="status"></div><script src="/app.js"></script>`); }
function hostPage(qr) { const guestUrl = `${publicOrigin}/join/${inviteToken}`, approved = requests.filter(r => r.status === 'approved').length, pending = requests.filter(r => r.status === 'pending').length; return page('Host controls', `<header class="top"><a class="wordmark" href="/host">${escapeHtml(wedding.brandName)}</a><span class="host-badge">HOST CONTROLS</span></header><main class="host"><section class="host-hero"><div><p class="eyebrow">Command center</p><h1>${multilineHtml(wedding.hostGreeting)}</h1><p>Approve requests, run special moments, and share the private QR with guests.</p></div><div class="qr-card"><img src="${qr}" alt="Guest invite QR code"><b>Guest music QR</b><small>Scan + wedding password required</small><a class="invite-url" href="${escapeHtml(guestUrl)}" target="_blank" rel="noopener">${escapeHtml(guestUrl)}</a></div></section><section class="host-queue"><div class="queue-title"><div><p class="eyebrow">Live queue</p><h2>Approved songs</h2></div><span>${approved} ready</span></div><div class="queue-items">${renderQueue()}</div></section><section class="moments"><p class="eyebrow">The big moments</p><div class="moment-grid"><button data-moment="First dance">♡<span>First dance<small>At Last · Etta James</small></span></button><button data-moment="Bridal party entry">✦<span>Bridal party entry<small>Can’t Stop the Feeling!</small></span></button><button data-moment="Cake cutting">⌁<span>Cake cutting<small>How Sweet It Is</small></span></button><button data-moment="Last dance">☾<span>Last dance<small>Sweet Caroline</small></span></button></div></section><section class="approval"><div class="queue-title"><div><p class="eyebrow">DJ review</p><h2>Needs approval</h2></div><span>${pending} waiting</span></div><div id="host-requests">${renderHostRequests()}</div></section></main><div class="toast" id="toast" role="status"></div><script src="/host.js"></script>`); }
function renderQueue() { if (!requests.length) return '<p class="hint">The queue is ready for its first request.</p>'; return requests.filter(r => r.status === 'approved').slice(-5).map((r,i) => `<article class="queue-song"><span>0${i + 1}</span><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.artist)}</small></div><em>${escapeHtml(r.duration || '—')}</em></article>`).join('') || '<p class="hint">Requests will appear here once approved.</p>'; }
function renderHostRequests() { if (!requests.length) return '<p class="hint host-hint">No requests yet. Share the QR code to get the party started.</p>'; return requests.filter(r => r.status === 'pending').map(r => `<article class="host-song"><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.artist)}${r.note ? ` · “${escapeHtml(r.note)}”` : ''}</small></div><div><button data-id="${r.id}" data-action="approve">Approve</button><button class="decline" data-id="${r.id}" data-action="decline">Decline</button></div></article>`).join('') || '<p class="hint host-hint">All caught up.</p>'; }
function page(title, content) { const theme = Object.entries(wedding.colors).map(([name, value]) => `--${name}:${value}`).join(';'); return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"><style>:root{${theme}}</style></head><body>${content}</body></html>`; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, publicOrigin);
  try {
    if (req.method === 'GET' && url.pathname === '/styles.css') { res.writeHead(200, {'Content-Type':'text/css'}); return res.end(await readFile(path.join(root, 'styles.css'))); }
    if (req.method === 'GET' && url.pathname === '/app.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(await readFile(path.join(root, 'app.js'))); }
    if (req.method === 'GET' && url.pathname === '/host.js') { res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(await readFile(path.join(root, 'host.js'))); }
    if (req.method === 'GET' && url.pathname === '/') return redirect(res, `/join/${inviteToken}`);
    if (req.method === 'GET' && url.pathname === `/join/${inviteToken}`) return sendPage(res, sessionFor(req)?.role === 'guest' ? guestPage() : passwordPage());
    if (req.method === 'POST' && url.pathname === `/join/${inviteToken}`) { let raw=''; for await (const chunk of req) raw += chunk; const password = new URLSearchParams(raw).get('password') || ''; if (!slowEqual(password, guestPassword)) return sendPage(res, passwordPage('That password didn’t match. Please try again.')); createSession(res, 'guest'); return redirect(res, `/join/${inviteToken}`); }
    if (req.method === 'GET' && url.pathname === '/host') { if (sessionFor(req)?.role === 'host') { const svg = await QRCode.toDataURL(`${publicOrigin}/join/${inviteToken}`, { margin: 1, width: 260, color: { dark: wedding.colors.ink, light: wedding.colors.paper } }); return sendPage(res, hostPage(svg)); } return sendPage(res, page('Host sign in', `<main class="login"><a class="wordmark" href="/">${escapeHtml(wedding.brandName)}</a><section class="login-card"><p class="eyebrow">Host access</p><h1>${multilineHtml(wedding.hostAccessGreeting)}</h1><form method="post" action="/host"><label>Host password<input name="password" type="password" required autofocus></label><button>Open controls <span>→</span></button></form></section></main>`)); }
    if (req.method === 'POST' && url.pathname === '/host') { let raw=''; for await (const chunk of req) raw += chunk; if (!slowEqual(new URLSearchParams(raw).get('password') || '', hostPassword)) return json(res, 401, { error: 'Invalid host password.' }); createSession(res, 'host'); return redirect(res, '/host'); }
    if (req.method === 'GET' && url.pathname === '/api/search') { if (!requireRole(req, res, 'guest')) return; const q = url.searchParams.get('q')?.trim(); if (!q || q.length < 2) return json(res, 200, { songs: [] }); if (!youtubeKey) { const matches = demoSongs.filter(s => `${s.title} ${s.artist}`.toLowerCase().includes(q.toLowerCase())); const songs = saveSongs((matches.length ? matches : demoSongs).map(song => ({ ...song, durationSeconds: Number(song.duration.split(':')[0]) * 60 + Number(song.duration.split(':')[1]), explicit: markedExplicit(song) }))); return json(res, 200, { songs, demo: true }); } const api = new URL('https://www.googleapis.com/youtube/v3/search'); api.search = new URLSearchParams({ part:'snippet', type:'video', videoCategoryId:'10', maxResults:'8', q, key:youtubeKey }); const searchData = await fetch(api).then(r => r.json()); const ids = (searchData.items || []).map(x => x.id.videoId).filter(Boolean); const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos'); detailsUrl.search = new URLSearchParams({ part:'contentDetails', id:ids.join(','), key:youtubeKey }); const details = ids.length ? await fetch(detailsUrl).then(r => r.json()) : { items: [] }; const lengths = new Map((details.items || []).map(x => [x.id, parseYoutubeDuration(x.contentDetails.duration)])); const songs = saveSongs((searchData.items || []).map(x => { const song = { id:x.id.videoId, title:x.snippet.title, artist:x.snippet.channelTitle, durationSeconds:lengths.get(x.id.videoId) || 0 }; return { ...song, duration:durationLabel(song.durationSeconds), explicit:markedExplicit(song) }; })); return json(res, 200, { songs }); }
    if (req.method === 'POST' && url.pathname === '/api/requests') { if (!requireRole(req, res, 'guest') || !isSameOrigin(req)) return; const now=Date.now(), sid=parseCookies(req).wedding_session, recent=(requestLimits.get(sid)||[]).filter(t=>now-t<15*60*1000); if(recent.length>=3) return json(res,429,{error:'You can request up to 3 songs every 15 minutes.'}); const body=await readJson(req), song=songMetadata.get(body.id); if(!song || String(body.note||'').length>240) return json(res,400,{error:'Please choose a song from the search results.'}); const status = !song.explicit && song.durationSeconds > 0 && song.durationSeconds <= 360 ? 'approved' : 'pending', request={id:crypto.randomUUID(),title:song.title,artist:song.artist,duration:song.duration,note:String(body.note||''),status}; requests.push(request); recent.push(now);requestLimits.set(sid,recent);return json(res,201,{ok:true,status,request:status==='approved'?request:undefined,approvedCount:requests.filter(r=>r.status==='approved').length}); }
    if (req.method === 'POST' && url.pathname === '/api/host/request') { if (!requireRole(req,res,'host') || !isSameOrigin(req)) return; const body=await readJson(req), item=requests.find(r=>r.id===body.id); if(!item || !['approve','decline'].includes(body.action)) return json(res,400,{error:'Invalid request.'}); item.status=body.action==='approve'?'approved':'declined';return json(res,200,{ok:true}); }
    json(res, 404, { error: 'Not found.' });
  } catch (error) { console.error(error); json(res, 500, { error: 'Something went wrong.' }); }
});
server.listen(port, () => console.log(`Wedding queue running at ${publicOrigin}`));
