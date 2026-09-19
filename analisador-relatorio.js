/*
RELATÓRIO DE ANÁLISE INVESTIGATIVA — QUEBRA GOOGLE (PCPR)
Monta o relatório a partir apenas do que foi encontrado na produção importada.
Nenhum dado é presumido: campo ausente é apresentado como indisponível.
*/
(() => {
'use strict';

const NA = 'Não disponível na produção';
const EMU_IN = 914400;
const PAGE_IN = 6.1;

function api() { return window.PCPRQuebra; }
function H() { return window.PCPRQuebra.helpers; }
const $ = id => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function txt(v) { return (v === 0 ? '0' : (v ? String(v) : NA)); }
function num(v) {
  const s = String(v ?? '').replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  const normal = s.includes(',') && (!s.includes('.') || s.lastIndexOf(',') > s.lastIndexOf('.'))
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
function money(v, currency) {
  const n = num(v);
  if (n == null) return txt(v);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '');
}
function rank(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit || 10);
}
function opts() {
  return {
    photos: $('optPhotos') ? $('optPhotos').checked : true,
    onlyRelevant: $('optOnlyRelevant') ? $('optOnlyRelevant').checked : true,
    photoMax: Math.max(1, Math.min(60, Number($('optPhotoMax')?.value || 12)))
  };
}

/* ---------- análise ---------- */

function crimeInfo() {
  const h = H();
  const date = h.parseDt($('crimeDate')?.value);
  const hours = h.crimeHours();
  return {
    date, hours,
    from: date ? new Date(date.getTime() - hours * 3600e3) : null,
    to: date ? new Date(date.getTime() + hours * 3600e3) : null
  };
}

function ipRecords() {
  const { DB } = api();
  const h = H();
  const out = [];
  const push = (ip, rec) => {
    if (!ip) return;
    out.push(Object.assign({ ip, version: h.isIpv6(ip) ? 6 : 4 }, rec));
  };
  DB.access.forEach(a => {
    h.ipsAny([a.ip, a.extra].join(' ')).forEach(ip => push(ip, {
      ts: a.ts, account: a.account, device: a.device,
      product: a.service || 'Access Log Activity',
      event: [a.service, a.event].filter(Boolean).join(' · ') || 'Registro de acesso',
      source: a.source
    }));
  });
  DB.emails.forEach(m => {
    h.ipsAny([m.ip, m.headers].join(' ')).forEach(ip => push(ip, {
      ts: m.date, account: m.to || m.from, device: '',
      product: 'Mail', event: 'E-mail: ' + (m.subject || '(sem assunto)'), source: m.source
    }));
  });
  DB.index.forEach(ix => {
    if (ix.context === 'IP') return;
    h.ipsAny(String(ix.text || '').slice(0, 20000)).slice(0, 20).forEach(ip => push(ip, {
      ts: ix.ts, account: ix.account, device: '',
      product: ix.product, event: ix.context || 'Registro em arquivo', source: ix.file
    }));
  });
  return out;
}

function ipGroups() {
  const h = H();
  const map = new Map();
  ipRecords().forEach(r => {
    let g = map.get(r.ip);
    if (!g) {
      g = { ip: r.ip, version: r.version, count: 0, accounts: new Set(), products: new Set(), devices: new Set(), days: new Map(), first: null, last: null, events: [] };
      map.set(r.ip, g);
    }
    g.count++;
    if (r.account) g.accounts.add(r.account);
    if (r.product) g.products.add(r.product);
    if (r.device) g.devices.add(r.device);
    const d = h.parseDt(r.ts);
    if (d) {
      const key = h.fmtDate(d);
      g.days.set(key, (g.days.get(key) || 0) + 1);
      if (!g.first || d < g.first) g.first = d;
      if (!g.last || d > g.last) g.last = d;
    }
    if (g.events.length < 30) g.events.push(r);
  });
  return [...map.values()]
    .map(g => ({
      ip: g.ip, version: g.version, count: g.count,
      accounts: [...g.accounts], products: [...g.products], devices: [...g.devices],
      days: [...g.days.entries()].sort((a, b) => b[1] - a[1]),
      first: g.first, last: g.last, events: g.events
    }))
    .sort((a, b) => (b.version - a.version) || (b.count - a.count) || a.ip.localeCompare(b.ip));
}

function deviceForLabel(label) {
  const { DB } = api();
  const h = H();
  const l = h.fold(label || '');
  if (!l) return null;
  return DB.devices.find(d => {
    const model = h.fold(d.model || '');
    const man = h.fold(d.manufacturer || '');
    return (model && (l.includes(model) || model.includes(l))) || (man && l.includes(man));
  }) || null;
}

function productsWithData() {
  const { DB } = api();
  const list = [
    ['Google Account', DB.accounts.length], ['Android Device Configuration', DB.devices.length],
    ['Access Log Activity', DB.access.length], ['My Activity', DB.events.filter(e => e.type === 'atividade').length],
    ['Timeline', DB.locations.length], ['Google Photos', DB.photos.length], ['Chrome', DB.chrome.length],
    ['Drive', DB.drive.length], ['Mail', DB.emails.length], ['Google Pay', DB.payments.length],
    ['Drive Mobile Backups', DB.backups.length]
  ];
  return list.filter(([, n]) => n > 0);
}

function photoScore(p) {
  const h = H();
  const reasons = [];
  if (h.nearCrime(p.ts)) reasons.push('Registro na janela da data do fato');
  if (p.gps) reasons.push('Coordenadas GPS no arquivo');
  if (p.kind === 'vídeo') reasons.push('Arquivo de vídeo');
  if (p.device) reasons.push('Dispositivo informado no metadado');
  if (p.meta && (p.meta.description || p.meta.people)) reasons.push('Descrição/pessoas no metadado');
  return reasons;
}

function relevantPhotos(o) {
  const { DB } = api();
  const h = H();
  const list = DB.photos.map(p => ({ photo: p, reasons: photoScore(p) }));
  const sel = o.onlyRelevant ? list.filter(x => x.reasons.length) : list;
  return sel.sort((a, b) => {
    const na = h.nearCrime(a.photo.ts) ? 1 : 0;
    const nb = h.nearCrime(b.photo.ts) ? 1 : 0;
    if (na !== nb) return nb - na;
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    return (h.parseDt(a.photo.ts) || 0) - (h.parseDt(b.photo.ts) || 0);
  });
}

function driveRelevant() {
  const { DB } = api();
  const h = H();
  return DB.drive
    .map(f => {
      const hits = (f.keywords || []).length ? f.keywords : h.kwHits(f.name + '\n' + (f.text || ''));
      return {
        name: f.name, type: f.type, mime: f.mime, path: f.path,
        date: f.modified || f.created, hits,
        snippets: hits.slice(0, 4).map(k => ({ kw: k, text: h.kwSnippet(f.name + '\n' + (f.text || ''), k) }))
      };
    })
    .filter(f => f.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);
}

function gmailAnalysis() {
  const { DB } = api();
  const h = H();
  const own = new Set(DB.accounts.flatMap(a => [a.primary_email, ...(a.alternate_emails || [])]).filter(Boolean).map(x => x.toLowerCase()));
  const counts = new Map();
  DB.emails.forEach(m => {
    h.uniq(h.emails([m.from, m.to, m.cc].join(' '))).forEach(e => {
      if (own.has(e)) return;
      counts.set(e, (counts.get(e) || 0) + 1);
    });
  });
  const near = DB.emails.filter(m => h.nearCrime(m.date));
  const withKw = DB.emails
    .map(m => ({ mail: m, hits: h.kwHits([m.subject, m.body].join('\n')) }))
    .filter(x => x.hits.length);
  return { total: DB.emails.length, ranking: rank(counts, 15), near, withKw };
}

function payAnalysis() {
  const { DB } = api();
  const h = H();
  const totals = new Map();
  const merchants = new Map();
  DB.payments.forEach(p => {
    const n = num(p.amount);
    if (n != null) {
      const cur = (p.currency || '').trim() || 'sem moeda informada';
      const t = totals.get(cur) || { sum: 0, n: 0 };
      t.sum += n; t.n++;
      totals.set(cur, t);
    }
    const key = (p.desc || '').trim();
    if (key) merchants.set(key, (merchants.get(key) || 0) + 1);
  });
  const withTs = DB.payments.filter(p => h.parseDt(p.ts)).sort((a, b) => h.parseDt(a.ts) - h.parseDt(b.ts));
  return {
    total: DB.payments.length,
    totals: [...totals.entries()],
    merchants: rank(merchants, 10),
    near: DB.payments.filter(p => h.nearCrime(p.ts)),
    timeline: withTs,
    profiles: h.uniq(DB.payments.map(p => p.profile)).filter(Boolean),
    instruments: h.uniq(DB.payments.map(p => p.instrument)).filter(Boolean)
  };
}

function behaviour() {
  const { DB } = api();
  const h = H();
  const c = crimeInfo();
  const items = [];
  DB.searches.forEach(s => items.push({ ts: s.ts, kind: 'Pesquisa', product: s.product || 'My Activity', desc: s.query, extra: s.url || '', device: s.device || '' }));
  DB.chrome.filter(x => x.kind === 'histórico').forEach(x => items.push({ ts: x.ts, kind: 'Site acessado', product: 'Chrome', desc: x.title || x.url, extra: x.url, device: '' }));
  DB.events.filter(e => e.type === 'atividade').forEach(e => items.push({ ts: e.ts, kind: 'Atividade', product: e.product || 'My Activity', desc: e.desc, extra: e.url || '', device: e.device || '' }));
  items.sort((a, b) => (h.parseDt(a.ts) || 0) - (h.parseDt(b.ts) || 0));
  const apps = new Map();
  items.forEach(i => apps.set(i.product, (apps.get(i.product) || 0) + 1));
  if (!c.date) return { hasCrime: false, antes: [], durante: [], depois: [], todos: items, apps: rank(apps, 12) };
  const antes = [], durante = [], depois = [];
  items.forEach(i => {
    const d = h.parseDt(i.ts);
    if (!d) return;
    if (d < c.from) antes.push(i);
    else if (d > c.to) depois.push(i);
    else durante.push(i);
  });
  return { hasCrime: true, antes, durante, depois, todos: items, apps: rank(apps, 12) };
}

function timelineRows() {
  const { DB } = api();
  const h = H();
  return DB.events
    .filter(e => h.parseDt(e.ts))
    .map(e => ({
      ts: h.parseDt(e.ts), evento: e.desc || e.type, produto: e.product || '',
      local: e.place || (e.lat != null ? e.lat + ', ' + e.lon : ''), device: e.device || '', ip: e.ip || '',
      near: h.nearCrime(e.ts)
    }))
    .sort((a, b) => a.ts - b.ts);
}

function correlationNarratives() {
  const { DB } = api();
  const h = H();
  const out = [];
  const prods = productsWithData().map(([p]) => p);
  DB.devices.forEach(d => {
    const ident = d.imei1 || d.imei2 || d.serial || d.android_id;
    if (!ident) return;
    const contas = (d.accounts || []).length ? d.accounts : DB.accounts.map(a => a.primary_email).filter(Boolean);
    if (!contas.length) return;
    out.push('Foi identificado que a conta Google ' + contas[0] + ' esteve associada ao dispositivo ' +
      (d.model ? d.model + ' ' : '') + (d.imei1 ? 'IMEI ' + d.imei1 : 'identificador ' + ident) +
      ', constando registros de atividade nos produtos ' + (prods.join(', ') || NA) + ' no período analisado.');
  });
  const groups = ipGroups();
  if (groups.length) {
    const top = groups[0];
    out.push('O endereço IP' + (top.version === 6 ? 'v6' : 'v4') + ' ' + top.ip + ' é o de maior recorrência na produção, com ' +
      top.count + ' registro(s)' +
      (top.first ? ' entre ' + h.fmt(top.first) + ' e ' + h.fmt(top.last) : '') +
      (top.accounts.length ? ', vinculado à(s) conta(s) ' + top.accounts.join(', ') : '') +
      (top.products.length ? ', nos produtos ' + top.products.join(', ') : '') + '.');
  }
  return out;
}

function multiAccountDevices() {
  const { DB, alerts } = api();
  const h = H();
  return alerts().map(a => {
    const devs = DB.devices.filter(d => [d.imei1, d.imei2].filter(Boolean).includes(a.imei));
    const datas = devs.map(d => [h.fmt(d.first), h.fmt(d.last)].filter(Boolean).join(' até ')).filter(Boolean);
    return { imei: a.imei, accounts: a.accounts, models: a.models, datas };
  });
}

function buildModel() {
  const { DB } = api();
  const h = H();
  const o = opts();
  const c = crimeInfo();
  const acc = DB.accounts[0] || {};
  const tl = timelineRows();
  const ipg = ipGroups();
  const behav = behaviour();
  const drive = driveRelevant();
  const gmail = gmailAnalysis();
  const pay = payAnalysis();
  const fotos = relevantPhotos(o).slice(0, o.photoMax);
  const registros = {
    'Contas': DB.accounts.length, 'Dispositivos': DB.devices.length, 'Access Log': DB.access.length,
    'Eventos de atividade': DB.events.length, 'Localizações': DB.locations.length, 'Fotos e vídeos': DB.photos.length,
    'Arquivos Drive': DB.drive.length, 'E-mails': DB.emails.length, 'Transações': DB.payments.length,
    'Chrome': DB.chrome.length, 'Backups': DB.backups.length, 'Endereços IP distintos': ipg.length
  };
  const elementos = [
    { titulo: 'Contas Google vinculadas', itens: h.uniq([acc.primary_email, ...(acc.alternate_emails || []), ...DB.accounts.map(a => a.primary_email), ...DB.devices.flatMap(d => d.accounts || [])]) },
    { titulo: 'Dispositivos', itens: DB.devices.map(d => [d.model, d.manufacturer, d.serial ? 'série ' + d.serial : ''].filter(Boolean).join(' · ')) },
    { titulo: 'IMEIs', itens: h.uniq(DB.devices.flatMap(d => [d.imei1, d.imei2])).filter(Boolean) },
    { titulo: 'Locais relevantes', itens: h.uniq(DB.locations.filter(l => !c.date || h.nearCrime(l.ts)).map(l => (l.place || (l.lat + ', ' + l.lon)) + ' — ' + (h.fmt(l.ts) || NA))).slice(0, 20) },
    { titulo: 'Datas próximas ao fato', itens: c.date ? h.uniq(tl.filter(r => r.near).map(r => h.fmtDate(r.ts))) : [] , nota: c.date ? ('Janela de ' + c.hours + ' h antes e depois de ' + h.fmt(c.date)) : 'Data do fato não informada no Painel.' },
    { titulo: 'Fotos e vídeos de interesse', itens: fotos.map(f => (f.photo.original || f.photo.name) + ' — ' + (h.fmt(f.photo.ts) || NA) + (f.photo.gps ? ' — GPS ' + f.photo.lat + ', ' + f.photo.lon : '')) },
    { titulo: 'Arquivos relevantes', itens: drive.map(f => f.name + ' — ' + f.hits.join(', ')) },
    { titulo: 'Pesquisas realizadas', itens: DB.searches.map(s => s.query + ' — ' + (h.fmt(s.ts) || NA)).slice(0, 25) },
    { titulo: 'Transações', itens: DB.payments.map(p => [p.desc, money(p.amount, p.currency), h.fmt(p.ts)].filter(Boolean).join(' — ')).slice(0, 25) },
    { titulo: 'IPs relevantes', itens: ipg.slice(0, 10).map(g => 'IP' + (g.version === 6 ? 'v6' : 'v4') + ' ' + g.ip + ' — ' + g.count + ' registro(s)') },
    { titulo: 'Correlações entre produtos', itens: correlationNarratives() }
  ];
  const conclusao = conclusion({ acc, tl, ipg, drive, gmail, pay, behav, fotos, registros, c });
  return {
    geradoEm: new Date(),
    identificacao: {
      imports: DB.imports, contas: DB.accounts, produtos: productsWithData(),
      arquivos: DB.files.length, zips: DB.zips.length, registros
    },
    elementos, dispositivos: DB.devices, multiConta: multiAccountDevices(),
    ips: { v6: ipg.filter(g => g.version === 6), v4: ipg.filter(g => g.version === 4), todos: ipg },
    timeline: tl, crime: c, fotos, drive, gmail, pay, behav, conclusao,
    grafo: grafo({ acc, ipg, drive, gmail, pay }),
    opcoes: opts()
  };
}

function grafo(ctx) {
  const { DB } = api();
  const h = H();
  const acc = ctx.acc || {};
  return {
    centro: acc.primary_email || acc.google_account || 'Conta não identificada na produção',
    nos: [
      { id: 'imei', label: 'IMEI', n: h.uniq(DB.devices.flatMap(d => [d.imei1, d.imei2])).filter(Boolean).length, itens: h.uniq(DB.devices.flatMap(d => [d.imei1, d.imei2])).filter(Boolean) },
      { id: 'ips', label: 'IPs', n: ctx.ipg.length, itens: ctx.ipg.slice(0, 12).map(g => g.ip + ' (' + g.count + ')') },
      { id: 'fotos', label: 'Fotos', n: DB.photos.length, itens: DB.photos.slice(0, 12).map(p => p.original || p.name) },
      { id: 'locais', label: 'Localizações', n: DB.locations.length, itens: h.uniq(DB.locations.map(l => l.place || (l.lat + ', ' + l.lon))).slice(0, 12) },
      { id: 'arquivos', label: 'Arquivos', n: DB.drive.length, itens: ctx.drive.slice(0, 12).map(f => f.name + ' — ' + f.hits.join(', ')) },
      { id: 'emails', label: 'E-mails', n: DB.emails.length, itens: ctx.gmail.ranking.slice(0, 12).map(([e, n]) => e + ' (' + n + ')') },
      { id: 'pagamentos', label: 'Pagamentos', n: DB.payments.length, itens: DB.payments.slice(0, 12).map(p => [p.desc, money(p.amount, p.currency)].filter(Boolean).join(' — ')) }
    ]
  };
}

function conclusion(ctx) {
  const { DB } = api();
  const h = H();
  const out = [];
  const imports = DB.imports;
  if (imports.length) {
    out.push('Foram analisados ' + DB.files.length + ' arquivo(s) extraídos de ' + imports.length + ' envio(s) da produção Google, incluindo ' +
      DB.zips.length + ' arquivo(s) compactado(s) internos, com hash SHA-256 registrado na seção 1.');
  }
  const acc = ctx.acc;
  if (acc && acc.primary_email) {
    out.push('A produção registra a conta Google ' + acc.primary_email +
      (acc.display_name ? ', identificada como ' + acc.display_name : '') +
      (acc.created_on ? ', com criação em ' + h.fmt(acc.created_on) : '') +
      (acc.last_activity ? ' e última atividade em ' + h.fmt(acc.last_activity) : '') + '.');
  }
  correlationNarratives().forEach(s => out.push(s));
  ctx.tl.length && out.push('A linha do tempo reúne ' + ctx.tl.length + ' evento(s) datado(s), de ' +
    h.fmt(ctx.tl[0].ts) + ' a ' + h.fmt(ctx.tl[ctx.tl.length - 1].ts) + '.');
  if (ctx.c.date) {
    const near = ctx.tl.filter(r => r.near).length;
    out.push('Considerando a data do fato informada (' + h.fmt(ctx.c.date) + ') e a janela de ' + ctx.c.hours +
      ' hora(s), foram localizados ' + near + ' evento(s) no intervalo.');
  }
  const multi = multiAccountDevices();
  multi.forEach(m => out.push('O IMEI ' + m.imei + ' aparece vinculado a mais de uma conta na produção (' + m.accounts.join(', ') +
    '). Trata-se do vínculo registrado nos arquivos, sem identificação de pessoa.'));
  if (ctx.ipg.length) {
    const v6 = ctx.ipg.filter(g => g.version === 6).length;
    out.push('Foram identificados ' + ctx.ipg.length + ' endereço(s) IP distintos, sendo ' + v6 + ' IPv6 e ' +
      (ctx.ipg.length - v6) + ' IPv4, agrupados por recorrência na seção 4.');
  }
  if (ctx.drive.length) out.push('No Drive constam ' + ctx.drive.length + ' arquivo(s) com termos de interesse pesquisados automaticamente.');
  if (ctx.gmail.total) out.push('Foram processadas ' + ctx.gmail.total + ' mensagem(ns) de e-mail' +
    (ctx.gmail.ranking.length ? ', com maior recorrência do endereço ' + ctx.gmail.ranking[0][0] + ' (' + ctx.gmail.ranking[0][1] + ' interação(ões))' : '') + '.');
  if (ctx.pay.total) out.push('O Google Pay apresenta ' + ctx.pay.total + ' registro(s) financeiro(s)' +
    (ctx.pay.totals.length ? ', somando ' + ctx.pay.totals.map(([cur, t]) => money(t.sum, cur === 'sem moeda informada' ? '' : cur)).join('; ') : '') +
    '. Os valores são os constantes na produção, sem classificação de ilicitude.');
  if (ctx.fotos.length) out.push('Foram selecionadas ' + ctx.fotos.length + ' imagem(ns)/vídeo(s) de interesse por proximidade temporal, coordenadas ou metadados.');
  const ausentes = ['Google Photos', 'Timeline', 'Drive', 'Mail', 'Google Pay', 'Chrome', 'Access Log Activity']
    .filter(p => !productsWithData().some(([x]) => x === p));
  if (ausentes.length) out.push('A produção analisada não apresentou registros dos seguintes produtos: ' + ausentes.join(', ') + '.');
  out.push('Os elementos acima são vínculos técnicos registrados na produção Google. Sua valoração cabe à autoridade policial responsável pela investigação.');
  return out;
}

/* ---------- prévia na tela ---------- */

function preview() {
  const box = $('reportPreview');
  if (!box) return;
  const { DB } = api();
  if (!DB.imports.length) {
    box.innerHTML = '<div class="notice">Importe a produção na aba Importar para gerar o relatório.</div>';
    return;
  }
  const h = H();
  const m = buildModel();
  const list = arr => arr && arr.length ? '<ul>' + arr.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="na">' + NA + '</p>';
  box.innerHTML = `
    <div class="corr-block"><b>PRINCIPAIS ELEMENTOS IDENTIFICADOS</b>
      ${m.elementos.map(e => `<h4>${esc(e.titulo)}</h4>${e.nota ? '<p class="na">' + esc(e.nota) + '</p>' : ''}${list(e.itens)}`).join('')}
    </div>
    <div class="corr-block"><b>IPs POR RECORRÊNCIA (IPv6 primeiro)</b>
      ${m.ips.todos.length ? '<table><thead><tr><th>IP</th><th>Versão</th><th>Conexões</th><th>Primeiro</th><th>Último</th><th>Contas</th><th>Produtos</th></tr></thead><tbody>' +
        m.ips.todos.slice(0, 20).map(g => `<tr><td class="hash">${esc(g.ip)}</td><td>IPv${g.version}</td><td>${g.count}</td><td>${esc(h.fmt(g.first) || NA)}</td><td>${esc(h.fmt(g.last) || NA)}</td><td>${esc(g.accounts.join(', ') || NA)}</td><td>${esc(g.products.join(', ') || NA)}</td></tr>`).join('') +
        '</tbody></table>' : '<p class="na">' + NA + '</p>'}
    </div>
    <div class="corr-block"><b>CONSIDERAÇÕES ANALÍTICAS</b>${list(m.conclusao)}</div>`;
  if ($('reportStatus')) {
    $('reportStatus').textContent = 'Prévia atualizada: ' + m.timeline.length + ' evento(s) datados, ' +
      m.ips.todos.length + ' IP(s), ' + m.fotos.length + ' foto(s) selecionada(s).';
  }
}

/* ---------- fotos em base64 ---------- */

async function photoData(sel) {
  const out = [];
  for (const item of sel) {
    const p = item.photo;
    try {
      const buf = await (await fetch(p.url)).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const name = String(p.name || '').toLowerCase();
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const ext = png || name.endsWith('.png') ? 'png' : (jpg || /\.jpe?g$/.test(name) ? 'jpeg' : '');
      const mime = ext ? 'image/' + ext : (p.kind === 'vídeo' ? 'video/mp4' : 'application/octet-stream');
      const dataUrl = 'data:' + mime + ';base64,' + b64;
      let w = 0, h = 0;
      if (ext) {
        const dim = await new Promise(res => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => res({ w: 0, h: 0 });
          img.src = dataUrl;
        });
        w = dim.w; h = dim.h;
      }
      out.push(Object.assign({}, item, { dataUrl: ext ? dataUrl : '', b64, ext, w, h }));
    } catch (_) {
      out.push(Object.assign({}, item, { dataUrl: '', b64: '', ext: '', w: 0, h: 0 }));
    }
  }
  return out;
}

/* ---------- relatório HTML / PDF ---------- */

function tableHtml(headers, rows) {
  if (!rows.length) return '<p class="na">' + NA + '</p>';
  return '<table><thead><tr>' + headers.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c === '' || c == null ? NA : c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
}
function ul(items) {
  return items && items.length ? '<ul>' + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="na">' + NA + '</p>';
}

function reportHtml(m, photos) {
  const h = H();
  const secs = [];
  const sum = [];
  const add = (id, title, body) => { sum.push([id, title]); secs.push('<section id="' + id + '"><h2>' + esc(title) + '</h2>' + body + '</section>'); };

  add('s1', '1. Identificação da produção',
    tableHtml(['Arquivo analisado', 'SHA-256', 'Tamanho', 'Arquivos finais', 'ZIPs internos', 'Importado em'],
      m.identificacao.imports.map(i => [i.name, i.sha256, (i.size / 1024 / 1024).toFixed(2) + ' MB', i.count, i.zips, h.fmt(i.when)])) +
    '<p><b>Data da análise:</b> ' + esc(h.fmt(m.geradoEm)) + '</p>' +
    '<p><b>Conta Google:</b> ' + esc(m.identificacao.contas.map(a => a.primary_email).filter(Boolean).join(', ') || NA) + '</p>' +
    '<p><b>Produtos encontrados:</b> ' + esc(m.identificacao.produtos.map(([p, n]) => p + ' (' + n + ')').join(', ') || NA) + '</p>' +
    '<p><b>Arquivos analisados:</b> ' + m.identificacao.arquivos + ' · <b>ZIPs internos:</b> ' + m.identificacao.zips + '</p>' +
    tableHtml(['Registro', 'Quantidade'], Object.entries(m.identificacao.registros).map(([k, v]) => [k, v])));

  add('s2', '2. Resumo investigativo automático',
    '<h3>Principais elementos identificados</h3>' +
    m.elementos.map(e => '<h4>' + esc(e.titulo) + '</h4>' + (e.nota ? '<p class="na">' + esc(e.nota) + '</p>' : '') + ul(e.itens)).join('') +
    '<p class="aviso">Os itens acima reproduzem vínculos registrados na produção. Não há atribuição de conduta a pessoa determinada.</p>');

  add('s3', '3. Análise de dispositivos',
    tableHtml(['IMEI', 'Modelo', 'Fabricante', 'Contas vinculadas', 'Primeiro registro', 'Último registro'],
      m.dispositivos.map(d => [d.imei1 || d.imei2, d.model, d.manufacturer, (d.accounts || []).join(', '), h.fmt(d.first), h.fmt(d.last)])) +
    '<h3>Dispositivos com múltiplos vínculos</h3>' +
    (m.multiConta.length
      ? m.multiConta.map(x => '<div class="destaque"><b>IMEI:</b> ' + esc(x.imei) + '<br>' +
        x.accounts.map((c, i) => '<b>Conta ' + (i + 1) + ':</b> ' + esc(c)).join('<br>') +
        '<br><b>Datas:</b> ' + esc(x.datas.join(' | ') || NA) +
        '<br><b>Modelos:</b> ' + esc((x.models || []).join(', ') || NA) + '</div>').join('')
      : '<p class="na">Nenhum IMEI vinculado a mais de uma conta nesta produção.</p>'));

  const ipTable = groups => tableHtml(['IP', 'Conexões', 'Datas', 'Contas associadas', 'Produtos', 'Primeiro registro', 'Último registro'],
    groups.map(g => [g.ip, g.count, g.days.map(([d, n]) => d + ' (' + n + ')').join(' · '), g.accounts.join(', '), g.products.join(', '), h.fmt(g.first), h.fmt(g.last)]));
  add('s4', '4. Análise de conexões IP',
    '<h3>IPv6 (prioridade)</h3>' + ipTable(m.ips.v6) +
    '<h3>IPv4</h3>' + ipTable(m.ips.v4) +
    '<h3>IPs com maior recorrência</h3>' +
    (m.ips.todos.filter(g => g.count > 1).length
      ? m.ips.todos.filter(g => g.count > 1).slice(0, 15).map(g => '<div class="destaque"><b>IP' + (g.version === 6 ? 'v6' : 'v4') + ':</b> ' + esc(g.ip) +
        '<br><b>Quantidade de eventos:</b> ' + g.count +
        '<br><b>Primeiro registro:</b> ' + esc(h.fmt(g.first) || NA) +
        '<br><b>Último registro:</b> ' + esc(h.fmt(g.last) || NA) +
        '<br><b>Datas:</b> ' + esc(g.days.map(([d, n]) => d + ' (' + n + ')').join(' · ') || NA) +
        '<br><b>Contas relacionadas:</b> ' + esc(g.accounts.join(', ') || NA) +
        '<br><b>Atividades relacionadas:</b> ' + esc(g.events.slice(0, 6).map(e => e.event).join(' · ') || NA) + '</div>').join('')
      : '<p class="na">Nenhum IP com repetição nesta produção.</p>'));

  add('s5', '5. Correlação IP × conta × dispositivo',
    m.ips.todos.slice(0, 12).map(g => {
      const dev = g.devices.map(l => {
        const d = deviceForLabel(l);
        return l + (d && d.imei1 ? ' (IMEI ' + d.imei1 + ')' : '');
      });
      return '<div class="cadeia"><b>IP' + (g.version === 6 ? 'v6' : 'v4') + ' ' + esc(g.ip) + '</b>' +
        '<div class="seta">↓</div><b>Conta Google:</b> ' + esc(g.accounts.join(', ') || NA) +
        '<div class="seta">↓</div><b>Dispositivo:</b> ' + esc(dev.join(', ') || NA) +
        '<div class="seta">↓</div><b>Eventos (' + g.count + '):</b> ' + esc(g.products.join(', ') || NA) +
        '<div class="detalhe">' + esc(g.events.slice(0, 8).map(e => (h.fmt(e.ts) || NA) + ' — ' + e.event).join(' | ')) + '</div></div>';
    }).join('') || '<p class="na">Nenhum endereço IP registrado na produção.</p>');

  const tlRows = m.timeline.map(r => [h.fmtDate(r.ts), h.fmtTime(r.ts), r.evento, r.produto, r.local, r.device, r.ip]);
  add('s6', '6. Linha do tempo investigativa',
    tableHtml(['Data', 'Hora', 'Evento', 'Produto Google', 'Local', 'Dispositivo', 'IP'], tlRows.slice(0, 600)) +
    (tlRows.length > 600 ? '<p class="na">Exibidos os 600 primeiros de ' + tlRows.length + ' eventos datados.</p>' : '') +
    '<h3>Eventos próximos ao fato</h3>' +
    (m.crime.date
      ? '<p>Data do fato informada: <b>' + esc(h.fmt(m.crime.date)) + '</b> · janela de ' + m.crime.hours + ' h antes e depois (' +
        esc(h.fmt(m.crime.from)) + ' a ' + esc(h.fmt(m.crime.to)) + ').</p>' +
        tableHtml(['Data', 'Hora', 'Evento', 'Produto Google', 'Local', 'Dispositivo', 'IP'],
          m.timeline.filter(r => r.near).map(r => [h.fmtDate(r.ts), h.fmtTime(r.ts), r.evento, r.produto, r.local, r.device, r.ip]))
      : '<p class="na">Data do fato não informada no Painel.</p>'));

  add('s7', '7. Google Fotos — imagens e vídeos de interesse',
    photos.length
      ? '<div class="galeria">' + photos.map(f => {
        const p = f.photo;
        const img = m.opcoes.photos && f.dataUrl ? '<img src="' + f.dataUrl + '" alt="' + esc(p.name) + '">' : '<div class="semimg">' + esc(p.kind) + '</div>';
        return '<figure>' + img + '<figcaption><b>' + esc(p.original || p.name) + '</b><br>' +
          'Data: ' + esc(h.fmtDate(p.ts) || NA) + '<br>Hora: ' + esc(h.fmtTime(p.ts) || NA) + '<br>' +
          'Localização: ' + esc(p.gps ? p.lat + ', ' + p.lon : NA) + '<br>' +
          'Latitude: ' + esc(p.lat ?? NA) + '<br>Longitude: ' + esc(p.lon ?? NA) + '<br>' +
          'Dispositivo: ' + esc(p.device || NA) + '<br>' +
          'Motivo da seleção: ' + esc(f.reasons.join('; ') || 'Listagem geral') + '<br>' +
          '<span class="hash">' + esc(p.path) + '</span></figcaption></figure>';
      }).join('') + '</div>'
      : '<p class="na">Nenhuma imagem ou vídeo classificado como de interesse.</p>');

  add('s8', '8. Google Drive — arquivos potencialmente relevantes',
    m.drive.length
      ? m.drive.map(f => '<div class="destaque"><b>Arquivo:</b> ' + esc(f.name) +
        '<br><b>Tipo:</b> ' + esc(f.type || f.mime || NA) +
        '<br><b>Data:</b> ' + esc(h.fmt(f.date) || NA) +
        '<br><b>Termos localizados:</b> ' + esc(f.hits.join(', ')) +
        '<br><b>Conteúdo encontrado:</b>' + (f.snippets.filter(s => s.text).length
          ? '<ul>' + f.snippets.filter(s => s.text).map(s => '<li>' + esc(s.kw) + ': “' + esc(s.text) + '”</li>').join('') + '</ul>'
          : ' <span class="na">' + NA + '</span>') +
        '<br><span class="hash">' + esc(f.path) + '</span></div>').join('')
      : '<p class="na">Nenhum arquivo do Drive com os termos pesquisados.</p>');

  add('s9', '9. Gmail — comunicações relevantes',
    '<h3>E-mails mais frequentes</h3>' +
    tableHtml(['E-mail', 'Quantidade de interações'], m.gmail.ranking.map(([e, n]) => [e, n])) +
    '<h3>Mensagens com termos pesquisados</h3>' +
    tableHtml(['Data', 'Remetente', 'Destinatário', 'Assunto', 'Termos'],
      m.gmail.withKw.slice(0, 80).map(x => [h.fmt(x.mail.date), x.mail.from, x.mail.to, x.mail.subject, x.hits.join(', ')])) +
    '<h3>Mensagens próximas ao fato</h3>' +
    (m.crime.date
      ? tableHtml(['Data', 'Remetente', 'Destinatário', 'Assunto', 'IP'],
        m.gmail.near.map(x => [h.fmt(x.date), x.from, x.to, x.subject, x.ip]))
      : '<p class="na">Data do fato não informada no Painel.</p>'));

  add('s10', '10. Google Pay — análise financeira',
    tableHtml(['Moeda', 'Registros', 'Soma dos valores'], m.pay.totals.map(([cur, t]) => [cur, t.n, money(t.sum, cur === 'sem moeda informada' ? '' : cur)])) +
    '<h3>Comerciantes/descrições recorrentes</h3>' +
    tableHtml(['Descrição', 'Ocorrências'], m.pay.merchants.map(([d, n]) => [d, n])) +
    '<h3>Linha temporal financeira</h3>' +
    tableHtml(['Data', 'Hora', 'Descrição', 'Valor', 'ID', 'Instrumento', 'Perfil de pagamento'],
      m.pay.timeline.map(p => [h.fmtDate(p.ts), h.fmtTime(p.ts), p.desc, money(p.amount, p.currency), p.id, p.instrument, p.profile])) +
    '<p class="aviso">Os valores reproduzem o que consta na produção. Nenhuma transação é classificada como ilícita.</p>');

  const behavTable = list => tableHtml(['Data', 'Hora', 'Tipo', 'Produto', 'Descrição', 'Endereço'],
    list.slice(0, 250).map(i => [h.fmtDate(i.ts), h.fmtTime(i.ts), i.kind, i.product, i.desc, i.extra]));
  add('s11', '11. Pesquisas e atividades — comportamento digital',
    '<h3>Aplicações e produtos utilizados</h3>' +
    tableHtml(['Produto', 'Registros'], m.behav.apps.map(([p, n]) => [p, n])) +
    (m.behav.hasCrime
      ? '<h3>Antes do fato</h3>' + behavTable(m.behav.antes) +
        '<h3>Durante a janela do fato</h3>' + behavTable(m.behav.durante) +
        '<h3>Após o fato</h3>' + behavTable(m.behav.depois)
      : '<h3>Registros (data do fato não informada)</h3>' + behavTable(m.behav.todos)));

  add('s12', '12. Grafo de correlações', grafoHtml(m.grafo));

  add('s13', '13. Considerações analíticas', ul(m.conclusao));

  const hashes = m.identificacao.imports.map(i => [i.name, i.sha256]);
  add('s14', '14. Integridade e exportação',
    tableHtml(['Arquivo', 'SHA-256'], hashes) +
    '<p>Relatório gerado no próprio aparelho a partir da produção importada. Os arquivos originais não são alterados.</p>');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de análise investigativa — Quebra Google</title>
<style>
:root{--ink:#111820;--green:#183a31;--gold:#c5a253;--line:#ccc6b8;--muted:#5d6764}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#141b21;margin:0;background:#f1efe9}
.page{max-width:900px;margin:0 auto;background:#fff;padding:28px 30px 60px}
.capa{min-height:88vh;display:flex;flex-direction:column;justify-content:center;border-bottom:4px solid var(--gold)}
.capa .selo{font-size:11px;font-weight:900;letter-spacing:2px;color:var(--green)}
.capa h1{font-family:Georgia,serif;font-size:34px;margin:10px 0 4px;color:var(--green)}
.capa h2{font-size:16px;margin:0 0 20px;color:var(--muted);font-weight:700}
.capa dl{display:grid;grid-template-columns:200px 1fr;gap:6px;font-size:13px}
.capa dt{font-weight:800;color:var(--muted)}
.capa dd{margin:0}
.toolbar{position:sticky;top:0;background:var(--green);padding:8px 10px;display:flex;gap:8px;flex-wrap:wrap;z-index:5}
.toolbar button{background:var(--gold);border:0;border-radius:8px;padding:9px 13px;font-weight:800;cursor:pointer}
h2{color:var(--green);border-bottom:2px solid var(--gold);padding-bottom:5px;margin-top:34px;font-size:20px}
h3{color:#24483d;font-size:15px;margin:18px 0 6px}
h4{margin:12px 0 4px;font-size:13px;color:#2f3a35}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11px}
th,td{border:1px solid var(--line);padding:5px 6px;text-align:left;vertical-align:top}
th{background:#eef2ef;color:var(--green)}
ul{margin:6px 0 6px 18px;font-size:13px}
.na{color:#857b68;font-style:italic;font-size:12px}
.aviso{background:#f5f8f5;border-left:3px solid var(--green);padding:8px 10px;font-size:12px}
.destaque{border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:6px;padding:9px 11px;margin:8px 0;font-size:12.5px}
.cadeia{border:1px solid var(--line);border-radius:6px;padding:9px 11px;margin:8px 0;font-size:12.5px}
.cadeia .seta{color:var(--gold);font-weight:900}
.cadeia .detalhe{margin-top:5px;color:var(--muted);font-size:11px}
.galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.galeria figure{margin:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.galeria img{width:100%;height:170px;object-fit:cover;display:block}
.galeria .semimg{height:170px;display:grid;place-items:center;background:#eee;color:var(--muted);font-weight:800}
.galeria figcaption{padding:7px;font-size:11px;line-height:1.45}
.hash{font-family:ui-monospace,Consolas,monospace;font-size:10px;word-break:break-all;color:var(--muted)}
.sumario ol{font-size:13px;line-height:1.7}
.grafo{display:grid;grid-template-columns:320px 1fr;gap:14px;align-items:start}
.grafo svg{width:100%;height:auto}
.grafo .no{cursor:pointer}
.grafo .detalhes{border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;min-height:160px}
.grafo .arvore{font-size:12.5px;line-height:1.6}
@media(max-width:720px){.grafo{grid-template-columns:1fr}.capa dl{grid-template-columns:1fr}}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .page{max-width:none;padding:0 6mm}
  section{page-break-inside:auto}
  h2{page-break-after:avoid}
  .capa{page-break-after:always;min-height:auto;padding-top:40mm}
  table{font-size:9.5px}
  .galeria img{height:120px}
}
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()" type="button">Imprimir / Salvar PDF</button>
  <button onclick="window.close()" type="button">Fechar</button>
</div>
<div class="page">
  <header class="capa">
    <div class="selo">POLÍCIA CIVIL DO PARANÁ · DELEGACIA DE MAMBORÊ</div>
    <h1>Relatório de análise investigativa</h1>
    <h2>Produção Google — quebra de sigilo de dados</h2>
    <dl>
      <dt>Arquivo(s) analisado(s)</dt><dd>${esc(m.identificacao.imports.map(i => i.name).join(' · ') || NA)}</dd>
      <dt>Hash SHA-256</dt><dd class="hash">${esc(m.identificacao.imports.map(i => i.sha256).join(' · ') || NA)}</dd>
      <dt>Data da análise</dt><dd>${esc(h.fmt(m.geradoEm))}</dd>
      <dt>Conta Google</dt><dd>${esc(m.identificacao.contas.map(a => a.primary_email).filter(Boolean).join(', ') || NA)}</dd>
      <dt>Data do fato</dt><dd>${esc(m.crime.date ? h.fmt(m.crime.date) + ' (janela de ' + m.crime.hours + ' h)' : 'não informada')}</dd>
      <dt>Arquivos analisados</dt><dd>${m.identificacao.arquivos}</dd>
    </dl>
    <p class="aviso">Relatório técnico produzido a partir dos arquivos entregues pela Google. Todos os elementos apresentados constam da própria produção; campos ausentes são registrados como “${NA}”.</p>
  </header>
  <nav class="sumario"><h2>Sumário</h2><ol>${sum.map(([id, t]) => '<li><a href="#' + id + '">' + esc(t.replace(/^\d+\.\s*/, '')) + '</a></li>').join('')}</ol></nav>
  ${secs.join('')}
</div>
<script>
document.querySelectorAll('.grafo .no').forEach(function(no){
  no.addEventListener('click', function(){
    var id = no.getAttribute('data-no');
    document.querySelectorAll('.grafo .bloco').forEach(function(b){ b.hidden = b.getAttribute('data-no') !== id; });
  });
});
<\/script>
</body></html>`;
}

function grafoHtml(g) {
  const cx = 160, cy = 150, r = 112;
  const nodes = g.nos.map((n, i) => {
    const ang = (-Math.PI / 2) + (2 * Math.PI * i / g.nos.length);
    return Object.assign({}, n, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  });
  const svg = `<svg viewBox="0 0 320 300" role="img" aria-label="Grafo de correlações">
    ${nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="#c5a253" stroke-width="1.6"/>`).join('')}
    <circle cx="${cx}" cy="${cy}" r="34" fill="#183a31"/>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="#f4e7bd" font-size="9" font-weight="700">CONTA</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle" fill="#f4e7bd" font-size="7">GOOGLE</text>
    ${nodes.map(n => `<g class="no" data-no="${n.id}">
      <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="26" fill="#fff" stroke="#183a31" stroke-width="1.6"/>
      <text x="${n.x.toFixed(1)}" y="${(n.y - 2).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#183a31">${esc(n.label)}</text>
      <text x="${n.x.toFixed(1)}" y="${(n.y + 8).toFixed(1)}" text-anchor="middle" font-size="8" fill="#8f3037">${n.n}</text>
    </g>`).join('')}
  </svg>`;
  const blocos = nodes.map((n, i) => `<div class="bloco" data-no="${n.id}"${i ? ' hidden' : ''}><b>${esc(n.label)} · ${n.n}</b>${ul(n.itens)}</div>`).join('');
  const arvore = `<div class="arvore"><b>${esc(g.centro)}</b><br>` +
    nodes.map((n, i) => (i === nodes.length - 1 ? '└── ' : '├── ') + esc(n.label) + ': ' + n.n).join('<br>') + '</div>';
  return '<div class="grafo"><div>' + svg + arvore + '</div><div class="detalhes">' +
    '<p class="na">Toque em um elemento do grafo para ver os detalhes.</p>' + blocos + '</div></div>';
}

/* ---------- DOCX ---------- */

const xe = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function dRun(text, o) {
  o = o || {};
  const props = '<w:rPr>' + (o.bold ? '<w:b/>' : '') + (o.italic ? '<w:i/>' : '') +
    (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
    (o.size ? '<w:sz w:val="' + o.size + '"/>' : '') + '</w:rPr>';
  return '<w:r>' + props + '<w:t xml:space="preserve">' + xe(text) + '</w:t></w:r>';
}
function dP(text, o) {
  o = o || {};
  const pPr = '<w:pPr>' + (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') +
    (o.align ? '<w:jc w:val="' + o.align + '"/>' : '') +
    (o.break ? '<w:pageBreakBefore/>' : '') +
    (o.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '') + '</w:pPr>';
  return '<w:p>' + pPr + (text ? dRun(text, o) : '') + '</w:p>';
}
function dHeading(text, level, o) {
  return dP(text, Object.assign({ style: 'Heading' + level }, o || {}));
}
function dTable(headers, rows) {
  if (!rows.length) return dP(NA, { italic: true });
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(b => '<w:' + b + ' w:val="single" w:sz="4" w:color="BFBFBF"/>').join('') + '</w:tblBorders>';
  const cell = (t, head) => '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' +
    (head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2EF"/>' : '') + '</w:tcPr>' +
    '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + dRun(t === '' || t == null ? NA : t, { bold: !!head, size: 16 }) + '</w:p></w:tc>';
  return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>' + border + '</w:tblPr>' +
    '<w:tr>' + headers.map(h2 => cell(h2, true)).join('') + '</w:tr>' +
    rows.map(r => '<w:tr>' + r.map(c => cell(c, false)).join('') + '</w:tr>').join('') +
    '</w:tbl>' + dP('');
}
function dImage(rid, idx, cx, cy, name) {
  return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="' + idx + '" name="' + xe(name) + '"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:nvPicPr><pic:cNvPr id="' + idx + '" name="' + xe(name) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

function docxBody(m, photos, media) {
  const h = H();
  const b = [];
  b.push(dP('POLÍCIA CIVIL DO PARANÁ — DELEGACIA DE MAMBORÊ', { bold: true, align: 'center', color: '183A31' }));
  b.push(dP('RELATÓRIO DE ANÁLISE INVESTIGATIVA', { style: 'Title', align: 'center' }));
  b.push(dP('Produção Google — quebra de sigilo de dados', { align: 'center', italic: true }));
  b.push(dTable(['Campo', 'Conteúdo'], [
    ['Arquivo(s) analisado(s)', m.identificacao.imports.map(i => i.name).join(' · ')],
    ['Hash SHA-256', m.identificacao.imports.map(i => i.sha256).join(' · ')],
    ['Data da análise', h.fmt(m.geradoEm)],
    ['Conta Google', m.identificacao.contas.map(a => a.primary_email).filter(Boolean).join(', ')],
    ['Data do fato', m.crime.date ? h.fmt(m.crime.date) + ' (janela de ' + m.crime.hours + ' h)' : 'não informada'],
    ['Arquivos analisados', m.identificacao.arquivos],
    ['ZIPs internos', m.identificacao.zips]
  ]));
  b.push(dP('Todos os elementos constam da própria produção Google. Campos ausentes são registrados como “' + NA + '”.', { italic: true }));

  b.push(dHeading('Sumário', 1, { break: true }));
  ['1. Identificação da produção', '2. Resumo investigativo automático', '3. Análise de dispositivos',
    '4. Análise de conexões IP', '5. Correlação IP × conta × dispositivo', '6. Linha do tempo investigativa',
    '7. Google Fotos', '8. Google Drive', '9. Gmail', '10. Google Pay', '11. Pesquisas e atividades',
    '12. Grafo de correlações', '13. Considerações analíticas', '14. Integridade']
    .forEach(t => b.push(dP(t, { bullet: true })));

  b.push(dHeading('1. Identificação da produção', 1, { break: true }));
  b.push(dTable(['Arquivo', 'SHA-256', 'Tamanho', 'Arquivos finais', 'ZIPs internos'],
    m.identificacao.imports.map(i => [i.name, i.sha256, (i.size / 1024 / 1024).toFixed(2) + ' MB', i.count, i.zips])));
  b.push(dTable(['Produto encontrado', 'Registros'], m.identificacao.produtos.map(([p, n]) => [p, n])));
  b.push(dTable(['Registro', 'Quantidade'], Object.entries(m.identificacao.registros).map(([k, v]) => [k, v])));

  b.push(dHeading('2. Resumo investigativo automático', 1));
  b.push(dHeading('Principais elementos identificados', 2));
  m.elementos.forEach(e => {
    b.push(dHeading(e.titulo, 3));
    if (e.nota) b.push(dP(e.nota, { italic: true }));
    if (!e.itens || !e.itens.length) b.push(dP(NA, { italic: true }));
    else e.itens.slice(0, 60).forEach(i => b.push(dP(i, { bullet: true })));
  });

  b.push(dHeading('3. Análise de dispositivos', 1, { break: true }));
  b.push(dTable(['IMEI', 'Modelo', 'Fabricante', 'Contas vinculadas', 'Primeiro registro', 'Último registro'],
    m.dispositivos.map(d => [d.imei1 || d.imei2, d.model, d.manufacturer, (d.accounts || []).join(', '), h.fmt(d.first), h.fmt(d.last)])));
  b.push(dHeading('Dispositivos com múltiplos vínculos', 2));
  if (!m.multiConta.length) b.push(dP('Nenhum IMEI vinculado a mais de uma conta nesta produção.', { italic: true }));
  m.multiConta.forEach(x => {
    b.push(dP('IMEI: ' + x.imei, { bold: true }));
    x.accounts.forEach((c, i) => b.push(dP('Conta ' + (i + 1) + ': ' + c, { bullet: true })));
    b.push(dP('Datas: ' + (x.datas.join(' | ') || NA), { bullet: true }));
  });

  b.push(dHeading('4. Análise de conexões IP', 1, { break: true }));
  const ipRows = gs => gs.map(g => [g.ip, g.count, g.days.map(([d, n]) => d + ' (' + n + ')').join(' · '), g.accounts.join(', '), g.products.join(', ')]);
  b.push(dHeading('IPv6 (prioridade)', 2));
  b.push(dTable(['IP', 'Conexões', 'Datas', 'Contas associadas', 'Produtos'], ipRows(m.ips.v6)));
  b.push(dHeading('IPv4', 2));
  b.push(dTable(['IP', 'Conexões', 'Datas', 'Contas associadas', 'Produtos'], ipRows(m.ips.v4)));
  b.push(dHeading('IPs com maior recorrência', 2));
  const rec = m.ips.todos.filter(g => g.count > 1).slice(0, 15);
  if (!rec.length) b.push(dP('Nenhum IP com repetição nesta produção.', { italic: true }));
  rec.forEach(g => {
    b.push(dP('IP' + (g.version === 6 ? 'v6' : 'v4') + ' ' + g.ip, { bold: true }));
    b.push(dTable(['Quantidade', 'Primeiro registro', 'Último registro', 'Contas', 'Atividades'],
      [[g.count, h.fmt(g.first), h.fmt(g.last), g.accounts.join(', '), g.events.slice(0, 5).map(e => e.event).join(' · ')]]));
  });

  b.push(dHeading('5. Correlação IP × conta × dispositivo', 1, { break: true }));
  if (!m.ips.todos.length) b.push(dP('Nenhum endereço IP registrado na produção.', { italic: true }));
  m.ips.todos.slice(0, 12).forEach(g => {
    const dev = g.devices.map(l => {
      const d = deviceForLabel(l);
      return l + (d && d.imei1 ? ' (IMEI ' + d.imei1 + ')' : '');
    });
    b.push(dP('IP' + (g.version === 6 ? 'v6' : 'v4') + ' ' + g.ip + ' — ' + g.count + ' conexão(ões)', { bold: true }));
    b.push(dP('↓ Conta Google: ' + (g.accounts.join(', ') || NA), { bullet: true }));
    b.push(dP('↓ Dispositivo: ' + (dev.join(', ') || NA), { bullet: true }));
    b.push(dP('↓ Eventos: ' + (g.products.join(', ') || NA), { bullet: true }));
  });

  b.push(dHeading('6. Linha do tempo investigativa', 1, { break: true }));
  b.push(dTable(['Data', 'Hora', 'Evento', 'Produto', 'Local', 'Dispositivo', 'IP'],
    m.timeline.slice(0, 250).map(r => [h.fmtDate(r.ts), h.fmtTime(r.ts), r.evento, r.produto, r.local, r.device, r.ip])));
  if (m.timeline.length > 250) b.push(dP('Exibidos os 250 primeiros de ' + m.timeline.length + ' eventos datados.', { italic: true }));
  b.push(dHeading('Eventos próximos ao fato', 2));
  if (m.crime.date) {
    b.push(dP('Data do fato: ' + h.fmt(m.crime.date) + ' · janela de ' + m.crime.hours + ' h antes e depois.'));
    b.push(dTable(['Data', 'Hora', 'Evento', 'Produto', 'Local', 'Dispositivo', 'IP'],
      m.timeline.filter(r => r.near).map(r => [h.fmtDate(r.ts), h.fmtTime(r.ts), r.evento, r.produto, r.local, r.device, r.ip])));
  } else {
    b.push(dP('Data do fato não informada no Painel.', { italic: true }));
  }

  b.push(dHeading('7. Google Fotos — imagens e vídeos de interesse', 1, { break: true }));
  if (!photos.length) b.push(dP('Nenhuma imagem ou vídeo classificado como de interesse.', { italic: true }));
  photos.forEach((f, i) => {
    const p = f.photo;
    const mediaItem = media.find(x => x.idx === i);
    if (mediaItem) b.push(dImage(mediaItem.rid, 100 + i, mediaItem.cx, mediaItem.cy, p.name));
    b.push(dTable(['Nome', 'Data', 'Hora', 'Localização', 'Latitude', 'Longitude', 'Dispositivo', 'Motivo da seleção'],
      [[p.original || p.name, h.fmtDate(p.ts), h.fmtTime(p.ts), p.gps ? p.lat + ', ' + p.lon : '', p.lat, p.lon, p.device, f.reasons.join('; ')]]));
  });

  b.push(dHeading('8. Google Drive — arquivos potencialmente relevantes', 1, { break: true }));
  if (!m.drive.length) b.push(dP('Nenhum arquivo do Drive com os termos pesquisados.', { italic: true }));
  m.drive.forEach(f => {
    b.push(dP(f.name, { bold: true }));
    b.push(dTable(['Tipo', 'Data', 'Termos localizados'], [[f.type || f.mime, h.fmt(f.date), f.hits.join(', ')]]));
    f.snippets.filter(s => s.text).forEach(s => b.push(dP(s.kw + ': “' + s.text + '”', { bullet: true })));
  });

  b.push(dHeading('9. Gmail — comunicações relevantes', 1, { break: true }));
  b.push(dHeading('E-mails mais frequentes', 2));
  b.push(dTable(['E-mail', 'Quantidade de interações'], m.gmail.ranking.map(([e, n]) => [e, n])));
  b.push(dHeading('Mensagens com termos pesquisados', 2));
  b.push(dTable(['Data', 'Remetente', 'Destinatário', 'Assunto', 'Termos'],
    m.gmail.withKw.slice(0, 60).map(x => [h.fmt(x.mail.date), x.mail.from, x.mail.to, x.mail.subject, x.hits.join(', ')])));
  b.push(dHeading('Mensagens próximas ao fato', 2));
  b.push(m.crime.date
    ? dTable(['Data', 'Remetente', 'Destinatário', 'Assunto', 'IP'], m.gmail.near.map(x => [h.fmt(x.date), x.from, x.to, x.subject, x.ip]))
    : dP('Data do fato não informada no Painel.', { italic: true }));

  b.push(dHeading('10. Google Pay — análise financeira', 1, { break: true }));
  b.push(dTable(['Moeda', 'Registros', 'Soma dos valores'],
    m.pay.totals.map(([cur, t]) => [cur, t.n, money(t.sum, cur === 'sem moeda informada' ? '' : cur)])));
  b.push(dHeading('Descrições recorrentes', 2));
  b.push(dTable(['Descrição', 'Ocorrências'], m.pay.merchants.map(([d, n]) => [d, n])));
  b.push(dHeading('Linha temporal financeira', 2));
  b.push(dTable(['Data', 'Hora', 'Descrição', 'Valor', 'ID', 'Instrumento', 'Perfil'],
    m.pay.timeline.map(p => [h.fmtDate(p.ts), h.fmtTime(p.ts), p.desc, money(p.amount, p.currency), p.id, p.instrument, p.profile])));
  b.push(dP('Os valores reproduzem o que consta na produção. Nenhuma transação é classificada como ilícita.', { italic: true }));

  b.push(dHeading('11. Pesquisas e atividades — comportamento digital', 1, { break: true }));
  b.push(dTable(['Produto', 'Registros'], m.behav.apps.map(([p, n]) => [p, n])));
  const bt = (title, list) => {
    b.push(dHeading(title, 2));
    b.push(dTable(['Data', 'Hora', 'Tipo', 'Produto', 'Descrição'],
      list.slice(0, 120).map(i => [h.fmtDate(i.ts), h.fmtTime(i.ts), i.kind, i.product, i.desc])));
  };
  if (m.behav.hasCrime) {
    bt('Antes do fato', m.behav.antes);
    bt('Durante a janela do fato', m.behav.durante);
    bt('Após o fato', m.behav.depois);
  } else {
    bt('Registros (data do fato não informada)', m.behav.todos);
  }

  b.push(dHeading('12. Grafo de correlações', 1, { break: true }));
  b.push(dP(m.grafo.centro, { bold: true }));
  m.grafo.nos.forEach(n => {
    b.push(dP(n.label + ' — ' + n.n, { bullet: true }));
    n.itens.slice(0, 10).forEach(i => b.push(dP('   · ' + i)));
  });

  b.push(dHeading('13. Considerações analíticas', 1, { break: true }));
  m.conclusao.forEach(c => b.push(dP(c, { bullet: true })));

  b.push(dHeading('14. Integridade', 1));
  b.push(dTable(['Arquivo', 'SHA-256'], m.identificacao.imports.map(i => [i.name, i.sha256])));
  b.push(dP('Relatório gerado no próprio aparelho a partir da produção importada. Os arquivos originais não são alterados.'));
  return b.join('');
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
<w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="183A31"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="280" w:after="140"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="183A31"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="24483D"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
<w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>
<w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="200"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

async function docxBlob(m, photos) {
  if (!window.JSZip) throw new Error('JSZip indisponível');
  const zip = new JSZip();
  const media = [];
  photos.forEach((f, i) => {
    if (!f.b64 || !f.ext) return;
    const maxW = PAGE_IN * EMU_IN * 0.62;
    const cx = Math.round(f.w ? Math.min(maxW, f.w * 9525) : maxW);
    const cy = Math.round(f.w && f.h ? cx * (f.h / f.w) : cx * 0.68);
    media.push({ idx: i, rid: 'rIdImg' + i, name: 'media/foto' + i + '.' + f.ext, b64: f.b64, cx, cy });
  });
  const body = docxBody(m, photos, media);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/numbering.xml', NUMBERING_XML);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${media.map(x => '<Relationship Id="' + x.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + x.name + '"/>').join('')}
</Relationships>`);
  media.forEach(x => zip.file('word/' + x.name, x.b64, { base64: true }));
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1021" w:bottom="1134" w:left="1021" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---------- ações ---------- */

function statusMsg(t) { if ($('reportStatus')) $('reportStatus').textContent = t; }

function reportName(ext) {
  const { DB } = api();
  const acc = (DB.accounts[0] || {}).primary_email || 'producao';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return 'Relatorio_Analise_Google_' + acc.replace(/[^a-z0-9]+/gi, '_') + '_' + stamp + '.' + ext;
}

async function open_() {
  const { DB } = api();
  if (!DB.imports.length) { statusMsg('Importe a produção antes de gerar o relatório.'); return; }
  statusMsg('Montando relatório analítico…');
  const m = buildModel();
  const photos = m.opcoes.photos ? await photoData(m.fotos) : m.fotos.map(f => Object.assign({}, f, { dataUrl: '', b64: '', ext: '' }));
  const html = reportHtml(m, photos);
  const w = window.open('', '_blank');
  if (!w) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url; a.download = reportName('html'); a.click();
    statusMsg('O navegador bloqueou a nova aba; o relatório foi baixado como HTML.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  statusMsg('Relatório aberto em nova aba. Use “Imprimir / Salvar PDF”.');
}

async function docx() {
  const { DB } = api();
  if (!DB.imports.length) { statusMsg('Importe a produção antes de gerar o relatório.'); return; }
  statusMsg('Gerando DOCX…');
  const m = buildModel();
  const photos = m.opcoes.photos ? await photoData(m.fotos) : [];
  const blob = await docxBlob(m, photos);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reportName('docx');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  statusMsg('DOCX gerado (' + (blob.size / 1024).toFixed(0) + ' KB) com o mesmo conteúdo do relatório.');
}

window.PCPRRelatorio = {
  preview, open: open_, docx,
  buildModel, reportHtml, docxBlob, photoData, ipGroups, relevantPhotos, driveRelevant,
  gmailAnalysis, payAnalysis, behaviour, timelineRows, conclusion
};
document.documentElement.dataset.relatorioReady = '1';
})();
