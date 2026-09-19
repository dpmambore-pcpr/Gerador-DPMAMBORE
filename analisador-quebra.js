(() => {
'use strict';
const KEYWORDS = ['PIX','CPF','BANCO','ARMA','DROGA','NOME','TELEFONE','VALOR'];
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dash = v => (v === 0 ? '0' : v ? esc(v) : '—');
const uniq = a => [...new Set((a || []).filter(Boolean))];
const fold = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const emails = t => uniq((String(t || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig) || []).map(x => x.toLowerCase()));
const phones = t => uniq(String(t || '').match(/(?:\+?55[\s\-]?)?(?:\(?\d{2}\)?[\s\-]?)?\d{4,5}[\s\-]?\d{4}/g) || []);
const ips = t => uniq(String(t || '').match(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g) || []);

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
    const d = new Date(n * (n < 1e12 ? 1000 : 1));
    return isNaN(d) ? null : d;
  }
  const d = new Date(String(v).replace(' ', 'T'));
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
function nearCrime(ts) {
  const crime = parseDt($('crimeDate').value);
  const hours = Number($('crimeWindow').value || 24);
  const d = parseDt(ts);
  if (!crime || !d) return false;
  return Math.abs(d - crime) <= hours * 3600 * 1000;
}
function table(headers, rows) {
  if (!rows.length) return '<div class="notice">Nenhum registro nesta aba. Importe o ZIP da quebra.</div>';
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

const DB = {
  products: {}, imports: [], accounts: [], devices: [], events: [], locations: [],
  photos: [], files: [], emails: [], payments: [], searches: [], whatsapp: []
};

function reset() {
  Object.assign(DB, {
    products: {}, imports: [], accounts: [], devices: [], events: [], locations: [],
    photos: [], files: [], emails: [], payments: [], searches: [], whatsapp: []
  });
}
function classify(path) {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (/whatsapp|msgstore\.db\.crypt/.test(p)) return 'whatsapp';
  if (/\.mbox$|\/mail\//.test(p)) return 'gmail';
  if (/google photos|\.(jpe?g|png|webp)$/.test(p)) return 'photos';
  if (/location history|records\.json|semantic location/.test(p)) return 'maps';
  if (/google pay|googlepay|\/pay\//.test(p)) return 'pay';
  if (/my activity\/search|search\/myactivity/.test(p)) return 'search';
  if (/deviceanduserprofile|android device configuration/.test(p)) return 'android_device';
  if (/subscriberinfo|profile\.json|googleaccount/.test(p)) return 'account';
  if (/\/drive\//.test(p)) return 'drive';
  if (/my activity|myactivity/.test(p)) return 'activity';
  return 'outros';
}
const LABELS = {
  account: 'Conta Google', android_device: 'Dispositivos Android', gmail: 'Gmail', photos: 'Google Photos',
  maps: 'Google Maps', pay: 'Google Pay', search: 'Google Search', whatsapp: 'WhatsApp backup',
  drive: 'Google Drive', activity: 'My Activity', outros: 'Outros'
};

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
function parseAccount(text, path) {
  let map = {};
  try { if (path.toLowerCase().endsWith('.json')) map = JSON.parse(text) || {}; } catch (_) {}
  if (!Object.keys(map).length) map = htmlTables(text);
  const blob = JSON.stringify(map) + ' ' + text;
  const em = emails(blob);
  if (!em.length) return;
  DB.accounts.push({
    google_account: em[0],
    display_name: map.Name || map.name || map['Full Name'] || map['display name'] || '',
    primary_email: map['Primary Email'] || map.email || map['e-Mail'] || em[0],
    alternate_emails: uniq(em.slice(1).concat(emails(map['Alternate Emails'] || map['Alternate e-Mails'] || ''))).filter(e => e !== em[0]),
    phones: phones(blob),
    created_on: map['Account Created'] || map.created || map['Created on'],
    last_activity: map['Last Activity'] || map['last activity'] || map['Last Logins'],
    status: map.Status || map.status || 'Não informado',
    deletion_date: map['Deletion Date'] || map.deleted || ''
  });
}
function parseDevices(text, path) {
  let items = [];
  try {
    if (path.toLowerCase().endsWith('.json')) {
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
    const d = { imei1: '', imei2: '', model: obj.modelName || obj.model || obj.Modelo || '', manufacturer: obj.manufacturer || obj.Fabricante || '', serial: obj.serialNumber || obj.serial || '', android_id: obj.androidId || '', first: obj.firstRegistrationTime || obj.firstSeen, last: obj.lastUsedTime || obj.lastSeen, accounts: emails(JSON.stringify(obj)) };
    (obj.deviceData || []).forEach(x => {
      const lab = String(x.displayName || x.key || '');
      const val = String(x.value || x.data || '');
      if (/imei\s*2/i.test(lab)) d.imei2 = imei(val);
      else if (/imei/i.test(lab)) d.imei1 = d.imei1 || imei(val);
      else if (/serial/i.test(lab)) d.serial = d.serial || val;
    });
    (obj.userInfo || []).forEach(u => { d.accounts.push(...emails(JSON.stringify(u))); });
    d.accounts = uniq(d.accounts);
    d.imei1 = d.imei1 || imei(obj.imei1 || obj.imei);
    d.imei2 = d.imei2 || imei(obj.imei2);
    if (d.imei1 || d.model || d.serial) DB.devices.push(d);
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
  DB.events.push({ ts: rec.ts, type: 'localizacao', product: 'Google Maps', device: rec.device, desc: rec.place || `Lat ${rec.lat.toFixed(5)}, Lon ${rec.lon.toFixed(5)}`, lat: rec.lat, lon: rec.lon });
}
function parseLocations(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  const p = path.toLowerCase();
  if (payload.timelineObjects) {
    payload.timelineObjects.forEach(o => {
      const v = o.placeVisit;
      if (!v) return;
      const loc = v.location || {};
      const dur = v.duration || {};
      const start = parseDt(dur.startTimestamp || dur.startTimestampMs);
      const end = parseDt(dur.endTimestamp || dur.endTimestampMs);
      addLoc({
        ts: start, lat: coord(loc.latitudeE7 || loc.latitude), lon: coord(loc.longitudeE7 || loc.longitude),
        accuracy: null, duration: start && end ? Math.max(0, (end - start) / 1000) : null,
        place: loc.name || loc.address, source: 'Semantic', device: null
      });
    });
    return;
  }
  const list = payload.locations || (Array.isArray(payload) ? payload : []);
  list.forEach(item => {
    if (!item || typeof item !== 'object') return;
    addLoc({
      ts: parseDt(item.timestamp || item.timestampMs || item.time),
      lat: coord(item.latitudeE7 || item.latitude || item.lat),
      lon: coord(item.longitudeE7 || item.longitude || item.lng || item.lon),
      accuracy: item.accuracy, duration: null, place: item.place || '', source: item.source || 'Location History', device: item.deviceTag
    });
  });
}
function parseActivity(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  const list = Array.isArray(payload) ? payload : (payload.events || payload.items || []);
  list.forEach(rec => {
    if (!rec || typeof rec !== 'object') return;
    const title = rec.title || rec.description || 'Atividade';
    const ts = parseDt(rec.time || rec.timestamp);
    const product = /search/i.test(path) || /search/i.test(rec.header || '') ? 'Google Search' : (rec.header || 'My Activity');
    const device = (rec.deviceInformation && rec.deviceInformation.deviceType) || rec.device || '';
    DB.events.push({ ts, type: 'atividade', product, device, desc: title });
    if (product === 'Google Search' || /^Pesquisou por |^Searched for /i.test(title)) {
      DB.searches.push({ query: title.replace(/^Pesquisou por |^Searched for |^You searched for /i, ''), ts, device, product });
    }
  });
}
function parseDrive(name, text, path) {
  const hits = KEYWORDS.filter(k => fold(name + '\n' + text).includes(fold(k)));
  DB.files.push({ name, type: name.split('.').pop() || '', created: '', modified: '', owner: '', keywords: hits, path });
  if (hits.length) DB.events.push({ ts: new Date(), type: 'arquivo_relevante', product: 'Google Drive', device: '', desc: `${name} — ${hits.join(', ')}` });
}
function parseMbox(text) {
  const chunks = text.split(/^From /m).filter(Boolean);
  chunks.forEach(raw => {
    const head = raw.slice(0, 4000);
    const get = k => {
      const m = head.match(new RegExp('^' + k + ':\\s*(.+)$', 'im'));
      return m ? m[1].trim() : '';
    };
    const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n').slice(0, 8000);
    const ip = ips(head)[0] || '';
    const subject = get('Subject');
    const date = parseDt(get('Date'));
    DB.emails.push({
      id: get('Message-ID') || get('Message-Id'),
      from: get('From'), to: get('To'), date, subject, body, ip
    });
    DB.events.push({ ts: date, type: 'email', product: 'Gmail', device: '', desc: subject || '(sem assunto)' });
  });
}
function parsePayCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return;
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const idx = n => headers.findIndex(h => h.includes(n));
  lines.slice(1).forEach(line => {
    const cols = line.split(',');
    const rec = {
      kind: cols[idx('type')] || 'purchase',
      desc: cols[idx('description')] || cols[idx('merchant')] || line,
      amount: cols[idx('amount')] || cols[idx('valor')] || '',
      currency: cols[idx('currency')] || 'BRL',
      ts: parseDt(cols[idx('date')] || cols[idx('time')]),
      id: cols[idx('id')] || ''
    };
    DB.payments.push(rec);
    if (/purchase|compra/i.test(rec.kind)) DB.events.push({ ts: rec.ts, type: 'pagamento', product: 'Google Pay', device: '', desc: `${rec.desc} ${rec.amount}` });
  });
}
function parsePayJson(text, path) {
  let payload;
  try { payload = JSON.parse(text); } catch (_) { return; }
  const items = Array.isArray(payload) ? payload : (payload.items || payload.instruments || payload.transactions || [payload]);
  items.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const p = path.toLowerCase();
    if (/method|card/.test(p) || item.last4 || item.cardNumber) {
      DB.payments.push({ kind: 'card', desc: `Cartão ${item.network || ''} ****${item.last4 || item.cardNumber || ''}`.trim(), amount: '', currency: '', ts: parseDt(item.created), id: item.id || '' });
    } else if (/profile/.test(p) || item.profileName) {
      DB.payments.push({ kind: 'profile', desc: item.profileName || item.name || 'Perfil', amount: '', currency: '', ts: parseDt(item.created), id: item.id || '' });
    } else {
      DB.payments.push({ kind: 'purchase', desc: item.description || item.merchant || item.title, amount: item.amount || item.value || '', currency: item.currency || 'BRL', ts: parseDt(item.date || item.timestamp), id: item.transactionId || item.id || '' });
    }
  });
}

async function sha256(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function ingestZip(blob, originalName) {
  $('progress').textContent = 'Lendo ZIP…';
  const buf = await blob.arrayBuffer();
  const hash = await sha256(buf);
  const zip = await JSZip.loadAsync(buf);
  const files = [];
  zip.forEach((path, file) => { if (!file.dir) files.push({ path, file }); });
  files.forEach(({ path }) => {
    const key = classify(path);
    DB.products[key] = DB.products[key] || { key, name: LABELS[key] || key, n: 0 };
    DB.products[key].n++;
  });
  DB.imports.push({ name: originalName, sha256: hash, size: blob.size, count: files.length, when: new Date() });

  for (const { path, file } of files) {
    const low = path.toLowerCase();
    const name = path.split('/').pop();
    if (/\.(jpe?g|png|webp|gif)$/i.test(name) && /photo|google photos|\.jpg$|\.jpeg$/i.test(low)) {
      const blobImg = await file.async('blob');
      const url = URL.createObjectURL(blobImg);
      let sidecar = {};
      const side = zip.file(path + '.json') || zip.file(path.replace(/[^/]+$/, name + '.json'));
      if (side) {
        try { sidecar = JSON.parse(await side.async('string')); } catch (_) {}
      }
      const geo = sidecar.geoData || sidecar.geoDataExif || {};
      const taken = (sidecar.photoTakenTime && sidecar.photoTakenTime.timestamp) || (sidecar.creationTime && sidecar.creationTime.timestamp);
      const rec = { name, url, ts: parseDt(taken), lat: geo.latitude || null, lon: geo.longitude || null, gps: !!(geo.latitude && geo.longitude) };
      if (rec.lat === 0 && rec.lon === 0) rec.gps = false;
      DB.photos.push(rec);
      DB.events.push({ ts: rec.ts, type: 'foto', product: 'Google Photos', device: '', desc: name, lat: rec.lat, lon: rec.lon });
      continue;
    }
    if (/\.(jpg|jpeg|png|gif|webp|mp4|crypt\d*)$/i.test(name) && !/whatsapp|msgstore/.test(low)) continue;
    let text = '';
    try { text = await file.async('string'); } catch (_) { continue; }
    if (/subscriberinfo|profile\.json|googleaccount/.test(low)) parseAccount(text, path);
    if (/deviceanduserprofile|android device/.test(low)) parseDevices(text, path);
    if (/records\.json|location history|semantic location/.test(low)) parseLocations(text, path);
    if (/my activity|myactivity|\/search\//.test(low) && low.endsWith('.json')) parseActivity(text, path);
    if (/\/drive\//.test(low) && !/whatsapp/.test(low) && !low.endsWith('.json')) parseDrive(name, text, path);
    if (low.endsWith('.mbox')) parseMbox(text);
    if (/google pay|googlepay|\/pay\//.test(low) && low.endsWith('.csv')) parsePayCsv(text);
    if (/google pay|googlepay|\/pay\//.test(low) && low.endsWith('.json')) parsePayJson(text, path);
    if (/whatsapp|msgstore\.db\.crypt/.test(low)) {
      DB.whatsapp.push({ name, date: new Date(), size: file._data ? file._data.uncompressedSize : blob.size, account: (DB.accounts[0] || {}).primary_email, note: 'Backup cifrado. Sem tentativa de quebra de cifra.' });
      DB.events.push({ ts: new Date(), type: 'whatsapp_backup', product: 'WhatsApp (Google Drive)', device: '', desc: `Backup detectado: ${name}` });
    }
  }
  // dedupe accounts by email
  const seen = new Set();
  DB.accounts = DB.accounts.filter(a => {
    const k = (a.primary_email || '').toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function alerts() {
  const by = {};
  DB.devices.forEach((d, i) => {
    [d.imei1, d.imei2].filter(Boolean).forEach(imei => {
      by[imei] = by[imei] || { imei, accounts: new Set(), models: new Set(), ids: [] };
      (d.accounts || []).forEach(a => by[imei].accounts.add(a));
      if (d.model) by[imei].models.add(d.model);
      by[imei].ids.push(i);
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
  $('products').innerHTML = Object.values(DB.products).map(p => `<span class="chip">${esc(p.name)} · ${p.n}</span>`).join('') || '<span class="chip">Nenhum produto ainda</span>';
  $('custody').innerHTML = DB.imports.map(i => `${esc(i.name)}<br>SHA-256: ${esc(i.sha256)}<br>${(i.size/1024/1024).toFixed(2)} MB · ${i.count} arquivos · ${fmt(i.when)}`).join('<hr>') || 'Nenhum ZIP importado.';
}
function renderPainel() {
  const a = alerts();
  $('alerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)} · ${esc(x.accounts.join(', '))}</div>`).join('');
  const c = {
    Contas: DB.accounts.length, Dispositivos: DB.devices.length, Eventos: DB.events.length,
    Locais: DB.locations.length, Fotos: DB.photos.length, Arquivos: DB.files.length,
    'E-mails': DB.emails.length, Pagamentos: DB.payments.length, Pesquisas: DB.searches.length,
    WhatsApp: DB.whatsapp.length, Produtos: Object.keys(DB.products).length, Alertas: a.length
  };
  $('stats').innerHTML = Object.entries(c).map(([k, n]) => `<div class="stat ${k==='Alertas'&&n?'alert':''}"><b>${n}</b><span>${k}</span></div>`).join('');
  $('accounts').innerHTML = DB.accounts.map(acc => `<article class="panel"><h3>${dash(acc.display_name || acc.primary_email)}</h3>
    <div class="kv">
      <b>Conta Google</b><span>${dash(acc.google_account)}</span>
      <b>Nome</b><span>${dash(acc.display_name)}</span>
      <b>E-mail principal</b><span>${dash(acc.primary_email)}</span>
      <b>E-mails alternativos</b><span>${dash((acc.alternate_emails||[]).join(', '))}</span>
      <b>Telefones</b><span>${dash((acc.phones||[]).join(', '))}</span>
      <b>Criação</b><span>${dash(fmt(acc.created_on))}</span>
      <b>Última atividade</b><span>${dash(fmt(acc.last_activity))}</span>
      <b>Status</b><span>${dash(acc.status)}</span>
      <b>Exclusão</b><span>${dash(fmt(acc.deletion_date))}</span>
    </div></article>`).join('') || '<div class="notice">Importe um ZIP para preencher o painel.</div>';
}
function renderDevices() {
  const a = alerts();
  $('deviceAlerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)} vinculado a ${esc(x.accounts.join(', '))}</div>`).join('');
  $('deviceTable').innerHTML = table(
    ['IMEI 1','IMEI 2','Modelo','Fabricante','Série','Primeiro vínculo','Último vínculo','Contas','Alerta'],
    DB.devices.map(d => `<tr><td>${dash(d.imei1)}</td><td>${dash(d.imei2)}</td><td>${dash(d.model)}</td><td>${dash(d.manufacturer)}</td><td>${dash(d.serial)}</td><td>${dash(fmt(d.first))}</td><td>${dash(fmt(d.last))}</td><td>${dash((d.accounts||[]).join(', '))}</td><td>${(d.accounts||[]).length>1?'<span class="chip warn">Mesmo aparelho vinculado a múltiplas contas</span>':'—'}</td></tr>`)
  );
}
function renderEvents() {
  const from = parseDt($('evFrom').value);
  const to = parseDt($('evTo').value);
  const rows = DB.events.filter(e => {
    const t = parseDt(e.ts);
    if (from && t && t < from) return false;
    if (to && t && t > to) return false;
    return true;
  }).sort((a, b) => (parseDt(a.ts) || 0) - (parseDt(b.ts) || 0));
  $('eventTable').innerHTML = table(
    ['Data','Hora','Evento','Produto Google','Dispositivo'],
    rows.map(e => `<tr><td>${dash(fmtDate(e.ts))}</td><td>${dash(fmtTime(e.ts))}</td><td>${dash(e.desc || e.type)}</td><td>${dash(e.product)}</td><td>${dash(e.device)}</td></tr>`)
  );
}
let map;
function renderMap() {
  const near = $('nearOnly').checked;
  const pts = DB.locations.filter(l => l.lat != null && (!near || nearCrime(l.ts)));
  const el = $('map');
  if (map) { map.remove(); map = null; }
  if (typeof L !== 'undefined' && pts.length) {
    map = L.map(el).setView([pts[0].lat, pts[0].lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    pts.forEach(p => {
      const isNear = nearCrime(p.ts);
      L.circleMarker([p.lat, p.lon], { radius: isNear ? 8 : 5, color: isNear ? '#8f3037' : '#2d6a56' })
        .addTo(map).bindPopup(`${esc(p.place || 'Ponto GPS')}<br>${esc(fmt(p.ts))}<br>${p.lat}, ${p.lon}`);
    });
    setTimeout(() => map.invalidateSize(), 200);
  } else if (!pts.length) {
    el.innerHTML = '<div class="notice">Sem pontos de localização neste ZIP.</div>';
  }
  $('locTable').innerHTML = table(
    ['Data','Hora','Latitude','Longitude','Permanência','Local','Próximo ao crime'],
    pts.map(l => `<tr><td>${dash(fmtDate(l.ts))}</td><td>${dash(fmtTime(l.ts))}</td><td>${dash(l.lat)}</td><td>${dash(l.lon)}</td><td>${l.duration != null ? Math.round(l.duration/60)+' min' : '—'}</td><td>${dash(l.place)}</td><td>${nearCrime(l.ts)?'SIM':'não'}</td></tr>`)
  );
}
function renderPhotos() {
  let list = DB.photos;
  if ($('photoGps').checked) list = list.filter(p => p.gps);
  if ($('photoNear').checked) list = list.filter(p => nearCrime(p.ts));
  $('photoGrid').innerHTML = list.map(p => `<figure><img src="${p.url}" alt="${esc(p.name)}"><figcaption><b>${esc(p.name)}</b><br>${dash(fmt(p.ts))}<br>GPS: ${p.gps ? p.lat+', '+p.lon : 'sem localização'}</figcaption></figure>`).join('') || '<div class="notice">Nenhuma foto extraída.</div>';
}
function renderFiles() {
  const q = $('fileQ').value;
  $('kw').innerHTML = KEYWORDS.map(k => `<button class="chip" type="button" data-kw="${k}">${k}</button>`).join('');
  const list = DB.files.filter(f => !q || fold(f.name + (f.keywords || []).join(' ')).includes(fold(q)) || (f.keywords || []).includes(q.toUpperCase()));
  $('fileTable').innerHTML = table(
    ['Nome','Tipo','Palavras','Caminho'],
    list.map(f => `<tr><td>${dash(f.name)}</td><td>${dash(f.type)}</td><td>${(f.keywords||[]).map(k=>`<span class="chip warn">${esc(k)}</span>`).join(' ')||'—'}</td><td class="hash">${dash(f.path)}</td></tr>`)
  );
}
function renderMail() {
  const q = fold($('mailQ').value);
  const list = DB.emails.filter(m => !q || fold([m.from, m.to, m.subject, m.body, m.ip, m.id].join(' ')).includes(q));
  $('mailTable').innerHTML = table(
    ['Remetente','Destinatário','Data','Assunto','Texto','ID','IP'],
    list.map(m => `<tr><td>${dash(m.from)}</td><td>${dash(m.to)}</td><td>${dash(fmt(m.date))}</td><td>${dash(m.subject)}</td><td>${dash((m.body||'').slice(0,140))}</td><td class="hash">${dash(m.id)}</td><td>${dash(m.ip)}</td></tr>`)
  );
}
function renderPay() {
  $('payTable').innerHTML = table(
    ['Tipo','Descrição','Valor','Moeda','Data','ID'],
    DB.payments.map(p => `<tr><td>${dash(p.kind)}</td><td>${dash(p.desc)}</td><td>${dash(p.amount)}</td><td>${dash(p.currency)}</td><td>${dash(fmt(p.ts))}</td><td class="hash">${dash(p.id)}</td></tr>`)
  );
}
function renderSearch() {
  $('searchTable').innerHTML = table(
    ['Termo','Data','Hora','Dispositivo'],
    DB.searches.map(s => `<tr><td>${dash(s.query)}</td><td>${dash(fmtDate(s.ts))}</td><td>${dash(fmtTime(s.ts))}</td><td>${dash(s.device)}</td></tr>`)
  );
}
function renderWa() {
  $('waTable').innerHTML = table(
    ['Arquivo','Data','Conta','Observação'],
    DB.whatsapp.map(w => `<tr><td>${dash(w.name)}</td><td>${dash(fmt(w.date))}</td><td>${dash(w.account)}</td><td>${dash(w.note)}</td></tr>`)
  );
}
function renderCorr() {
  const a = alerts();
  $('chain').innerHTML = ['CONTA GOOGLE','IMEI','LOCALIZAÇÃO','FOTOS','ARQUIVOS','PAGAMENTOS','EVENTOS'].map((x,i)=>`${i?' <b>↓</b> ':''}<span class="chip">${x}</span>`).join('');
  $('corrAlerts').innerHTML = a.map(x => `<div class="alert">${esc(x.alert)} — IMEI ${esc(x.imei)} · ${esc(x.accounts.join(' · '))}</div>`).join('');
  $('corrList').innerHTML = `<div class="panel"><div class="kv">
    <b>Conta</b><span>${dash((DB.accounts[0]||{}).primary_email)}</span>
    <b>Aparelhos</b><span>${DB.devices.map(d=>d.model||d.imei1).join(', ')||'—'}</span>
    <b>Pontos GPS</b><span>${DB.locations.length}</span>
    <b>Fotos</b><span>${DB.photos.length}</span>
    <b>Arquivos-chave</b><span>${DB.files.filter(f=>f.keywords.length).map(f=>f.name).join(', ')||'—'}</span>
    <b>Pagamentos</b><span>${DB.payments.length}</span>
    <b>Eventos</b><span>${DB.events.length}</span>
  </div></div>`;
}

const loaders = {
  importar: renderImport, painel: renderPainel, dispositivos: renderDevices, eventos: renderEvents,
  mapa: renderMap, fotos: renderPhotos, arquivos: renderFiles, gmail: renderMail,
  pagamentos: renderPay, pesquisas: renderSearch, whatsapp: renderWa, correlacao: renderCorr
};

function show(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  loaders[name]?.();
  try { parent.postMessage({ type: 'pcpr-fit', module: 'googleanalise' }, '*'); } catch (_) {}
}

async function runFile(file) {
  reset();
  $('progress').textContent = 'Analisando ' + file.name + '…';
  try {
    await ingestZip(file, file.name);
    $('progress').textContent = 'Concluído.';
    renderImport();
    show('painel');
  } catch (err) {
    $('progress').textContent = 'Falha: ' + err.message;
  }
}

async function demo() {
  if (!window.JSZip) { $('progress').textContent = 'JSZip não carregou. Atualize a página.'; return; }
  $('progress').textContent = 'Gerando produção fictícia…';
  const zip = new JSZip();
  zip.file('GoogleAccount.SubscriberInfo.html', `<table>
  <tr><th>Name</th><td>João Carlos da Silva</td></tr>
  <tr><th>Primary Email</th><td>joao.silva.investigado@gmail.com</td></tr>
  <tr><th>Alternate Emails</th><td>jcsilva.alt@gmail.com, joao.trabalho@gmail.com</td></tr>
  <tr><th>Phone</th><td>+55 41 99999-1234</td></tr>
  <tr><th>Phone</th><td>+55 41 3333-4455</td></tr>
  <tr><th>Account Created</th><td>2015-03-12T14:22:00Z</td></tr>
  <tr><th>Last Activity</th><td>2024-09-15T11:04:00Z</td></tr>
  <tr><th>Status</th><td>Ativa</td></tr>
  </table>`);
  zip.file('Takeout/Android Device Configuration Service/DeviceAndUserProfile.json', JSON.stringify([
    { modelName: 'SM-G991B', manufacturer: 'samsung', serialNumber: 'R58M32ABCDE', firstRegistrationTime: '2022-01-18T10:00:00Z', lastUsedTime: '2024-09-10T23:55:00Z',
      deviceData: [{ displayName: 'IMEI 1', value: '353325110000001' }, { displayName: 'IMEI 2', value: '353325110000118' }],
      userInfo: [{ emailAddress: 'joao.silva.investigado@gmail.com' }, { emailAddress: 'maria.oliveira.alt@gmail.com' }] },
    { modelName: 'moto g54 5G', manufacturer: 'motorola', serialNumber: 'ZY22ABCXYZ', firstRegistrationTime: '2023-07-01T12:00:00Z', lastUsedTime: '2024-08-20T08:00:00Z',
      deviceData: [{ displayName: 'IMEI 1', value: '351608111234568' }], userInfo: [{ emailAddress: 'joao.silva.investigado@gmail.com' }] }
  ]));
  zip.file('Takeout/Location History/Records.json', JSON.stringify({ locations: [
    { timestamp: '2024-09-10T21:18:00Z', latitudeE7: -254284000, longitudeE7: -492733000, accuracy: 18 },
    { timestamp: '2024-09-10T21:35:00Z', latitudeE7: -254429000, longitudeE7: -492673000, accuracy: 12 },
    { timestamp: '2024-09-08T14:00:00Z', latitudeE7: -254372000, longitudeE7: -492654000, accuracy: 25 }
  ]}));
  zip.file('Takeout/Location History/Semantic Location History/2024/2024_SEPTEMBER.json', JSON.stringify({ timelineObjects: [{ placeVisit: { location: { latitudeE7: -254284000, longitudeE7: -492733000, name: 'Centro Cívico — Curitiba/PR' }, duration: { startTimestamp: '2024-09-10T21:10:00Z', endTimestamp: '2024-09-10T21:55:00Z' } } }] }));
  zip.file('Takeout/My Activity/Search/MyActivity.json', JSON.stringify([
    { header: 'Search', title: 'Pesquisou por PIX banco', time: '2024-09-10T20:05:00.000Z', deviceInformation: { deviceType: 'ANDROID' } },
    { header: 'Search', title: 'Pesquisou por arma de fogo curitiba', time: '2024-09-10T20:22:00.000Z', deviceInformation: { deviceType: 'ANDROID' } }
  ]));
  zip.file('Takeout/Drive/Documentos/comprovante_pix.txt', 'Comprovante PIX\nCPF 123.456.789-09\nBANCO Exemplo\nVALOR R$ 4.800,00\nNOME João Carlos da Silva\nTELEFONE 41999991234\n');
  zip.file('Takeout/Mail/All mail Including Spam and Trash.mbox', 'From MAILER-DAEMON\nFrom: banco.alertas@bancoexemplo.com.br\nTo: joao.silva.investigado@gmail.com\nSubject: Comprovante PIX no valor de R$ 4.800,00\nDate: Tue, 10 Sep 2024 18:12:11 -0300\nMessage-ID: <pix-4800@bancoexemplo.com.br>\nX-Originating-IP: [200.152.44.18]\n\nTransferência PIX realizada.\n');
  zip.file('Takeout/Google Pay/GooglePay Transactions.csv', 'Date,Description,Amount,Currency,Transaction ID,Type\n2024-09-10 18:12:00,PIX Banco Exemplo,4800.00,BRL,TX-PIX-4800,purchase\n');
  zip.file('Takeout/Drive/WhatsApp/Databases/msgstore.db.crypt14', 'WHATSAPP ENCRYPTED BACKUP PLACEHOLDER');
  const blob = await zip.generateAsync({ type: 'blob' });
  $('crimeDate').value = '2024-09-10T21:30';
  await runFile(new File([blob], 'Google_LERS_Producao_DEMO.zip'));
}

function report() {
  const acc = DB.accounts[0] || {};
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — Quebra Google</title>
  <style>body{font-family:Arial;max-width:800px;margin:24px auto;color:#111}h1{color:#183a31}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:12px}</style></head><body>
  <h1>POLÍCIA CIVIL DO PARANÁ — RELATÓRIO DE QUEBRA GOOGLE</h1>
  <p>Gerado em ${fmt(new Date())}. Conferir com os originais da produção.</p>
  <h2>1. Conta</h2><p>${esc(acc.display_name)} — ${esc(acc.primary_email)} — ${esc((acc.phones||[]).join(', '))}</p>
  <h2>2. Dispositivos</h2>${DB.devices.map(d=>`<p>${esc(d.model)} IMEI ${esc(d.imei1)} contas ${esc((d.accounts||[]).join(', '))}</p>`).join('')}
  <h2>3. Alertas</h2>${alerts().map(a=>`<p><b>${esc(a.alert)}</b> ${esc(a.imei)} ${esc(a.accounts.join(', '))}</p>`).join('')||'<p>Nenhum</p>'}
  <h2>4. Eventos</h2>${DB.events.slice(0,80).map(e=>`<p>${esc(fmt(e.ts))} — ${esc(e.product)} — ${esc(e.desc)}</p>`).join('')}
  <h2>5. Locais</h2>${DB.locations.slice(0,40).map(l=>`<p>${esc(fmt(l.ts))} ${l.lat}, ${l.lon} ${esc(l.place||'')}</p>`).join('')}
  <h2>6. Arquivos</h2>${DB.files.filter(f=>f.keywords.length).map(f=>`<p>${esc(f.name)} ${esc(f.keywords.join(', '))}</p>`).join('')}
  <h2>7. Pagamentos</h2>${DB.payments.map(p=>`<p>${esc(p.kind)} ${esc(p.desc)} ${esc(p.amount)} ${esc(p.id)}</p>`).join('')}
  <h2>8. Custódia</h2>${DB.imports.map(i=>`<p>${esc(i.name)} SHA-256 ${esc(i.sha256)}</p>`).join('')}
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
$('pick').onclick = () => $('file').click();
$('file').onchange = e => { if (e.target.files[0]) runFile(e.target.files[0]); };
$('demo').onclick = demo;
$('drop').addEventListener('click', e => { if (e.target.id === 'drop' || e.target.closest('.drop') === $('drop') && !e.target.closest('button,input')) $('file').click(); });
['dragenter','dragover'].forEach(ev => $('drop').addEventListener(ev, e => { e.preventDefault(); }));
$('drop').addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) runFile(e.dataTransfer.files[0]); });
$('evFilter').onclick = renderEvents;
$('nearOnly').onchange = renderMap;
$('photoNear').onchange = renderPhotos;
$('photoGps').onchange = renderPhotos;
$('fileQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderFiles(); });
$('kw').addEventListener('click', e => { const b = e.target.closest('[data-kw]'); if (!b) return; $('fileQ').value = b.dataset.kw; renderFiles(); });
$('mailQ').addEventListener('keydown', e => { if (e.key === 'Enter') renderMail(); });
$('makeReport').onclick = report;
$('crimeDate').addEventListener('change', () => { const v = document.querySelector('.nav button.active')?.dataset.view; if (v) loaders[v]?.(); });

if (!window.JSZip) $('progress').textContent = 'Atualize a página se o seletor de ZIP não abrir.';
try { parent.postMessage({ type: 'pcpr-fit', module: 'googleanalise' }, '*'); } catch (_) {}
document.documentElement.dataset.quebraReady = '1';
})();
