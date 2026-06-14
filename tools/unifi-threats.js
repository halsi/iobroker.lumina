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
//    Kein Count-Feld in der Antwort -> Pagination bis Limit (MAX_PAGES) zum exakten Zaehlen.
const V2 = '/proxy/network/v2/api/site/' + SITE;

const PAGE = 100, MAX_PAGES = 10;   // Pagination bis 1000 Flows

async function trafficFlows(policyTypes, actions, windowMs) {
  if (!session) await login();
  const now = Date.now();
  const path = V2 + '/traffic-flows';
  let all = [], status = 0, capped = false;
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    const body = {
      timestampFrom: now - (windowMs || 24 * 3600 * 1000), timestampTo: now,
      pageNumber: pg, pageSize: PAGE, skip_count: true,
      policy_type: policyTypes,
      risk: [], action: actions || [], direction: [], protocol: [], policy: [],
      service: [], source_host: [], source_mac: [], source_ip: [], source_port: [],
      source_network_id: [], source_domain: [], source_zone_id: [], source_region: [],
      destination_host: [], destination_mac: [], destination_ip: [], destination_port: [],
      destination_network_id: [], destination_domain: [], destination_zone_id: [], destination_region: [],
      in_network_id: [], out_network_id: [], next_ai_query: [], except_for: [], search_text: '',
    };
    let res = await httpReq('POST', path, { body, cookie: session.cookie, csrf: session.csrf });
    if (res.status === 401) { await login(); res = await httpReq('POST', path, { body, cookie: session.cookie, csrf: session.csrf }); }
    status = res.status;
    if (res.status !== 200) { dlog('[unifi-threats] traffic-flows ' + JSON.stringify(policyTypes) + ' p' + pg + ' → HTTP ' + res.status + ' ' + (res.body || '').replace(/\s+/g, ' ').slice(0, 200)); break; }
    let json = {}; try { json = JSON.parse(res.body); } catch (e) {}
    const data = Array.isArray(json) ? json : (json.data || json.flows || []);
    all = all.concat(data);
    if (data.length < PAGE) break;             // letzte (Teil-)Seite
    if (pg === MAX_PAGES - 1) capped = true;    // Limit erreicht
  }
  dlog('[unifi-threats] traffic-flows ' + JSON.stringify(policyTypes) + (actions ? ' act=' + JSON.stringify(actions) : '') +
       ' → total=' + all.length + (capped ? '+' : '') + ' (HTTP ' + status + ')');
  return { status, data: all, count: all.length, capped };
}

async function poll() {
  try {
    const det = await trafficFlows(['INTRUSION_PREVENTION']);
    const detected = det.status === 200 ? det.count : 0;

    // blocked: aus denselben Detected-Flows (action === 'blocked')
    const blocked = det.data.filter(e => String(e.action || '').toLowerCase() === 'blocked').length;

    // honeypot: policy_type PROTECTION, Flows mit policies[].internal_type === 'HONEYPOT'
    const hp = await trafficFlows(['PROTECTION']);
    const hpFlows = (hp.status === 200 ? hp.data : []).filter(e =>
      Array.isArray(e.policies) && e.policies.some(p => /honeypot/i.test((p.internal_type || '') + (p.name || ''))));
    // distinct Quell-Hosts statt roher Flow-Zahl
    const honeypot = new Set(hpFlows.map(e => (e.source && (e.source.ip || e.source.mac || e.source.id)) || '?')).size;

    if (DEBUG && det.data[0]) dlog('[unifi-threats] Sample: ' + JSON.stringify(det.data[0]).slice(0, 700));

    await setVal(BASE + '.ThreatsDetected-24h', detected, 'Threats Detected (24h)');
    await setVal(BASE + '.ThreatsBlocked-24h', blocked, 'Threats Blocked (24h)');
    await setVal(BASE + '.HoneypotTriggered-24h', honeypot, 'Honeypot Triggered (24h)');
    dlog('[unifi-threats] detected=' + detected + ' blocked=' + blocked + ' honeypot=' + honeypot);

    // ── FlowMap (Daten fuer flowmap.html) ──
    const fts = e => e.flow_start_time || e.flow_end_time || e.time || 0;
    const ccOf = e => (e.destination && e.destination.region) || (e.source && e.source.region) || null;
    const now2 = Date.now(), h12 = now2 - 12 * 3600 * 1000;

    // aktuelle Flows (~15 min, alle Policy-Typen) -> nach Ziel-/Quell-Land
    const ALLPT = ['FIREWALL','AD_BLOCKING','NEXT_AI','QOS','INTRUSION_PREVENTION','PROTECTION','PORT_FORWARDING','SOURCE_NAT','DESTINATION_NAT','CONTENT_FILTERING','MASQUERADE_NAT'];
    const cur = await trafficFlows(ALLPT, null, 15 * 60 * 1000);
    const flowsByCC = {};
    cur.data.forEach(e => { const cc = ccOf(e); if (cc) flowsByCC[cc] = (flowsByCC[cc] || 0) + 1; });

    // Threats letzte 12h aus det (IPS) + hpFlows (Honeypot) -> nach Land + hoechster Schwere
    const sevRank = { detected: 1, honeypot: 2, blocked: 3 };
    const thByCC = {}, recent = [];
    const addThreat = (e, type) => {
      if (fts(e) !== 0 && fts(e) < h12) return;
      const cc = ccOf(e);
      recent.push({ t: fts(e) || now2, cc: cc || '?', type, dst: (e.destination && (e.destination.zone_name || e.destination.network_name)) || '' });
      if (cc) { const c = thByCC[cc] || { n: 0, sev: 'detected' }; c.n++; if (sevRank[type] > sevRank[c.sev]) c.sev = type; thByCC[cc] = c; }
    };
    det.data.forEach(e => addThreat(e, String(e.action || '').toLowerCase() === 'blocked' ? 'blocked' : 'detected'));
    hpFlows.forEach(e => addThreat(e, 'honeypot'));
    recent.sort((a, b) => b.t - a.t);

    await setJson(BASE + '.FlowMap', {
      ts: now2,
      flows: Object.entries(flowsByCC).map(([cc, n]) => ({ cc, n })).sort((a, b) => b.n - a.n).slice(0, 60),
      threats: Object.entries(thByCC).map(([cc, v]) => ({ cc, n: v.n, sev: v.sev })),
      recent: recent.slice(0, 12),
    }, 'Flow Map (JSON)');
    dlog('[unifi-threats] flowmap: flows=' + cur.data.length + ' countries=' + Object.keys(flowsByCC).length + ' threats=' + Object.keys(thByCC).length);
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

const _createdJson = {};
async function setJson(id, obj, name) {
  if (!_createdJson[id]) {
    if (!existsState(id)) await createStateAsync(id, '', false, { name: name || id.split('.').pop(), type: 'string', role: 'json', read: true, write: false });
    _createdJson[id] = true;
  }
  await setStateAsync(id, JSON.stringify(obj), true);
}

poll();
setInterval(poll, INTERVAL_SEC * 1000);
