// ============================================================================
//  UniFi Threat Detection  →  ioBroker   (für den javascript-Adapter)
//  Liest IDS/IPS-Threats + Honeypot vom UDM Pro und schreibt 24h-Zähler nach
//  0_userdata.0.unifi.threats.*  — wird vom Lumina-Dashboard (network.html)
//  gelesen (Sektion "Security · Threats").
//
//  EINRICHTUNG
//  1) javascript-Adapter installiert. Falls "require" gesperrt ist:
//     Instanz-Einstellungen → "Enable Command: require" aktivieren.
//  2) Unten HOST / USER / PASS eintragen — derselbe LOKALE UniFi-OS-User wie
//     beim unifi-network-Adapter (kein Cloud-/SSO-Account), Rolle mind.
//     "Site Admin" (lesend reicht).
//  3) Threat Management / IPS am UDM Pro muss AKTIV sein, sonst gibt es keine
//     Events zu zählen.
//  4) Script als neues Script (Typ "JavaScript") einfügen, speichern, starten.
//  5) Log auf [unifi-threats] prüfen. Bei DEBUG=true wird je ein Roh-Event /
//     -Alarm geloggt → damit lassen sich Feldnamen verifizieren und die
//     Zählung (action/honeypot-Match) bei Bedarf feinjustieren.
// ============================================================================

const HOST = '1.1.1.1';        // UDM Pro IP
const PORT = 443;
const USER = 'exampleuser';         // lokaler UniFi-OS-User
const PASS = 'DEIN_PASSWORT';    // <-- eintragen
const SITE = 'default';
const INTERVAL_SEC = 60;
const DEBUG = true;              // nach erfolgreicher Justierung auf false

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const BASE = '0_userdata.0.unifi.threats';
let session = null;              // { cookie, csrf }

function httpReq(method, path, { body, cookie, csrf } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { Accept: 'application/json' };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-Csrf-Token'] = csrf;
    const r = https.request({ host: HOST, port: PORT, path, method, headers, agent, timeout: 15000 }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    if (data) r.write(data);
    r.end();
  });
}

function csrfFromCookie(cookie) {
  try {
    const jwt = cookie.split('TOKEN=')[1];
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
    return payload.csrfToken || null;
  } catch (e) { return null; }
}

async function login() {
  const res = await httpReq('POST', '/api/auth/login', { body: { username: USER, password: PASS, rememberMe: true } });
  if (res.status !== 200) throw new Error('Login HTTP ' + res.status + ' ' + res.body.slice(0, 160));
  const sc = res.headers['set-cookie'] || [];
  const cookie = (sc.map(c => c.split(';')[0]).filter(c => /^(TOKEN|unifises)/i.test(c)).join('; ')) || sc.map(c => c.split(';')[0]).join('; ');
  const csrf = res.headers['x-csrf-token'] || res.headers['x-updated-csrf-token'] || csrfFromCookie(cookie);
  session = { cookie, csrf };
  log('[unifi-threats] Login OK');
}

async function apiPost(endpoint, body) {
  if (!session) await login();
  const url = '/proxy/network/api/s/' + SITE + endpoint;
  let res = await httpReq('POST', url, { body, cookie: session.cookie, csrf: session.csrf });
  if (res.status === 401) { await login(); res = await httpReq('POST', url, { body, cookie: session.cookie, csrf: session.csrf }); }
  if (res.status !== 200) throw new Error('API ' + endpoint + ' HTTP ' + res.status);
  return JSON.parse(res.body).data || [];
}

function tOf(e) { return e.time || e.timestamp || (e.datetime ? Date.parse(e.datetime) : 0); }

async function poll() {
  try {
    const now = Date.now(), dayAgo = now - 24 * 3600 * 1000;

    // ── IDS/IPS-Events ──
    const ips = await apiPost('/stat/ips/event', { _limit: 3000, _sort: '-time' });
    const ips24 = ips.filter(e => tOf(e) >= dayAgo);
    const detected = ips24.length;
    const blocked = ips24.filter(e => /drop|block|reject/i.test(e.action || e.inner_alert_action || '')).length;
    if (DEBUG && ips[0]) log('[unifi-threats] IPS-Beispiel: ' + JSON.stringify(ips[0]).slice(0, 400));

    // ── Honeypot — kommt i.d.R. als Alarm/Event; lose nach "honeypot" gematcht ──
    let honeypot = 0;
    try {
      const alarms = await apiPost('/stat/alarm', { _limit: 3000, archived: false });
      honeypot = alarms.filter(a => tOf(a) >= dayAgo && /honeypot/i.test(JSON.stringify(a))).length;
      if (DEBUG && alarms[0]) log('[unifi-threats] Alarm-Beispiel: ' + JSON.stringify(alarms[0]).slice(0, 400));
    } catch (e) { log('[unifi-threats] Alarm-Abruf übersprungen: ' + e.message, 'warn'); }

    await setVal(BASE + '.detected_24h', detected, 'Threats Detected (24h)');
    await setVal(BASE + '.blocked_24h', blocked, 'Threats Blocked (24h)');
    await setVal(BASE + '.honeypot_24h', honeypot, 'Honeypot Triggered (24h)');
    await setVal(BASE + '.lastUpdate', now, 'Last Update');
    log('[unifi-threats] detected=' + detected + ' blocked=' + blocked + ' honeypot=' + honeypot);
  } catch (e) {
    log('[unifi-threats] Fehler: ' + e.message, 'error');
    session = null; // Re-Login beim nächsten Lauf erzwingen
  }
}

const _created = {};
async function setVal(id, val, name) {
  if (!_created[id]) {
    await createStateAsync(id, val, false, { name: name || id.split('.').pop(), type: 'number', role: 'value', read: true, write: false });
    _created[id] = true;
  }
  await setStateAsync(id, val, true);
}

poll();
setInterval(poll, INTERVAL_SEC * 1000);
