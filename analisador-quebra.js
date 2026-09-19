(() => {
'use strict';
const KEYWORDS = ['PIX','CPF','CNPJ','BANCO','ARMA','DROGA','NOME','TELEFONE','VALOR','IMEI','PLACA'];
const MAX_NEST = 16;
const NA = 'Não disponível na produção';
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dash = v => (v === 0 ? '0' : (v ? esc(v) : '<span class="na">' + NA + '</span>'));
const plain = v => (v === 0 ? '0' : (v ? String(v) : NA));
const uniq = a => [...new Set((a || []).filter(Boolean))];
const fold = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const emails = t => uniq((String(t || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig) || []).map(x => x.toLowerCase()));
const phones = t => uniq(String(t || '').match(/(?:\+?55[\s\-]?)?(?:\(?\d{2}\)?[\s\-]?)?\d{4,5}[\s\-]?\d{4}/g) || []);
const ips = t => uniq(String(t || '').match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g) || []);
const links = t => uniq(String(t || '').match(/https?:\/\/[^\s<>"']+/ig) || []);
const tick = () => new Promise(r => setTimeout(r, 0));

function luhnOk(d) {
  if (!/^\d{14,16}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let n = +d[d.length - 1 - i];
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    s += n;
  }
  return s % 10 === 0;
}
function imei(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) {
    for (const x of '0123456789') if (luhnOk(d + x)) return d + x;
    return d;
  }
  return d.length >= 15 ? d.slice(0, 15) : '';
}
function parseDt(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    let n = Number(v);
    if (n > 1e14) n /= 1e6;
    else if (n > 1e11) n /= 1e3;
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  if (/[A-Za-z]{3},/.test(s) || /GMT|UTC|[+-]\d{4}/.test(s)) {
    const rfc = new Date(s);
    return isNaN(rfc) ? null : rfc;
  }
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d) ? null : d;
}
const fmt = v => {
  const d = parseDt(v);
  return d ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d) : '';
};
const fmtDate = v => {
  const d = parseDt(v);
  return d ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d) : '';
};
const fmtTime = v => {
  const d = parseDt(v);
  return d ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d) : '';
};
function crimeHours() {
  const sel = $('crimeWindow')?.value;
  if (sel === 'custom') return Number($('crimeWindowCustom').value || 24);
  return Number(sel || 24);
}
function nearCrime(ts) {
  const crime = parseDt($('crimeDate').value);
  const d = parseDt(ts);
  if (!crime || !d) return false;
  return Math.abs(d - crime) <= crimeHours() * 3600 * 1000;
}
function inRange(ts, fromEl, toEl) {
  const t = parseDt(ts);
  const from = parseDt($(fromEl)?.value);
  const to = parseDt($(toEl)?.value);
  if (from && t && t < from) return false;
  if (to && t && t > to) return false;
  return true;
}
function table(headers, rows) {
  if (!rows.length) return '<div class="notice">Nenhum registro nesta aba. Importe o ZIP da quebra.</div>';
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return null;
  const map = {};
  Object.keys(obj).forEach(k => { map[fold(k).replace(/[\s_\-]/g, '')] = obj[k]; });
  for (const n of names) {
    const key = fold(n).replace(/[\s_\-]/g, '');
    if (map[key] != null && map[key] !== '') return map[key];
  }
  return null;
}
function walkObjs(payload) {
  if (Array.isArray(payload)) return payload.filter(x => x && typeof x === 'object' && !Array.isArray(x));
  if (!payload || typeof payload !== 'object') return [];
  for (const k of ['events','items','activities','records','locations','transactions','messages','Browser History','history','entries']) {
    if (Array.isArray(payload[k])) return payload[k].filter(x => x && typeof x === 'object');
  }
  return [payload];
}

const PRODUCT_RULES = [
  ['whatsapp', /whatsapp|msgstore\.db\.crypt|wa\.db/i],
  ['photos', /googlephotos|photoresourcelegal|google photos/i],
  ['gmail', /\.mbox$|mail\.messages|mail\.messageinformation|\/mail\/|takeout\/mail/i],
  ['access_log', /accesslogactivity|access.?log/i],
  ['activity', /myactivity|my activity/i],
  ['android_device', /androiddeviceconfiguration|deviceanduserprofile|android device/i],
  ['account', /googleaccount|subscriberinfo|subscriber/i],
  ['pay', /googlepay|google pay|invoicingtransaction|storedvalue|billinginformation|consumertransactions/i],
  ['chrome', /chrome\.history|chrome\.bookmarks|chrome\.addresses|\/chrome\//i],
  ['timeline', /timeline\.|semanticlocation|userlocationprofile|location history|records\.json|timelineedits|tombstones|encryptedbackups/i],
  ['drive_backup', /drivemobilebackups|mobile backups/i],
  ['drive', /drive\.drivefiles|\/drive\/|google drive/i]
];
const LABELS = {
  account: 'Google Account', android_device: 'Android Device', gmail: 'Mail', photos: 'Google Photos',
  timeline: 'Timeline', pay: 'Google Pay', activity: 'My Activity', access_log: 'Access Log Activity',
  chrome: 'Chrome', drive: 'Drive', drive_backup: 'Drive Mobile Backups', whatsapp: 'WhatsApp backup',
  zip: 'ZIP interno', outros: 'Outros'
};
function classify(path) {
  const p = path.replace(/\\/g, '/');
  if (/\.zip$/i.test(p)) return 'zip';
  for (const [key, re] of PRODUCT_RULES) if (re.test(p)) return key;
  return 'outros';
}
function looksLikeZip(name, u8) {
  if (/\.zip$/i.test(name)) return true;
  return !!(u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5 || u8[2] === 7));
}

const DB = emptyDb();
function emptyDb() {
  return {
    products: {}, imports: [], files: [], zips: [], accounts: [], devices: [], events: [],
    locations: [], photos: [], drive: [], emails: [], payments: [], searches: [], backups: [],
    access: [], chrome: [], index: [], ext: {}
  };
}
function reset() {
  Object.keys(DB).forEach(k => delete DB[k]);
  Object.assign(DB, emptyDb());
}

async function sha256(buf) {
  const data = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer) ? buf : new Uint8Array(buf);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function htmlTables(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const map = {};
  doc.querySelectorAll('tr').forEach(tr => {
    const cells = [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (cells.length >= 2) {
      const k = cells[0];
      const v = cells.slice(1).join(' | ');
      map[k] = map[k] && map[k] !== v ? map[k] + ' | ' + v : v;
    }
  });
  return map;
}

function addIndex(rec) {
  if (!rec.text) return;
  DB.index.push(rec);
}

function addEvent(partial) {
  DB.events.push(partial);
}

async function walkZip(buf, originZip, prefix, depth, bag) {
  if (depth > MAX_NEST) return;
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch (_) { return; }
  const entries = [];
  zip.forEach((path, file) => { if (!file.dir) entries.push({ path, file }); });
  for (const { path, file } of entries) {
    const name = path.split('/').pop();
    const full = prefix ? prefix + '!' + path.replace(/\\/g, '/') : path.replace(/\\/g, '/');
    const ext = (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '').toLowerCase();
    const size = (file._data && file._data.uncompressedSize) || file.uncompressedSize || 0;
    let header = null;
    const maybeZip = /\.zip$/i.test(name) || !ext || /^(bin|dat|lers)$/.test(ext);
    let innerBuf = null;
    if (maybeZip) {
      innerBuf = await file.async('arraybuffer');
      header = new Uint8Array(innerBuf.slice(0, 8));
    }
    const isZip = looksLikeZip(name, header);
    const product = classify(full);
    const rec = { path: full, name, ext: isZip ? 'zip' : ext, size, originZip, product, account: '', depth, isZip, sha256: '' };
    bag.files.push(rec);
    bag.ext[rec.ext || '(sem)'] = (bag.ext[rec.ext || '(sem)'] || 0) + 1;
    bag.products[product] = bag.products[product] || { key: product, name: LABELS[product] || product, n: 0 };
    bag.products[product].n++;
    if (isZip) {
      bag.zips.push({ path: full, name, originZip, depth, size });
      $('progress').textContent = 'Abrindo ZIP interno (' + bag.zips.length + '): ' + name;
      await tick();
      const hashBuf = innerBuf || await file.async('arraybuffer');
      rec.sha256 = await sha256(hashBuf);
      await walkZip(hashBuf, full, full, depth + 1, bag);
    } else {
      bag.payloads.push({ rec, file });
    }
  }
}

function parseAccount(text, path) {
  let map = {};
  try { if (/\.json$/i.test(path)) map = JSON.parse(text) || {}; } catch (_) {}
  if (Array.isArray(map)) map = map[0] || {};
  if (!map || typeof map !== 'object' || !Object.keys(map).length) map = htmlTables(text);
  const blob = JSON.stringify(map) + ' ' + text;
  const em = emails(blob);
  const rec = {
    google_account: pick(map, ['Primary Email', 'email', 'e-mail', 'google account']) || em[0] || '',
    display_name: pick(map, ['Name', 'nome', 'Full Name', 'display name', 'given name']) || '',
    primary_email: pick(map, ['Primary Email', 'email', 'e-mail']) || em[0] || '',
    alternate_emails: uniq(em.slice(1).concat(emails(pick(map, ['Alternate Emails', 'Alternate e-Mails', 'alternateEmails']) || ''))),
    phones: phones(blob),
    created_on: pick(map, ['Account Created', 'created', 'Created on', 'creation time']),
    last_activity: pick(map, ['Last Activity', 'last login', 'Last Logins']),
    status: pick(map, ['Status', 'account status', 'state']) || '',
    deletion_date: pick(map, ['Deletion Date', 'deleted', 'disabled on']),
    identifiers: pick(map, ['Gaia ID', 'gaiaId', 'customerId', 'accountId', 'id']) || '',
    extra: map,
    source: path
  };
  rec.alternate_emails = rec.alternate_emails.filter(e => e !== rec.primary_email);
  if (!rec.primary_email && !rec.google_account) return;
  rec.google_account = rec.google_account || rec.primary_email;
  DB.accounts.push(rec);
}

function parseDevices(text, path) {
  let items = [];
  try {
    if (/\.json$/i.test(path)) {
      const p = JSON.parse(text);
      items = Array.isArray(p) ? p : (p.devices || [p]);
    }
  } catch (_) {}
  if (!items.length) {
    const map = htmlTables(text);
    if (Object.keys(map).length) items = [map];
  }
  items.forEach(obj => {
    if (!obj || typeof obj !== 'object') return;
    const d = {
      imei1: '', imei2: '', meid: pick(obj, ['meid', 'MEID']) || '',
      model: pick(obj, ['modelName', 'model', 'Modelo', 'deviceModel']) || '',
      manufacturer: pick(obj, ['manufacturer', 'Fabricante', 'brand']) || '',
      serial: pick(obj, ['serialNumber', 'serial', 'série']) || '',
      android_id: pick(obj, ['androidId', 'android id']) || '',
      first: pick(obj, ['firstRegistrationTime', 'firstSeen']),
      last: pick(obj, ['lastUsedTime', 'lastSeen', 'lastActivity']),
      accounts: emails(JSON.stringify(obj)),
      source: path
    };
    (obj.deviceData || obj.hardware || []).forEach(x => {
      if (!x || typeof x !== 'object') return;
      const lab = String(x.displayName || x.key || '');
      const val = String(x.value || x.data || '');
      if (/meid/i.test(lab)) d.meid = d.meid || val;
      else if (/imei\s*2/i.test(lab)) d.imei2 = imei(val);
      else if (/imei/i.test(lab)) d.imei1 = d.imei1 || imei(val);
      else if (/serial/i.test(lab)) d.serial = d.serial || val;
    });
    (obj.userInfo || obj.users || []).forEach(u => { d.accounts.push(...emails(JSON.stringify(u))); });
    d.accounts = uniq(d.accounts);
    d.imei1 = d.imei1 || imei(obj.imei1 || obj.imei);
    d.imei2 = d.imei2 || imei(obj.imei2);
    if (d.imei1 || d.model || d.serial || d.android_id || d.meid) DB.devices.push(d);
  });
}

function coord(v) {
  if (v == null || v === '') return null;
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 180) n /= 1e7;
  return n;
}
function addLoc(rec) {
  if (rec.lat == null || rec.lon == null) return;
  DB.locations.push(rec);
  addEvent({ ts: rec.ts, type: 'localizacao', product: 'Timeline', device: rec.device, desc: rec.place || `Lat ${rec.lat}, Lon ${rec.lon}`, lat: rec.lat, lon: rec.lon });
}
function parseLocations(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  if (payload.timelineObjects) {
    payload.timelineObjects.forEach(o => {
      const v = o.placeVisit || o.activitySegment;
      if (!v) return;
      const loc = v.location || (v.startLocation) || {};
      const dur = v.duration || {};
      const start = parseDt(dur.startTimestamp || dur.startTimestampMs);
      const end = parseDt(dur.endTimestamp || dur.endTimestampMs);
      addLoc({
        ts: start, lat: coord(loc.latitudeE7 || loc.latitude), lon: coord(loc.longitudeE7 || loc.longitude),
        accuracy: loc.accuracy || null, duration: start && end ? Math.max(0, (end - start) / 1000) : null,
        place: loc.name || loc.address || '', source: 'SemanticLocationHistory', device: null, activity: v.activityType || ''
      });
    });
    return;
  }
  walkObjs(payload).forEach(item => {
    const lat = coord(pick(item, ['latitudeE7', 'latitude', 'lat']));
    const lon = coord(pick(item, ['longitudeE7', 'longitude', 'lng', 'lon']));
    if (lat == null || lon == null) return;
    addLoc({
      ts: parseDt(pick(item, ['timestamp', 'timestampMs', 'time', 'startTime'])),
      lat, lon, accuracy: pick(item, ['accuracy']), duration: null,
      place: pick(item, ['place', 'name', 'address']) || '', source: path, device: pick(item, ['deviceTag', 'device'])
    });
  });
}

function parseActivity(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  walkObjs(payload).forEach(rec => {
    const title = pick(rec, ['title', 'description', 'activity']) || '';
    const ts = parseDt(pick(rec, ['time', 'timestamp', 'date']));
    const header = pick(rec, ['header', 'product']) || '';
    const product = /search/i.test(path) || /search/i.test(header) ? 'Google Search' : (header || 'My Activity');
    const device = (rec.deviceInformation && rec.deviceInformation.deviceType) || pick(rec, ['device']) || '';
    const url = pick(rec, ['titleUrl', 'url']) || ((rec.locationInfos || [])[0] && rec.locationInfos[0].url) || '';
    addEvent({ ts, type: 'atividade', product, device, desc: title || url, url });
    if (product === 'Google Search' || /^Pesquisou por |^Searched for /i.test(title)) {
      DB.searches.push({ query: title.replace(/^Pesquisou por |^Searched for |^You searched for /i, ''), ts, device, product, url });
    }
  });
}

function parseAccess(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) {
    const map = htmlTables(text);
    if (!Object.keys(map).length) return;
    payload = [map];
  }
  walkObjs(payload).forEach(rec => {
    const ts = parseDt(pick(rec, ['timestamp', 'time', 'date', 'eventTime']));
    const ip = pick(rec, ['ipAddress', 'ip', 'IP']) || ips(JSON.stringify(rec))[0] || '';
    const ev = {
      ts, service: pick(rec, ['service', 'product', 'application']) || '',
      event: pick(rec, ['event', 'activity', 'action', 'type', 'title']) || '',
      device: pick(rec, ['device', 'deviceType', 'userAgent']) || '',
      ip, location: pick(rec, ['location', 'city', 'country']) || '',
      account: emails(JSON.stringify(rec))[0] || '',
      extra: pick(rec, ['id', 'resource']) || '',
      source: path
    };
    if (!ev.ts && !ev.ip && !ev.event) return;
    DB.access.push(ev);
    addEvent({ ts, type: 'access_log', product: 'Access Log Activity', device: ev.device, desc: [ev.service, ev.event, ev.ip].filter(Boolean).join(' · ') });
    if (ev.ip) addIndex({ file: path, product: 'Access Log Activity', ts, account: ev.account, context: 'IP', text: ev.ip + ' ' + ev.event });
  });
}

function parseChrome(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  const hist = payload['Browser History'] || payload.history || (Array.isArray(payload) ? payload : null);
  if (Array.isArray(hist)) {
    hist.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const ts = parseDt(item.time_usec || item.time || item.last_visit_time);
      DB.chrome.push({
        kind: 'histórico', title: item.title || '', url: item.url || item.origin || '',
        ts, extra: item.client_id || item.visit_count || '', source: path
      });
      addEvent({ ts, type: 'chrome', product: 'Chrome', device: '', desc: (item.title || item.url || '') });
    });
  }
  function walkBm(node, folder) {
    if (!node || typeof node !== 'object') return;
    if (node.url) {
      DB.chrome.push({ kind: 'favorito', title: node.name || node.title || '', url: node.url, ts: parseDt(node.date_added || node.dateAdded), extra: folder, source: path });
    }
    (node.children || []).forEach(ch => walkBm(ch, (folder ? folder + '/' : '') + (node.name || node.title || '')));
  }
  if (payload.roots) Object.values(payload.roots).forEach(r => walkBm(r, ''));
  else if (payload.roots === undefined && payload.children) walkBm(payload, '');
  const addr = payload.Autofill || payload.addresses || payload.Profiles;
  (Array.isArray(addr) ? addr : []).forEach(a => {
    if (!a || typeof a !== 'object') return;
    const line = [a.name, a.street_address, a.city, a.state, a.zipcode, a.country_code].filter(Boolean).join(', ');
    if (line) DB.chrome.push({ kind: 'endereço', title: a.name || '', url: '', ts: parseDt(a.use_date), extra: line, source: path });
  });
}

function parseDrive(name, text, path, rec) {
  let meta = {};
  try { if (/\.json$/i.test(path)) meta = JSON.parse(text) || {}; } catch (_) {}
  const hits = KEYWORDS.filter(k => fold(name + '\n' + text).includes(fold(k)));
  const row = {
    name, type: rec.ext, mime: pick(meta, ['mimeType', 'mime']) || '',
    size: rec.size || pick(meta, ['size']) || '',
    created: pick(meta, ['createdTime', 'creationTime', 'created']),
    modified: pick(meta, ['modifiedTime', 'modified']),
    owner: pick(meta, ['owner', 'owners']) || '',
    share: pick(meta, ['shared', 'sharing', 'permissions']) || '',
    id: pick(meta, ['id', 'docId']) || '',
    keywords: hits, path, text: text.slice(0, 4000)
  };
  DB.drive.push(row);
  if (hits.length) addEvent({ ts: parseDt(row.modified || row.created) || new Date(), type: 'arquivo_relevante', product: 'Drive', device: '', desc: name + ' — ' + hits.join(', ') });
  addIndex({ file: path, product: 'Drive', ts: row.modified, account: '', context: name, text: name + '\n' + text.slice(0, 8000) });
}

function parseMbox(text, path) {
  const chunks = text.split(/^From /m).filter(Boolean);
  chunks.forEach(raw => {
    const head = raw.slice(0, 8000);
    const get = k => {
      const m = head.match(new RegExp('^' + k + ':\\s*(.+)$', 'im'));
      return m ? m[1].trim() : '';
    };
    const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n').slice(0, 12000);
    const blob = head + '\n' + body;
    const attach = uniq((raw.match(/filename="?([^"\n;]+)"?/ig) || []).map(x => x.replace(/filename="?/i, '').replace(/"$/, '')));
    const rec = {
      id: get('Message-ID') || get('Message-Id'),
      from: get('From'), to: get('To'), cc: get('Cc'),
      date: parseDt(get('Date')), subject: get('Subject'),
      body, ip: ips(head)[0] || '',
      links: links(blob), phones: phones(blob), emails: emails(blob),
      attach, headers: head.slice(0, 2000), source: path
    };
    DB.emails.push(rec);
    addEvent({ ts: rec.date, type: 'email', product: 'Mail', device: '', desc: rec.subject || '(sem assunto)' });
    addIndex({ file: path, product: 'Mail', ts: rec.date, account: rec.to || rec.from, context: rec.subject, text: blob });
  });
}

function parsePayCsv(text, path) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return;
  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase());
  const idx = n => headers.findIndex(h => h.includes(n));
  lines.slice(1).forEach(line => {
    const cols = line.split(/[,;\t]/);
    const rec = {
      kind: cols[idx('type')] || cols[idx('tipo')] || 'transação',
      desc: cols[idx('description')] || cols[idx('merchant')] || cols[idx('comerciante')] || line,
      amount: cols[idx('amount')] || cols[idx('valor')] || '',
      currency: cols[idx('currency')] || cols[idx('moeda')] || '',
      ts: parseDt(cols[idx('date')] || cols[idx('time')] || cols[idx('data')]),
      id: cols[idx('id')] || cols[idx('transaction')] || '',
      instrument: cols[idx('instrument')] || cols[idx('card')] || '',
      profile: cols[idx('profile')] || '',
      source: path
    };
    DB.payments.push(rec);
    addEvent({ ts: rec.ts, type: 'pagamento', product: 'Google Pay', device: '', desc: rec.desc + ' ' + rec.amount });
    addIndex({ file: path, product: 'Google Pay', ts: rec.ts, account: '', context: rec.desc, text: line });
  });
}
function parsePayJson(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  walkObjs(payload).forEach(item => {
    const rec = {
      kind: pick(item, ['type', 'kind', 'transactionType']) || (item.last4 ? 'cartão' : 'transação'),
      desc: pick(item, ['description', 'merchant', 'title', 'profileName', 'name']) || (item.last4 ? ('****' + item.last4) : ''),
      amount: pick(item, ['amount', 'value', 'total']) || '',
      currency: pick(item, ['currency']) || '',
      ts: parseDt(pick(item, ['date', 'timestamp', 'created', 'time'])),
      id: pick(item, ['transactionId', 'id']) || '',
      instrument: pick(item, ['instrument', 'paymentMethod', 'network']) || '',
      profile: pick(item, ['profileName', 'profile']) || '',
      source: path
    };
    if (!rec.desc && !rec.amount && !rec.id) return;
    DB.payments.push(rec);
    addEvent({ ts: rec.ts, type: 'pagamento', product: 'Google Pay', device: '', desc: rec.desc + ' ' + rec.amount });
  });
}

function parseBackup(name, text, path, rec) {
  let meta = {};
  try { if (/\.json$/i.test(path)) meta = JSON.parse(text) || {}; } catch (_) {}
  DB.backups.push({
    name, date: parseDt(pick(meta, ['date', 'created', 'timestamp'])) || '',
    size: rec.size || pick(meta, ['size']) || '',
    device: pick(meta, ['device', 'model', 'deviceName']) || '',
    account: emails(text)[0] || pick(meta, ['account', 'email']) || '',
    type: /crypt/i.test(name) ? 'WhatsApp cifrado' : (pick(meta, ['type', 'backupType']) || rec.ext),
    note: /crypt/i.test(name) ? 'Backup cifrado. Sem tentativa de quebra de cifra.' : (pick(meta, ['note']) || ''),
    path
  });
  addEvent({ ts: parseDt(pick(meta, ['date', 'created'])) || new Date(), type: 'backup', product: 'Drive Mobile Backups', device: '', desc: name });
}

function currentAccount() {
  return (DB.accounts[0] || {}).primary_email || '';
}

function mergeBag(bag) {
  DB.files.push(...bag.files);
  DB.zips.push(...bag.zips);
  Object.entries(bag.products || {}).forEach(([k, v]) => {
    DB.products[k] = DB.products[k] || { key: k, name: v.name, n: 0 };
    DB.products[k].n += v.n;
  });
  Object.entries(bag.ext || {}).forEach(([e, n]) => { DB.ext[e] = (DB.ext[e] || 0) + n; });
}

function alreadyImported(hash) {
  return DB.imports.some(i => i.sha256 === hash);
}

function finishAccounts() {
  const seen = new Set();
  DB.accounts = DB.accounts.filter(a => {
    const k = (a.primary_email || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const acc = currentAccount();
  DB.files.forEach(f => { if (!f.account) f.account = acc; });
  DB.emails.forEach(m => { if (!m.account) m.account = acc; });
}

async function ingestZip(blob, originalName) {
  $('progress').textContent = 'Lendo ' + originalName + '…';
  const buf = await blob.arrayBuffer();
  const hash = await sha256(buf);
  if (alreadyImported(hash)) {
    $('progress').textContent = originalName + ' já estava na análise (mesmo SHA-256).';
    return { skipped: true };
  }
  const bag = { files: [], zips: [], payloads: [], products: {}, ext: {} };
  await walkZip(buf, originalName, originalName, 0, bag);
  mergeBag(bag);
  DB.imports.push({
    name: originalName, sha256: hash, size: blob.size,
    count: bag.files.length, zips: bag.zips.length, when: new Date()
  });
  renderImport();
  $('progress').textContent = 'Inventário: +' + bag.files.length + ' arquivos, +' + bag.zips.length + ' ZIPs internos em ' + originalName + '. Analisando…';
  await tick();

  const jsonByPath = {};
  const media = [];
  let n = 0;
  for (const item of bag.payloads) {
    n++;
    if (n % 40 === 0) {
      $('progress').textContent = 'Lendo arquivos finais ' + n + '/' + bag.payloads.length;
      await tick();
    }
    const { rec, file } = item;
    const path = rec.path;
    const name = rec.name;
    const low = path.toLowerCase();
    const prod = rec.product;
    if (/\.(jpe?g|png|webp|gif|heic|mp4)$/i.test(name)) {
      media.push(item);
      continue;
    }
    if (/\.(mp3|wav|aac|mov|avi)$/i.test(name) && prod !== 'photos') continue;
    let text = '';
    try { text = await file.async('string'); } catch (_) { continue; }
        rec.sha256 = await sha256(new TextEncoder().encode(text));
    rec.account = '';
    if (prod === 'account' || /subscriberinfo|googleaccount|profile\.json/i.test(low)) parseAccount(text, path);
    if (prod === 'android_device' || /deviceanduserprofile|androiddevice/i.test(low)) parseDevices(text, path);
    if (prod === 'timeline' || /records\.json|semantic location|location history|timeline/i.test(low)) parseLocations(text, path);
    if (prod === 'activity' || (/myactivity|my activity/i.test(low) && /\.json$/i.test(low))) parseActivity(text, path);
    if (prod === 'access_log') parseAccess(text, path);
    if (prod === 'chrome') parseChrome(text, path);
    if (prod === 'drive' && !/whatsapp/i.test(low)) parseDrive(name, text, path, rec);
    if (prod === 'gmail' || /\.mbox$/i.test(low)) {
      if (/\.mbox$/i.test(low)) parseMbox(text, path);
      else if (/\.csv$/i.test(low)) parsePayCsv(text, path);
      else if (/\.json$/i.test(low)) addIndex({ file: path, product: 'Mail', ts: '', account: '', context: name, text });
    }
    if (prod === 'pay') {
      if (/\.csv$/i.test(low)) parsePayCsv(text, path);
      else if (/\.json$/i.test(low)) parsePayJson(text, path);
    }
    if (prod === 'drive_backup' || prod === 'whatsapp' || /msgstore\.db\.crypt/i.test(low)) parseBackup(name, text, path, rec);
    if (/\.json$/i.test(low)) jsonByPath[path] = text;
    if (/\.(html?|txt|csv)$/i.test(low) && !['account', 'android_device', 'gmail', 'pay', 'drive'].includes(prod)) {
      addIndex({ file: path, product: LABELS[prod] || prod, ts: '', account: '', context: name, text: text.slice(0, 8000) });
    }
  }

  for (const item of media) {
    const { rec, file } = item;
    const path = rec.path;
    const name = rec.name;
    const sidePath = [path + '.json', path.replace(/\.[^.]+$/, '.json'), path.replace(/[^/]+$/, name + '.json')];
    let sidecar = {};
    for (const sp of sidePath) {
      if (jsonByPath[sp]) {
        try { sidecar = JSON.parse(jsonByPath[sp]); } catch (_) {}
        break;
      }
    }
    if (!Object.keys(sidecar).length) sidecar = {};
    const geo = sidecar.geoData || sidecar.geoDataExif || sidecar.geo || {};
    const taken = (sidecar.photoTakenTime && (sidecar.photoTakenTime.timestamp || sidecar.photoTakenTime.formatted)) ||
      (sidecar.creationTime && sidecar.creationTime.timestamp) || sidecar.creationTime || sidecar.photoTakenTime;
    const blob = await file.async('blob');
    rec.sha256 = await sha256(await blob.arrayBuffer());
    const url = URL.createObjectURL(blob);
    const photo = {
      name, path, url, kind: /\.mp4$/i.test(name) ? 'vídeo' : 'foto',
      ts: parseDt(taken),
      lat: geo.latitude || geo.lat || null,
      lon: geo.longitude || geo.lng || geo.lon || null,
      gps: false,
      device: pick(sidecar, ['device', 'camera', 'model']) || '',
      original: pick(sidecar, ['title', 'originalName', 'name']) || name,
      meta: sidecar
    };
    photo.gps = !!(photo.lat && photo.lon) && !(photo.lat === 0 && photo.lon === 0);
    DB.photos.push(photo);
    addEvent({ ts: photo.ts, type: photo.kind, product: 'Google Photos', device: photo.device, desc: name, lat: photo.lat, lon: photo.lon });
    if (photo.gps) addLoc({ ts: photo.ts, lat: Number(photo.lat), lon: Number(photo.lon), accuracy: null, duration: null, place: name, source: 'Google Photos', device: photo.device });
  }

  finishAccounts();
  return { skipped: false, files: bag.files.length, zips: bag.zips.length };
}

function looseHandle(file) {
  return {
    uncompressedSize: file.size,
    async(kind) {
      if (kind === 'string') return file.text();
      if (kind === 'blob') return Promise.resolve(file);
      return file.arrayBuffer();
    }
  };
}

async function ingestLooseFile(file) {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  if (alreadyImported(hash)) {
    $('progress').textContent = file.name + ' já estava na análise (mesmo SHA-256).';
    return { skipped: true };
  }
  const u8 = new Uint8Array(buf.slice(0, 8));
  if (looksLikeZip(file.name, u8)) return ingestZip(new Blob([buf]), file.name);
  const ext = (file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1) : '').toLowerCase();
  const rec = {
    path: file.name, name: file.name, ext, size: file.size,
    originZip: '(arquivo avulso)', product: classify(file.name), account: '', depth: 0, isZip: false, sha256: hash
  };
  const bag = { files: [rec], zips: [], payloads: [{ rec, file: looseHandle(new File([buf], file.name)) }], products: {}, ext: {} };
  bag.ext[ext || '(sem)'] = 1;
  bag.products[rec.product] = { key: rec.product, name: LABELS[rec.product] || rec.product, n: 1 };
  mergeBag(bag);
  DB.imports.push({ name: file.name, sha256: hash, size: file.size, count: 1, zips: 0, when: new Date() });
  renderImport();
  $('progress').textContent = 'Analisando arquivo avulso ' + file.name + '…';
  await tick();
  const jsonByPath = {};
  const media = [];
  let n = 0;
  for (const item of bag.payloads) {
    n++;
    const { rec: itemRec, file: zf } = item;
    const path = itemRec.path;
    const name = itemRec.name;
    const low = path.toLowerCase();
    const prod = itemRec.product;
    if (/\.(jpe?g|png|webp|gif|heic|mp4)$/i.test(name)) { media.push(item); continue; }
    let text = '';
    try { text = await zf.async('string'); } catch (_) { continue; }
    itemRec.sha256 = hash;
    if (prod === 'account' || /subscriberinfo|googleaccount|profile\.json/i.test(low)) parseAccount(text, path);
    if (prod === 'android_device' || /deviceanduserprofile|androiddevice/i.test(low)) parseDevices(text, path);
    if (prod === 'timeline' || /records\.json|semantic location|location history|timeline/i.test(low)) parseLocations(text, path);
    if (prod === 'activity' || (/myactivity|my activity/i.test(low) && /\.json$/i.test(low))) parseActivity(text, path);
    if (prod === 'access_log') parseAccess(text, path);
    if (prod === 'chrome') parseChrome(text, path);
    if (prod === 'drive' && !/whatsapp/i.test(low)) parseDrive(name, text, path, itemRec);
    if (prod === 'gmail' || /\.mbox$/i.test(low)) {
      if (/\.mbox$/i.test(low)) parseMbox(text, path);
      else if (/\.csv$/i.test(low)) parsePayCsv(text, path);
      else if (/\.json$/i.test(low)) addIndex({ file: path, product: 'Mail', ts: '', account: '', context: name, text });
    }
    if (prod === 'pay') {
      if (/\.csv$/i.test(low)) parsePayCsv(text, path);
      else if (/\.json$/i.test(low)) parsePayJson(text, path);
    }
    if (prod === 'drive_backup' || prod === 'whatsapp' || /msgstore\.db\.crypt/i.test(low)) parseBackup(name, text, path, itemRec);
    if (/\.json$/i.test(low)) jsonByPath[path] = text;
    if (/\.(html?|txt|csv)$/i.test(low) && !['account', 'android_device', 'gmail', 'pay', 'drive'].includes(prod)) {
      addIndex({ file: path, product: LABELS[prod] || prod, ts: '', account: '', context: name, text: text.slice(0, 8000) });
    }
  }
  for (const item of media) {
    const { rec: itemRec, file: zf } = item;
    const blob = await zf.async('blob');
    const url = URL.createObjectURL(blob);
    const photo = {
      name: itemRec.name, path: itemRec.path, url, kind: /\.mp4$/i.test(itemRec.name) ? 'vídeo' : 'foto',
      ts: null, lat: null, lon: null, gps: false, device: '', original: itemRec.name, meta: {}
    };
    DB.photos.push(photo);
    addEvent({ ts: photo.ts, type: photo.kind, product: 'Google Photos', device: '', desc: itemRec.name });
  }
  finishAccounts();
  return { skipped: false, files: 1, zips: 0 };
}

function alerts() {
  const by = {};
  DB.devices.forEach((d, i) => {
    [d.imei1, d.imei2].filter(Boolean).forEach(code => {
      by[code] = by[code] || { imei: code, accounts: new Set(), models: new Set(), ids: [] };
      (d.accounts || []).forEach(a => by[code].accounts.add(a));
      if (d.model) by[code].models.add(d.model);
      by[code].ids.push(i);
    });
  });
  const out = [];
  const used = new Set();
  Object.values(by).forEach(b => {
    const acc = [...b.accounts];
    if (acc.length < 2) return;
    const key = b.ids.slice().sort().join(',');
    if (used.has(key)) return;
    used.add(key);
    out.push({ alert: 'Mesmo aparelho vinculado a múltiplas contas', imei: b.imei, accounts: acc, models: [...b.models] });
  });
  return out;
}

function renderImport() {
  const groups = {};
  DB.files.filter(f => !f.isZip).forEach(f => {
    groups[f.product] = groups[f.product] || [];
    groups[f.product].push(f);
  });
  if ($('importList')) {
    $('importList').innerHTML = table(
      ['Arquivo enviado', 'Tamanho', 'Arquivos finais', 'ZIPs internos', 'SHA-256', 'Quando'],
      DB.imports.map(i => `<tr><td>${esc(i.name)}</td><td>${(i.size / 1024 / 1024).toFixed(2)} MB</td><td>${i.count}</td><td>${i.zips}</td><td class="hash">${esc(i.sha256)}</td><td>${esc(fmt(i.when))}</td></tr>`)
    );
  }
  $('productTree').innerHTML = '<details open><summary>PRODUÇÃO GOOGLE · ' + DB.files.length + ' arquivos · ' + DB.imports.length + ' envio(s)</summary>' +
    Object.keys(groups).sort().map(k => {
      const list = groups[k];
      return '<details><summary>' + esc(LABELS[k] || k) + ' · ' + list.length + '</summary>' +
        list.slice(0, 80).map(f => '<div class="hash">' + esc(f.path) + '</div>').join('') +
        (list.length > 80 ? '<div>… +' + (list.length - 80) + '</div>' : '') + '</details>';
    }).join('') + '</details>';
  $('extCounts').innerHTML = Object.entries(DB.ext).sort((a, b) => b[1] - a[1])
    .map(([e, n]) => '<span class="chip">.' + esc(e) + ' · ' + n + '</span>').join('') || '<span class="chip">Nenhum arquivo ainda</span>';
  $('innerZips').innerHTML = table(
    ['ZIP interno', 'Origem', 'Nível', 'Tamanho'],
    DB.zips.map(z => `<tr><td>${esc(z.name)}</td><td class="hash">${esc(z.originZip)}</td><td>${z.depth}</td><td>${z.size}</td></tr>`)
  );
  $('custody').innerHTML = DB.imports.map(i => `${esc(i.name)}<br>SHA-256: ${esc(i.sha256)}<br>${(i.size / 1024 / 1024).toFixed(2)} MB · ${i.count} arquivos · ${i.zips} ZIPs internos · ${fmt(i.when)}`).join('<hr>') || 'Nenhum ZIP importado.';
}

function renderInventario() {
  const q = fold($('invQ')?.value || '');
  const list = DB.files.filter(f => !q || fold(f.path + f.name + f.product + f.originZip).includes(q));
  $('invStats').innerHTML = [
    ['Arquivos', DB.files.length], ['ZIPs internos', DB.zips.length],
    ['JSON', DB.ext.json || 0], ['TXT', DB.ext.txt || 0], ['CSV', DB.ext.csv || 0],
    ['HTML', (DB.ext.html || 0) + (DB.ext.htm || 0)], ['MBOX', DB.ext.mbox || 0],
    ['JPG', (DB.ext.jpg || 0) + (DB.ext.jpeg || 0)], ['MP4', DB.ext.mp4 || 0]
  ].map(([k, n]) => `<div class="stat"><b>${n}</b><span>${k}</span></div>`).join('');
  $('invTable').innerHTML = table(
    ['Caminho', 'Nome', 'Ext', 'Tamanho', 'ZIP de origem', 'Produto', 'Conta', 'SHA-256'],
    list.slice(0, 400).map(f => `<tr><td class="hash">${esc(f.path)}</td><td>${esc(f.name)}</td><td>${esc(f.ext)}</td><td>${f.size}</td><td class="hash">${esc(f.originZip)}</td><td>${esc(LABELS[f.product] || f.product)}</td><td>${dash(f.account)}</td><td class="hash">${dash(f.sha256)}</td></tr>`)
  );
}

function renderPainel() {
  const a = alerts();
  $('alerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)} · ${esc(x.accounts.join(', '))}. Vínculo encontrado nos arquivos; não afirma identidade.</div>`).join('');
  const c = {
    Contas: DB.accounts.length, Dispositivos: DB.devices.length, 'Access Log': DB.access.length,
    Atividades: DB.events.length, Timeline: DB.locations.length, Fotos: DB.photos.length,
    Drive: DB.drive.length, Mail: DB.emails.length, 'Google Pay': DB.payments.length,
    Chrome: DB.chrome.length, Backups: DB.backups.length, 'ZIPs internos': DB.zips.length
  };
  $('stats').innerHTML = Object.entries(c).map(([k, n]) => `<div class="stat"><b>${n}</b><span>${k}</span></div>`).join('');
  $('accounts').innerHTML = DB.accounts.map(acc => `<article class="panel"><h3>${dash(acc.display_name || acc.primary_email)}</h3>
    <div class="kv">
      <b>Conta Google</b><span>${dash(acc.google_account)}</span>
      <b>Nome</b><span>${dash(acc.display_name)}</span>
      <b>E-mail principal</b><span>${dash(acc.primary_email)}</span>
      <b>E-mails alternativos</b><span>${dash((acc.alternate_emails || []).join(', '))}</span>
      <b>Telefones</b><span>${dash((acc.phones || []).join(', '))}</span>
      <b>Identificadores</b><span>${dash(acc.identifiers)}</span>
      <b>Criação</b><span>${dash(fmt(acc.created_on))}</span>
      <b>Última atividade</b><span>${dash(fmt(acc.last_activity))}</span>
      <b>Status</b><span>${dash(acc.status)}</span>
      <b>Exclusão</b><span>${dash(fmt(acc.deletion_date))}</span>
      <b>Origem</b><span class="hash">${esc(acc.source)}</span>
    </div></article>`).join('') || '<div class="notice">Importe um ZIP para preencher o painel.</div>';
}

function renderDevices() {
  const a = alerts();
  $('deviceAlerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)} vinculado a ${esc(x.accounts.join(', '))}</div>`).join('');
  $('deviceTable').innerHTML = table(
    ['IMEI 1', 'IMEI 2', 'MEID', 'Modelo', 'Fabricante', 'Série', 'Android ID', 'Primeiro vínculo', 'Último vínculo', 'Contas', 'Alerta'],
    DB.devices.map(d => `<tr><td>${dash(d.imei1)}</td><td>${dash(d.imei2)}</td><td>${dash(d.meid)}</td><td>${dash(d.model)}</td><td>${dash(d.manufacturer)}</td><td>${dash(d.serial)}</td><td>${dash(d.android_id)}</td><td>${dash(fmt(d.first))}</td><td>${dash(fmt(d.last))}</td><td>${dash((d.accounts || []).join(', '))}</td><td>${(d.accounts || []).length > 1 ? '<span class="chip warn">Vínculo IMEI → várias contas</span>' : '—'}</td></tr>`)
  );
}

function renderEvents() {
  const rows = DB.events.filter(e => inRange(e.ts, 'evFrom', 'evTo')).sort((a, b) => (parseDt(a.ts) || 0) - (parseDt(b.ts) || 0));
  $('eventTable').innerHTML = table(
    ['Data', 'Hora', 'Evento', 'Produto', 'Dispositivo', 'URL'],
    rows.map(e => `<tr><td>${dash(fmtDate(e.ts))}</td><td>${dash(fmtTime(e.ts))}</td><td>${dash(e.desc || e.type)}</td><td>${dash(e.product)}</td><td>${dash(e.device)}</td><td class="hash">${dash(e.url)}</td></tr>`)
  );
}

function renderAccess() {
  const ipq = fold($('alIp')?.value || '');
  const dq = fold($('alDevice')?.value || '');
  const aq = fold($('alAccount')?.value || '');
  const rows = DB.access.filter(e => {
    if (!inRange(e.ts, 'alFrom', 'alTo')) return false;
    if (ipq && !fold(e.ip).includes(ipq)) return false;
    if (dq && !fold(e.device).includes(dq)) return false;
    if (aq && !fold(e.account).includes(aq)) return false;
    return true;
  });
  $('accessTable').innerHTML = table(
    ['Data', 'Hora', 'Serviço', 'Evento', 'Dispositivo', 'IP', 'Localização', 'Conta', 'Outros'],
    rows.map(e => `<tr><td>${dash(fmtDate(e.ts))}</td><td>${dash(fmtTime(e.ts))}</td><td>${dash(e.service)}</td><td>${dash(e.event)}</td><td>${dash(e.device)}</td><td>${dash(e.ip)}</td><td>${dash(e.location)}</td><td>${dash(e.account)}</td><td>${dash(e.extra)}</td></tr>`)
  );
}

let map;
function renderMap() {
  const near = $('nearOnly')?.checked;
  const pts = DB.locations.filter(l => l.lat != null && (!near || nearCrime(l.ts)) && inRange(l.ts, 'mapFrom', 'mapTo'));
  const el = $('map');
  if (map) { map.remove(); map = null; }
  if (typeof L !== 'undefined' && pts.length) {
    el.innerHTML = '';
    map = L.map(el).setView([pts[0].lat, pts[0].lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    pts.forEach(p => {
      const isNear = nearCrime(p.ts);
      L.circleMarker([p.lat, p.lon], { radius: isNear ? 8 : 5, color: isNear ? '#8f3037' : '#2d6a56' })
        .addTo(map).bindPopup(`${esc(p.place || 'Ponto GPS')}<br>${esc(fmt(p.ts))}<br>${p.lat}, ${p.lon}`);
    });
    setTimeout(() => map && map.invalidateSize(), 200);
  } else if (!pts.length) {
    el.innerHTML = '<div class="notice">Sem pontos de localização neste ZIP.</div>';
  }
  $('locTable').innerHTML = table(
    ['Data', 'Hora', 'Latitude', 'Longitude', 'Precisão', 'Permanência', 'Local', 'Origem', 'Atividade', 'Próximo ao fato'],
    pts.map(l => `<tr><td>${dash(fmtDate(l.ts))}</td><td>${dash(fmtTime(l.ts))}</td><td>${dash(l.lat)}</td><td>${dash(l.lon)}</td><td>${dash(l.accuracy)}</td><td>${l.duration != null ? Math.round(l.duration / 60) + ' min' : dash('')}</td><td>${dash(l.place)}</td><td class="hash">${dash(l.source)}</td><td>${dash(l.activity)}</td><td>${nearCrime(l.ts) ? 'SIM' : 'não'}</td></tr>`)
  );
}

function renderPhotos() {
  let list = DB.photos;
  if ($('photoGps')?.checked) list = list.filter(p => p.gps);
  if ($('photoNear')?.checked) list = list.filter(p => nearCrime(p.ts));
  $('photoGrid').innerHTML = list.map(p => {
    const media = p.kind === 'vídeo'
      ? `<video src="${p.url}" controls></video>`
      : `<img src="${p.url}" alt="${esc(p.name)}">`;
    return `<figure>${media}<figcaption><b>${esc(p.original || p.name)}</b><br>${dash(fmt(p.ts))}<br>GPS: ${p.gps ? esc(p.lat) + ', ' + esc(p.lon) : NA}<br>${esc(p.kind)}</figcaption></figure>`;
  }).join('') || '<div class="notice">Nenhuma foto ou vídeo extraído.</div>';
}

function renderFiles() {
  const q = $('fileQ')?.value || '';
  $('kw').innerHTML = KEYWORDS.map(k => `<button class="chip" type="button" data-kw="${k}">${k}</button>`).join('');
  const list = DB.drive.filter(f => !q || fold(f.name + (f.keywords || []).join(' ') + (f.text || '')).includes(fold(q)));
  $('fileTable').innerHTML = table(
    ['Nome', 'Ext', 'MIME', 'Tamanho', 'Criação', 'Modificação', 'Proprietário', 'Palavras', 'Caminho'],
    list.map(f => `<tr><td>${dash(f.name)}</td><td>${dash(f.type)}</td><td>${dash(f.mime)}</td><td>${dash(f.size)}</td><td>${dash(fmt(f.created))}</td><td>${dash(fmt(f.modified))}</td><td>${dash(f.owner)}</td><td>${(f.keywords || []).map(k => `<span class="chip warn">${esc(k)}</span>`).join(' ') || '—'}</td><td class="hash">${dash(f.path)}</td></tr>`)
  );
}

function renderMail() {
  const q = fold($('mailQ')?.value || '');
  const list = DB.emails.filter(m => !q || fold([m.from, m.to, m.cc, m.subject, m.body, m.ip, m.id, (m.links || []).join(' '), (m.phones || []).join(' ')].join(' ')).includes(q));
  $('mailTable').innerHTML = table(
    ['Remetente', 'Destinatário', 'CC', 'Data', 'Assunto', 'Texto', 'Anexos', 'ID', 'IP', 'Links'],
    list.map(m => `<tr><td>${dash(m.from)}</td><td>${dash(m.to)}</td><td>${dash(m.cc)}</td><td>${dash(fmt(m.date))}</td><td>${dash(m.subject)}</td><td>${dash((m.body || '').slice(0, 160))}</td><td>${dash((m.attach || []).join(', '))}</td><td class="hash">${dash(m.id)}</td><td>${dash(m.ip)}</td><td class="hash">${dash((m.links || []).slice(0, 2).join(' '))}</td></tr>`)
  );
}

function renderPay() {
  const rows = DB.payments.filter(p => inRange(p.ts, 'payFrom', 'payTo'));
  $('payTable').innerHTML = table(
    ['Tipo', 'Descrição', 'Valor', 'Moeda', 'Data', 'ID', 'Instrumento', 'Perfil'],
    rows.map(p => `<tr><td>${dash(p.kind)}</td><td>${dash(p.desc)}</td><td>${dash(p.amount)}</td><td>${dash(p.currency)}</td><td>${dash(fmt(p.ts))}</td><td class="hash">${dash(p.id)}</td><td>${dash(p.instrument)}</td><td>${dash(p.profile)}</td></tr>`)
  );
}

function renderChrome() {
  const q = fold($('chromeQ')?.value || '');
  const rows = DB.chrome.filter(c => inRange(c.ts, 'chFrom', 'chTo') && (!q || fold(c.title + c.url + c.extra).includes(q)));
  $('chromeTable').innerHTML = table(
    ['Tipo', 'Título', 'URL / endereço', 'Data', 'Hora', 'Extra'],
    rows.map(c => `<tr><td>${dash(c.kind)}</td><td>${dash(c.title)}</td><td class="hash">${dash(c.url || c.extra)}</td><td>${dash(fmtDate(c.ts))}</td><td>${dash(fmtTime(c.ts))}</td><td>${dash(c.extra)}</td></tr>`)
  );
}

function renderBackups() {
  $('backupTable').innerHTML = table(
    ['Arquivo', 'Data', 'Tamanho', 'Dispositivo', 'Conta', 'Tipo', 'Observação'],
    DB.backups.map(w => `<tr><td>${dash(w.name)}</td><td>${dash(fmt(w.date))}</td><td>${dash(w.size)}</td><td>${dash(w.device)}</td><td>${dash(w.account || currentAccount())}</td><td>${dash(w.type)}</td><td>${dash(w.note)}</td></tr>`)
  );
}

function renderBusca() {
  const q = fold($('globalQ')?.value || '');
  if (!q) { $('globalHits').innerHTML = '<div class="notice">Digite um termo para pesquisar JSON, TXT, CSV, HTML, MBOX, metadados e nomes.</div>'; return; }
  const hits = [];
  DB.index.forEach(ix => {
    const i = fold(ix.text).indexOf(q);
    if (i < 0) return;
    const start = Math.max(0, i - 40);
    hits.push({ file: ix.file, product: ix.product, ts: ix.ts, account: ix.account, context: ix.context, snippet: ix.text.slice(start, start + 160) });
  });
  DB.files.forEach(f => {
    if (fold(f.name).includes(q)) hits.push({ file: f.path, product: LABELS[f.product] || f.product, ts: '', account: f.account, context: 'nome do arquivo', snippet: f.name });
  });
  $('globalHits').innerHTML = table(
    ['Arquivo', 'Produto', 'Data', 'Hora', 'Conta', 'Contexto', 'Trecho'],
    hits.slice(0, 200).map(h => `<tr><td class="hash">${esc(h.file)}</td><td>${esc(h.product)}</td><td>${dash(fmtDate(h.ts))}</td><td>${dash(fmtTime(h.ts))}</td><td>${dash(h.account)}</td><td>${dash(h.context)}</td><td>${esc(h.snippet)}</td></tr>`)
  );
}

function renderFato() {
  const crime = parseDt($('crimeDate').value);
  if (!crime) { $('fatoTable').innerHTML = '<div class="notice">Informe a DATA DO FATO no Painel.</div>'; return; }
  const loc = fold($('fatoLocal')?.value || '');
  const rows = DB.events.filter(e => nearCrime(e.ts) && (!loc || fold(e.desc || '').includes(loc) || fold(e.place || '').includes(loc)))
    .sort((a, b) => (parseDt(a.ts) || 0) - (parseDt(b.ts) || 0));
  $('fatoTable').innerHTML = table(
    ['Data', 'Hora', 'Tipo', 'Produto', 'Descrição', 'Dispositivo'],
    rows.map(e => `<tr><td>${dash(fmtDate(e.ts))}</td><td>${dash(fmtTime(e.ts))}</td><td>${dash(e.type)}</td><td>${dash(e.product)}</td><td>${dash(e.desc)}</td><td>${dash(e.device)}</td></tr>`)
  );
}

function renderCorr() {
  const a = alerts();
  $('chain').innerHTML = ['CONTA GOOGLE', 'IMEI', 'DISPOSITIVO', 'IP', 'GMAIL', 'DRIVE', 'FOTOS', 'TIMELINE', 'CHROME', 'GOOGLE PAY', 'MY ACTIVITY', 'ACCESS LOG']
    .map((x, i) => `${i ? ' <b>↓</b> ' : ''}<span class="chip">${x}</span>`).join('');
  $('corrAlerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)}<ul>${x.accounts.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`).join('');
  const acc = DB.accounts[0] || {};
  const ipList = uniq(DB.access.map(x => x.ip).concat(DB.emails.map(m => m.ip)).filter(Boolean));
  $('corrList').innerHTML = `<div class="corr-block"><b>${esc(acc.primary_email || NA)}</b>
    <ul>
      <li>IMEI: ${esc(DB.devices.map(d => d.imei1).filter(Boolean).join(', ') || NA)}</li>
      <li>IP: ${esc(ipList.join(', ') || NA)}</li>
      <li>Locais: ${DB.locations.length}</li>
      <li>Fotos: ${DB.photos.length}</li>
      <li>Transações: ${DB.payments.length}</li>
      <li>E-mails: ${DB.emails.length}</li>
      <li>Chrome: ${DB.chrome.length}</li>
      <li>Access Log: ${DB.access.length}</li>
    </ul></div>` +
    DB.devices.map(d => `<div class="corr-block"><b>IMEI ${esc(d.imei1 || NA)}</b><ul>${(d.accounts || []).map(c => '<li>' + esc(c) + '</li>').join('') || '<li>' + NA + '</li>'}</ul></div>`).join('');
}

const loaders = {
  importar: renderImport, inventario: renderInventario, painel: renderPainel, dispositivos: renderDevices,
  accesslog: renderAccess, eventos: renderEvents, mapa: renderMap, fotos: renderPhotos, chrome: renderChrome,
  arquivos: renderFiles, backups: renderBackups, gmail: renderMail, pagamentos: renderPay,
  busca: renderBusca, fato: renderFato, correlacao: renderCorr
};

function show(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  loaders[name]?.();
  try { parent.postMessage({ type: 'pcpr-fit', module: 'googleanalise' }, '*'); } catch (_) {}
}

async function ingestOne(file) {
  const buf = await file.slice(0, 8).arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (looksLikeZip(file.name, u8) || /\.zip$/i.test(file.name)) return ingestZip(file, file.name);
  return ingestLooseFile(file);
}

async function runFiles(fileList, opts = {}) {
  const files = [...fileList].filter(Boolean);
  if (!files.length) return;
  if (opts.reset) reset();
  let added = 0, skipped = 0, zips = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      $('progress').textContent = 'Arquivo ' + (i + 1) + '/' + files.length + ': ' + file.name;
      await tick();
      const out = await ingestOne(file);
      if (out && out.skipped) skipped++;
      else {
        added++;
        zips += (out && out.zips) || 0;
      }
    }
    finishAccounts();
    renderImport();
    $('progress').textContent = 'Concluído. ' + added + ' arquivo(s) novos, ' + skipped + ' repetido(s). Total: ' + DB.imports.length + ' envios · ' + DB.zips.length + ' ZIPs internos · ' + DB.files.length + ' arquivos.';
    show('inventario');
  } catch (err) {
    $('progress').textContent = 'Falha: ' + err.message;
  }
}

async function runFile(file) {
  return runFiles([file], { reset: true });
}

function tinyJpg() {
  const b64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI/8AAEQgAAQABAwEiAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwB//9k=';
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function putZip(jszip, name, files) {
  const inner = new JSZip();
  Object.entries(files).forEach(([p, c]) => inner.file(p, c));
  jszip.file(name, await inner.generateAsync({ type: 'uint8array' }));
}

async function demo() {
  if (!window.JSZip) { $('progress').textContent = 'JSZip não carregou. Atualize a página.'; return; }
  $('progress').textContent = 'Gerando produção LERS aninhada…';
  const root = new JSZip();
  const accHtml = `<table>
  <tr><th>Name</th><td>João Carlos da Silva</td></tr>
  <tr><th>Primary Email</th><td>joao.silva.investigado@gmail.com</td></tr>
  <tr><th>Alternate Emails</th><td>jcsilva.alt@gmail.com, joao.trabalho@gmail.com</td></tr>
  <tr><th>Phone</th><td>+55 41 99999-1234</td></tr>
  <tr><th>Gaia ID</th><td>118000000000000000001</td></tr>
  <tr><th>Account Created</th><td>2015-03-12T14:22:00Z</td></tr>
  <tr><th>Last Activity</th><td>2024-09-15T11:04:00Z</td></tr>
  <tr><th>Status</th><td>Ativa</td></tr>
  </table>`;
  const devices = JSON.stringify([{
    modelName: 'SM-G991B', manufacturer: 'samsung', serialNumber: 'R58M32ABCDE',
    firstRegistrationTime: '2022-01-18T10:00:00Z', lastUsedTime: '2024-09-10T23:55:00Z',
    deviceData: [{ displayName: 'IMEI 1', value: '353325110000001' }, { displayName: 'IMEI 2', value: '353325110000118' }, { displayName: 'MEID', value: 'A1000000000001' }],
    userInfo: [{ emailAddress: 'joao.silva.investigado@gmail.com' }, { emailAddress: 'maria.oliveira.alt@gmail.com' }]
  }, {
    modelName: 'moto g54 5G', manufacturer: 'motorola', serialNumber: 'ZY22ABCXYZ',
    firstRegistrationTime: '2023-07-01T12:00:00Z', lastUsedTime: '2024-08-20T08:00:00Z',
    deviceData: [{ displayName: 'IMEI 1', value: '351608111234568' }],
    userInfo: [{ emailAddress: 'joao.silva.investigado@gmail.com' }]
  }]);
  const records = JSON.stringify({ locations: [
    { timestamp: '2024-09-10T21:18:00Z', latitudeE7: -254284000, longitudeE7: -492733000, accuracy: 18 },
    { timestamp: '2024-09-10T21:35:00Z', latitudeE7: -254429000, longitudeE7: -492673000, accuracy: 12 }
  ]});
  const semantic = JSON.stringify({ timelineObjects: [{ placeVisit: { location: { latitudeE7: -254284000, longitudeE7: -492733000, name: 'Centro Cívico — Curitiba/PR' }, duration: { startTimestamp: '2024-09-10T21:10:00Z', endTimestamp: '2024-09-10T21:55:00Z' } } }] });
  const activity = JSON.stringify([
    { header: 'Search', title: 'Pesquisou por PIX banco', time: '2024-09-10T20:05:00.000Z', titleUrl: 'https://www.google.com/search?q=PIX+banco', deviceInformation: { deviceType: 'ANDROID' } },
    { header: 'Search', title: 'Pesquisou por arma de fogo curitiba', time: '2024-09-10T20:22:00.000Z', deviceInformation: { deviceType: 'ANDROID' } }
  ]);
  const access = JSON.stringify([
    { timestamp: '2024-09-10T20:01:00Z', service: 'Gmail', event: 'Login', ipAddress: '200.152.44.18', device: 'ANDROID', location: 'Curitiba/PR' },
    { timestamp: '2024-09-10T21:12:00Z', service: 'Drive', event: 'Download', ipAddress: '200.152.44.18', device: 'ANDROID' }
  ]);
  const mbox = 'From MAILER-DAEMON\nFrom: banco.alertas@bancoexemplo.com.br\nTo: joao.silva.investigado@gmail.com\nCc: jcsilva.alt@gmail.com\nSubject: Comprovante PIX no valor de R$ 4.800,00\nDate: Tue, 10 Sep 2024 18:12:11 -0300\nMessage-ID: <pix-4800@bancoexemplo.com.br>\nX-Originating-IP: [200.152.44.18]\nContent-Disposition: attachment; filename="comprovante.pdf"\n\nTransferência PIX CPF 123.456.789-09.\n';
  const payCsv = 'Date,Description,Amount,Currency,Transaction ID,Type\n2024-09-10 18:12:00,PIX Banco Exemplo,4800.00,BRL,TX-PIX-4800,purchase\n';
  const chromeHist = JSON.stringify({ 'Browser History': [{ title: 'Banco Exemplo', url: 'https://bancoexemplo.com.br/pix', time_usec: 1726006320000000 }] });
  const chromeBm = JSON.stringify({ roots: { bookmark_bar: { name: 'Barra', children: [{ name: 'Maps', url: 'https://maps.google.com/' }] } } });
  const photoJson = JSON.stringify({ title: 'fachada_centro.jpg', photoTakenTime: { timestamp: '1726011000' }, geoData: { latitude: -25.4284, longitude: -49.2733 } });
  const jpg = tinyJpg();

  await putZip(root, 'Oficio_123/GoogleAccount.zip', { 'GoogleAccount.SubscriberInfo/GoogleAccount.SubscriberInfo.html': accHtml });
  await putZip(root, 'Oficio_123/AndroidDeviceConfigurationService.zip', { 'AndroidDeviceConfigurationService.DeviceAndUserProfile/DeviceAndUserProfile.json': devices });
  await putZip(root, 'Oficio_123/Mail.zip', { 'Mail.Messages/All mail Including Spam and Trash.mbox': mbox, 'Mail.MessageInformation/summary.csv': 'id,subject\npix-4800,Comprovante PIX\n' });
  await putZip(root, 'Oficio_123/MyActivity.zip', { 'MyActivity.MyActivity/MyActivity.json': activity });
  await putZip(root, 'Oficio_123/AccessLogActivity.zip', { 'AccessLogActivity.Activity/Activity.json': access, 'AccessLogActivity.AggregatedActivities/Aggregated.json': '[]' });
  await putZip(root, 'Oficio_123/GooglePay.zip', { 'GooglePay.Transactions/Transactions.csv': payCsv, 'GooglePay.CustomerInformation/Customer.json': '{"email":"joao.silva.investigado@gmail.com"}' });
  await putZip(root, 'Oficio_123/Chrome.zip', { 'Chrome.History/BrowserHistory.json': chromeHist, 'Chrome.Bookmarks/Bookmarks.json': chromeBm });
  await putZip(root, 'Oficio_123/Drive.zip', { 'Drive.DriveFiles/comprovante_pix.txt': 'Comprovante PIX\nCPF 123.456.789-09\nBANCO Exemplo\nVALOR R$ 4.800,00\n' });
  await putZip(root, 'Oficio_123/DriveMobileBackups.zip', { 'DriveMobileBackups.Backup/msgstore.db.crypt14': 'WHATSAPP ENCRYPTED BACKUP PLACEHOLDER', 'DriveMobileBackups.Backup/backup.json': '{"account":"joao.silva.investigado@gmail.com","device":"SM-G991B","type":"WhatsApp","date":"2024-09-10T14:00:00Z"}' });

  const deep = new JSZip();
  const photosZip = new JSZip();
  photosZip.file('GooglePhotos.PhotoResourceLegal/fachada.jpg', jpg);
  photosZip.file('GooglePhotos.PhotoResourceLegal/fachada.jpg.json', photoJson);
  const nestedPhotos = new JSZip();
  nestedPhotos.file('GooglePhotos.PhotoResourceLegal/rua.jpg', jpg);
  nestedPhotos.file('GooglePhotos.PhotoResourceLegal/rua.jpg.json', JSON.stringify({ title: 'rua.jpg', photoTakenTime: { timestamp: '1726012200' }, geoData: { latitude: -25.4429, longitude: -49.2673 } }));
  photosZip.file('extra/mais_fotos.zip', await nestedPhotos.generateAsync({ type: 'uint8array' }));
  deep.file('GooglePhotos.zip', await photosZip.generateAsync({ type: 'uint8array' }));
  root.file('Oficio_123/midia/pacote_fotos.zip', await deep.generateAsync({ type: 'uint8array' }));

  const tl = new JSZip();
  tl.file('Timeline.Records/Records.json', records);
  tl.file('Timeline.SemanticLocationHistory/2024_SEPTEMBER.json', semantic);
  tl.file('Timeline.Settings/Settings.json', '{"enabled":true}');
  tl.file('Timeline.EncryptedBackups/note.txt', 'Backup cifrado do Timeline. Sem tentativa de quebra.');
  root.file('Oficio_123/Timeline.zip', await tl.generateAsync({ type: 'uint8array' }));

  for (let i = 1; i <= 20; i++) {
    const extra = new JSZip();
    extra.file('filler_' + i + '.json', '{"n":' + i + '}');
    root.file('Oficio_123/lote/produto_' + String(i).padStart(2, '0') + '.zip', await extra.generateAsync({ type: 'uint8array' }));
  }

  const blob = await root.generateAsync({ type: 'blob' });
  $('crimeDate').value = '2024-09-10T21:30';
  await runFile(new File([blob], 'Google_LERS_Producao_ANINHADA_DEMO.zip'));
}

function report() {
  const acc = DB.accounts[0] || {};
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — Quebra Google</title>
  <style>body{font-family:Arial;max-width:860px;margin:24px auto;color:#111}h1{color:#183a31}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:12px}</style></head><body>
  <h1>POLÍCIA CIVIL DO PARANÁ — RELATÓRIO DE QUEBRA GOOGLE</h1>
  <p>Gerado em ${fmt(new Date())}. Conferir com os originais da produção. Campos ausentes constam como “Não disponível na produção”.</p>
  <h2>1. Custódia</h2>${DB.imports.map(i => `<p>${esc(i.name)} SHA-256 ${esc(i.sha256)} · ${i.zips} ZIPs internos · ${i.count} arquivos</p>`).join('')}
  <h2>2. Conta</h2><p>${esc(plain(acc.display_name))} — ${esc(plain(acc.primary_email))} — ${esc(plain((acc.phones || []).join(', ')))}</p>
  <h2>3. Dispositivos</h2>${DB.devices.map(d => `<p>${esc(plain(d.model))} IMEI ${esc(plain(d.imei1))} contas ${esc((d.accounts || []).join(', '))}</p>`).join('')}
  <h2>4. Alertas</h2>${alerts().map(a => `<p><b>${esc(a.alert)}</b> ${esc(a.imei)} ${esc(a.accounts.join(', '))}</p>`).join('') || '<p>Nenhum</p>'}
  <h2>5. ZIPs internos</h2>${DB.zips.map(z => `<p>${esc(z.path)}</p>`).join('')}
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
}

$('nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]');
  if (b) show(b.dataset.view);
});
$('pick').onclick = () => { $('file').dataset.mode = 'add'; $('file').click(); };
$('addMore').onclick = () => { $('file').dataset.mode = 'add'; $('file').click(); };
$('clearAll').onclick = () => { reset(); renderImport(); $('progress').textContent = 'Análise limpa. Selecione os arquivos da produção.'; show('importar'); };
$('file').onchange = e => {
  const list = e.target.files;
  if (list && list.length) runFiles(list, { reset: false });
  e.target.value = '';
};
$('demo').onclick = demo;
$('drop').addEventListener('click', e => { if (e.target.id === 'drop' || (e.target.closest('.drop') === $('drop') && !e.target.closest('button,input'))) $('file').click(); });
['dragenter', 'dragover'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); }));
$('drop').addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) runFiles(e.dataTransfer.files, { reset: false }); });
$('evFilter').onclick = renderEvents;
$('alFilter').onclick = renderAccess;
$('nearOnly').onchange = renderMap;
$('mapFilter').onclick = renderMap;
$('photoNear').onchange = renderPhotos;
$('photoGps').onchange = renderPhotos;
$('fileQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderFiles(); });
$('kw').addEventListener('click', e => { const b = e.target.closest('[data-kw]'); if (!b) return; $('fileQ').value = b.dataset.kw; renderFiles(); });
$('mailQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderMail(); });
$('chFilter').onclick = renderChrome;
$('payFilter').onclick = renderPay;
$('globalGo').onclick = renderBusca;
$('globalQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderBusca(); });
$('fatoGo').onclick = renderFato;
$('invQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderInventario(); });
$('makeReport').onclick = report;
$('crimeWindow').addEventListener('change', () => {
  $('customWinWrap').hidden = $('crimeWindow').value !== 'custom';
});
$('crimeDate').addEventListener('change', () => { const v = document.querySelector('.nav button.active')?.dataset.view; if (v) loaders[v]?.(); });

if (!window.JSZip) $('progress').textContent = 'Atualize a página se o seletor de ZIP não abrir.';
try { parent.postMessage({ type: 'pcpr-fit', module: 'googleanalise' }, '*'); } catch (_) {}
document.documentElement.dataset.quebraReady = '1';
window.PCPRQuebra = { ingestZip, ingestLooseFile, walkZip, classify, DB, demo, runFile, runFiles, reset };
})();
