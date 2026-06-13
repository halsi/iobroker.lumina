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

const HOST = '1.1.1.1';          // <-- UDM Pro IP eintragen
const PORT = 443;
const USER = 'exampleuser';      // <-- lokaler UniFi-OS-User eintragen
const PASS = 'DEIN_PASSWORT';    // <-- eintragen
const SITE = 'default';
const INTERVAL_SEC = 60;
const DEBUG = true;              // nach erfolgreicher Justierung auf false

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const BASE = '0_userdata.0.Network.Unifi';
let session = null;              // { cookie, csrf }

// Bei DEBUG=true alle Meldungen als WARN ausgeben — sichtbar auch bei Instanz-Loglevel "warn".
// (Fehler/explizite Level bleiben sonst erhalten.)
function dlog(msg, level) { log(msg, DEBUG ? 'warn' : (level || 'info')); }

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
  dlog('[unifi-threats] Login OK');
}

// ── UniFi Network 10.x: IDS/IPS-Threats via v2 traffic-flows ──────────────
//    POST /proxy/network/v2/api/site/<site>/traffic-flows mit policy_type-Filter.
//    skip_count:false → Server liefert Gesamt-Count (kein Paging nötig).
const V2 = '/proxy/network/v2/api/site/' + SITE;

async function trafficFlows(policyTypes, actions) {
  if (!session) await login();
  const now = Date.now();
  const body = {
    timestampFrom: now - 24 * 3600 * 1000,
    timestampTo: now,
    pageNumber: 0,
    pageSize: 100,
    skip_count: false,
    policy_type: policyTypes,
    risk: [], action: actions || [], direction: [], protocol: [], policy: [],
    service: [], source_host: [], source_mac: [], source_ip: [], source_port: [],
    source_network_id: [], source_domain: [], source_zone_id: [], source_region: [],
    destination_host: [], destination_mac: [], destination_ip: [], destination_port: [],
    destination_network_id: [], destination_domain: [], destination_zone_id: [], destination_region: [],
    in_network_id: [], out_network_id: [], next_ai_query: [], except_for: [], search_text: '',
  };
  const path = V2 + '/traffic-flows';
  let res = await httpReq('POST', path, { body, cookie: session.cookie, csrf: session.csrf });
  if (res.status === 401) { await login(); res = await httpReq('POST', path, { body, cookie: session.cookie, csrf: session.csrf }); }
  let json = {}; try { json = JSON.parse(res.body); } catch (e) {}
  const data = Array.isArray(json) ? json : (json.data || json.flows || []);
  const count = (typeof json.count === 'number') ? json.count
              : (typeof json.total_count === 'number') ? json.total_count
              : (typeof json.totalCount === 'number') ? json.totalCount : data.length;
  dlog('[unifi-threats] traffic-flows ' + JSON.stringify(policyTypes) + (actions ? ' act=' + JSON.stringify(actions) : '') +
       ' → HTTP ' + res.status + ' count=' + count + ' len=' + data.length +
       (res.status !== 200 ? ' ' + (res.body || '').replace(/\s+/g, ' ').slice(0, 400) : ''));
  return { status: res.status, data, count };
}

async function poll() {
  try {
    const det = await trafficFlows(['INTRUSION_PREVENTION']);
    const hp  = await trafficFlows(['HONEYPOT']); // ungültiger policy_type -> Fehlertext listet gültige Werte

    const detected = det.status === 200 ? det.count : 0;
    // serverseitiger action-Filter wird abgelehnt -> blocked clientseitig zählen (action != 'allowed')
    const blocked  = det.data.filter(e => String(e.action || '').toLowerCase() !== 'allowed').length;
    const honeypot = hp.status === 200 ? hp.count : 0;

    if (DEBUG && det.data[0]) dlog('[unifi-threats] Sample: ' + JSON.stringify(det.data[0]).slice(0, 700));

    await setVal(BASE + '.ThreatsDetected-24h', detected, 'Threats Detected (24h)');
    await setVal(BASE + '.ThreatsBlocked-24h', blocked, 'Threats Blocked (24h)');
    await setVal(BASE + '.HoneypotTriggered-24h', honeypot, 'Honeypot Triggered (24h)');
    dlog('[unifi-threats] detected=' + detected + ' blocked=' + blocked + ' honeypot=' + honeypot);
  } catch (e) {
    dlog('[unifi-threats] Fehler: ' + e.message, 'error');
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
