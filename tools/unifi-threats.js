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

const BASE = '0_userdata.0.Network.Unifi';
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

// stat/event und stat/alarm sind GET (3000 neueste). Fallback auf POST für
// abweichende Versionen. stat/ips/event existiert in Network 10.x nicht mehr.
async function apiList(endpoint, query) {
  if (!session) await login();
  const path = '/proxy/network/api/s/' + SITE + endpoint;
  const qs = query ? ('?' + query) : '';
  let res = await httpReq('GET', path + qs, { cookie: session.cookie, csrf: session.csrf });
  if (res.status === 401) { await login(); res = await httpReq('GET', path + qs, { cookie: session.cookie, csrf: session.csrf }); }
  if (res.status === 404 || res.status === 405) { res = await httpReq('POST', path, { body: {}, cookie: session.cookie, csrf: session.csrf }); }
  if (DEBUG) log('[unifi-threats] ' + endpoint + qs + ' → HTTP ' + res.status);
  if (res.status !== 200) throw new Error(endpoint + ' HTTP ' + res.status);
  return JSON.parse(res.body).data || [];
}

function tOf(e) { return e.time || e.timestamp || (e.datetime ? Date.parse(e.datetime) : 0); }

// Erkennungs-Heuristiken — nach DEBUG-Sample ggf. feinjustieren
function isThreat(e)   { return /ips|ids|threat|inner_alert|EVT_IPS/i.test(JSON.stringify(e)); }
function isBlocked(e)  { return /drop|block|reject/i.test(e.inner_alert_action || e.action || ''); }
function isHoneypot(e) { return /honeypot/i.test(JSON.stringify(e)); }

async function poll() {
  try {
    const now = Date.now(), dayAgo = now - 24 * 3600 * 1000;

    // System-Events (enthält IDS/IPS- und Honeypot-Meldungen)
    const events = await apiList('/stat/event');
    const ev24 = events.filter(e => tOf(e) >= dayAgo);
    const threats = ev24.filter(isThreat);
    let detected = threats.length;
    let blocked  = threats.filter(isBlocked).length;
    let honeypot = ev24.filter(isHoneypot).length;

    // Alarme zusätzlich für Honeypot heranziehen
    try {
      const alarms = await apiList('/stat/alarm', 'archived=false');
      honeypot += alarms.filter(a => tOf(a) >= dayAgo && isHoneypot(a)).length;
      if (DEBUG && alarms[0]) log('[unifi-threats] Alarm-Beispiel: ' + JSON.stringify(alarms[0]).slice(0, 600));
    } catch (e) { log('[unifi-threats] Alarm-Abruf übersprungen: ' + e.message, 'warn'); }

    if (DEBUG) { const s = events.find(isThreat) || events[0]; if (s) log('[unifi-threats] Event-Beispiel: ' + JSON.stringify(s).slice(0, 600)); }

    await setVal(BASE + '.ThreatsDetected-24h', detected, 'Threats Detected (24h)');
    await setVal(BASE + '.ThreatsBlocked-24h', blocked, 'Threats Blocked (24h)');
    await setVal(BASE + '.HoneypotTriggered-24h', honeypot, 'Honeypot Triggered (24h)');
    log('[unifi-threats] detected=' + detected + ' blocked=' + blocked + ' honeypot=' + honeypot);
  } catch (e) {
    log('[unifi-threats] Fehler: ' + e.message, 'error');
    session = null; // Re-Login beim nächsten Lauf erzwingen
  }
}

const _created = {};
async function setVal(id, val, name) {
  if (!_created[id]) {
    if (!existsState(id)) await createStateAsync(id, val, false, { name: name || id.split('.').pop(), type: 'number', role: 'value', read: true, write: false });
    _created[id] = true;
  }
  await setStateAsync(id, val, true);
}

poll();
setInterval(poll, INTERVAL_SEC * 1000);
