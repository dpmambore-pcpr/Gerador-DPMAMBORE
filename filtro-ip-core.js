(function(root){
'use strict';

var IPV6 = "(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,7}:"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}"
  + "|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}"
  + "|[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}";
var IPV4 = "(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
var TS   = "(\\d{4}-\\d{2}-\\d{2})[ T]+(\\d{2}:\\d{2}:\\d{2})(?:\\s*(?:UTC|Z))?";
var RE_IPV6 = new RegExp(IPV6, "g");
var RE_IPV4 = new RegExp(IPV4, "g");
var RE_VARRE = new RegExp(
    "(Timestamp|Time(?![a-z])|IP Address|Address|Port(?![a-z]))"
  + "|(" + TS + ")"
  + "|(" + IPV6 + "|" + IPV4 + ")"
  + "|(\\b\\d{1,5}\\b)", "g");

function pad2(n){ return String(n).padStart(2, "0"); }
function digits(s){ return String(s == null ? "" : s).replace(/\D/g, ""); }
function ehV4(ip){ return String(ip || "").indexOf(":") === -1; }
function ehV6(ip){ return String(ip || "").indexOf(":") !== -1; }

function decodeEntities(s){
  return String(s == null ? "" : s)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#(\d+);/g, function(_, n){ return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, n){ return String.fromCharCode(parseInt(n, 16)); });
}

function textoDoHTML(str){
  var raw = String(str == null ? "" : str);
  var semCodigo = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  if(typeof DOMParser !== "undefined"){
    try{
      var doc = new DOMParser().parseFromString(semCodigo, "text/html");
      var body = doc.body;
      if(body){
        var txt = (body.innerText || body.textContent || "");
        if(txt && txt.trim()) return txt;
      }
    }catch(e){}
  }
  return decodeEntities(semCodigo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function valorRotulo(texto, rotulo){
  var re = new RegExp("(?:^|[\\n\\r\\t >;])" + rotulo + "\\s*:\\s*([^\\n\\r<]+)", "i");
  var m = String(texto || "").match(re);
  if(!m) return "";
  return String(m[1] || "").replace(/\s+/g, " ").trim();
}

function primeiroToken(s){
  var t = String(s || "").trim();
  if(!t) return "";
  return t.split(/\s{2,}|\s+[|/]\s+/)[0].split(/\s+/).filter(Boolean).join(" ");
}

function detectarOrigem(texto){
  var t = String(texto || "");
  var ticket = (valorRotulo(t, "Internal Ticket Number") || "").split(/\s+/)[0];
  var rec = t.match(/\b([A-Za-z][A-Za-z0-9 ._-]{1,40}?)\s+Business Record\b/i);
  var servicoRotulo = primeiroToken(valorRotulo(t, "Service")).split(/\s+/)[0];
  var ident = valorRotulo(t, "Account Identifier") || valorRotulo(t, "Account Identifier Number");
  ident = ident.split(/\s{2,}/)[0].trim();
  if(/^\S{4,80}$/.test(ident) === false){
    var identCurto = ident.split(/\s+/)[0];
    ident = identCurto && identCurto.length >= 4 ? identCurto : "";
  }

  if(/WhatsApp Business Record/i.test(t) || /^whatsapp$/i.test(servicoRotulo) || (rec && /whatsapp/i.test(rec[1]))){
    return { provedor: "WhatsApp", identificador: "", ticket: ticket, tipo: "whatsapp" };
  }
  if(rec){
    var provedorRec = rec[1].replace(/\s+/g, " ").trim();
    return {
      provedor: servicoRotulo || provedorRec,
      identificador: ident,
      ticket: ticket,
      tipo: "records"
    };
  }
  if(servicoRotulo){
    return { provedor: servicoRotulo, identificador: ident, ticket: ticket, tipo: "generico" };
  }
  return { provedor: "", identificador: ident, ticket: ticket, tipo: "desconhecido" };
}

function parse(texto, arquivo){
  var origem = detectarOrigem(texto);
  var servico = origem.provedor || "";
  var ident = origem.identificador || "";
  var out = [], reg = {}, esperando = null, m;

  function guarda(campo, valor){
    if(reg[campo] !== undefined) empurra();
    reg[campo] = valor;
  }
  function empurra(){
    if(reg.data && reg.ip){
      out.push({
        servico: servico,
        identificador: ident,
        origem: origem,
        ip: reg.ip,
        data: reg.data,
        hora: reg.hora,
        porta: reg.porta || "",
        arquivo: arquivo || ""
      });
    }
    reg = {};
  }

  RE_VARRE.lastIndex = 0;
  while((m = RE_VARRE.exec(texto)) !== null){
    if(m[1]){
      esperando = /Port/.test(m[1]) ? "porta" : (/Address/.test(m[1]) ? "ip" : "ts");
      continue;
    }
    if(m[2] && esperando === "ts"){ guarda("data", m[3]); reg.hora = m[4]; esperando = null; continue; }
    if(m[5] && esperando === "ip"){ guarda("ip", m[5]); esperando = null; continue; }
    if(m[6] && esperando === "porta"){
      if(/Page\s*$/i.test(texto.slice(Math.max(0, m.index - 10), m.index))) continue;
      guarda("porta", m[6]); esperando = null; continue;
    }
  }
  empurra();

  if(!out.length){
    var pIP = null, pTS = null;
    var SIMPLES = new RegExp("(" + TS + ")|(" + IPV6 + "|" + IPV4 + ")", "g");
    while((m = SIMPLES.exec(texto)) !== null){
      if(m[1]) pTS = {data: m[2], hora: m[3]};
      else pIP = m[4];
      if(pIP && pTS){
        out.push({
          servico: servico,
          identificador: ident,
          origem: origem,
          ip: pIP,
          data: pTS.data,
          hora: pTS.hora,
          porta: "",
          arquivo: arquivo || ""
        });
        pIP = null;
        pTS = null;
      }
    }
  }
  return out;
}

function parseArquivo(conteudo, nomeArquivo){
  var nome = nomeArquivo || "";
  var texto = /\.html?$/i.test(nome) || /<html[\s>]/i.test(String(conteudo || "").slice(0, 4000))
    ? textoDoHTML(conteudo)
    : String(conteudo || "");
  return parse(texto, nome || "arquivo");
}

function listarIpsNoTexto(texto, versao){
  var t = String(texto || "");
  var re = versao === "v4" ? new RegExp(IPV4, "g") : new RegExp(IPV6, "g");
  var out = [], m;
  while((m = re.exec(t)) !== null) out.push(m[0]);
  return out;
}

function ajustaFuso(l, offset){
  var h = offset;
  if(h === undefined || h === null || h === "") h = -3;
  h = parseInt(h, 10);
  if(!isFinite(h) || h === 0) return {data: l.data, hora: l.hora};
  var d = new Date(l.data + "T" + l.hora + "Z");
  d.setUTCHours(d.getUTCHours() + h);
  return {
    data: d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()),
    hora: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds())
  };
}

function chaveDedup(l, modo, idx){
  if(modo === "ip") return l.ip;
  if(modo === "ipdia") return l.ip + "|" + l.data;
  if(modo === "ipporta") return l.ip + "|" + (l.porta || "");
  return "#" + idx;
}

function processarLinhas(linhas, opts){
  opts = opts || {};
  var brutas = (linhas || []).slice();
  var totalBruto = brutas.length;
  var modoIP = opts.modoIP || "v6";
  var modo = opts.dedup || "ipdia";
  var fuso = opts.fuso === undefined || opts.fuso === null || opts.fuso === "" ? -3 : opts.fuso;

  var v4semPorta = brutas.filter(function(l){ return ehV4(l.ip) && !l.porta; }).length;
  var v4comPorta = brutas.filter(function(l){ return ehV4(l.ip) && l.porta; }).length;

  var filtradas = brutas.filter(function(l){
    if(modoIP === "tudo") return true;
    if(modoIP === "v6") return !ehV4(l.ip);
    if(modoIP === "v4") return ehV4(l.ip);
    return ehV4(l.ip) && !!l.porta;
  });

  var convertidas = filtradas.map(function(l){
    var f = ajustaFuso(l, fuso);
    return {
      servico: l.servico,
      identificador: l.identificador,
      origem: l.origem,
      ip: l.ip,
      porta: l.porta || "",
      data: f.data,
      hora: f.hora,
      utc: l.data + " " + l.hora,
      arquivo: l.arquivo
    };
  });

  convertidas.sort(function(a, b){ return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; });
  var vistos = {}, finais = [];
  convertidas.forEach(function(l, i){
    var k = chaveDedup(l, modo, i);
    if(vistos[k]) return;
    vistos[k] = 1;
    finais.push(l);
  });
  finais.sort(function(a, b){ return (a.data + a.hora) > (b.data + b.hora) ? -1 : 1; });

  return {
    brutas: brutas,
    filtradas: filtradas,
    convertidas: convertidas,
    finais: finais,
    totalBruto: totalBruto,
    info: { v4semPorta: v4semPorta, v4comPorta: v4comPorta, modoIP: modo, filtro: modoIP, fuso: fuso }
  };
}

function extractAsn(value){
  if(value && typeof value === "object"){
    if(value.asn != null && String(value.asn).trim() !== "") return extractAsn(value.asn);
    if(value.name) return extractAsn(value.name);
    return "";
  }
  var s = String(value == null ? "" : value).trim();
  var m = s.match(/\bAS\s*(\d{1,10})\b/i);
  if(m) return "AS" + m[1];
  if(/^\d{1,10}$/.test(s)) return "AS" + s;
  return "";
}

function formatAsn(value){
  var asn = extractAsn(value);
  return asn || "";
}

function stripAsnPrefix(s){
  return String(s == null ? "" : s).replace(/^\s*AS\s*\d+\s+/i, "").trim();
}

function normalizeOperatorName(name){
  var s = stripAsnPrefix(name);
  s = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.toUpperCase();
  s = s.replace(/&AMP;/g, " E ").replace(/&/g, " E ");
  s = s.replace(/\bS\s*[\.\/]?\s*A\.?\b/g, " SA ");
  s = s.replace(/\bLTDA\.?\b/g, " LTDA ");
  s = s.replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function melhorNome(a, b){
  var aa = String(a || "").trim(), bb = String(b || "").trim();
  if(!aa) return bb;
  if(!bb) return aa;
  var acc = function(s){ return (s.match(/[^\u0000-\u007f]/g) || []).length; };
  if(acc(bb) > acc(aa)) return bb;
  if(bb.length > aa.length) return bb;
  return aa;
}

function getCanonicalOperator(info){
  info = info || {};
  var asn = formatAsn(info.asn || info.org);
  var owner = stripAsnPrefix(info.owner || info.org || info.isp || "");
  var cnpj = digits(info.cnpj);
  if(cnpj.length !== 14) cnpj = "";
  var nameKey = normalizeOperatorName(owner);
  var displayName = owner || (asn ? asn : "Operadora não identificada");
  return {
    asn: asn,
    owner: owner,
    cnpj: cnpj,
    nameKey: nameKey,
    displayName: displayName
  };
}

function normalizeOperator(infoOrName){
  if(infoOrName && typeof infoOrName === "object") return getCanonicalOperator(infoOrName);
  return getCanonicalOperator({ owner: String(infoOrName || "") });
}

function findParent(parent, x){
  if(parent[x] == null) parent[x] = x;
  if(parent[x] !== x) parent[x] = findParent(parent, parent[x]);
  return parent[x];
}
function unionKey(parent, a, b){
  a = findParent(parent, a);
  b = findParent(parent, b);
  if(a !== b) parent[a] = b;
}

function groupRecordsByOperator(linhas, asnMap){
  var parent = {};
  var recs = (linhas || []).map(function(l, i){
    var id = "rec:" + i;
    var info = (asnMap && asnMap[l.ip]) || {};
    var canon = getCanonicalOperator(info);
    var keys = [id];
    if(canon.cnpj) keys.push("cnpj:" + canon.cnpj);
    if(canon.nameKey) keys.push("name:" + canon.nameKey);
    else if(canon.asn) keys.push("asn:" + canon.asn);
    else keys.push("unknown");
    for(var k = 1; k < keys.length; k++) unionKey(parent, keys[0], keys[k]);
    return { id: id, linha: l, canon: canon };
  });

  var groups = {};
  recs.forEach(function(r){
    var root = findParent(parent, r.id);
    if(!groups[root]){
      groups[root] = { key: root, nome: "", cnpj: "", nameKey: "", asns: [], linhas: [] };
    }
    var g = groups[root];
    g.linhas.push(r.linha);
    if(r.canon.asn && g.asns.indexOf(r.canon.asn) < 0) g.asns.push(r.canon.asn);
    if(r.canon.cnpj) g.cnpj = r.canon.cnpj;
    if(r.canon.nameKey) g.nameKey = r.canon.nameKey;
    g.nome = melhorNome(g.nome, r.canon.displayName);
  });

  var out = {};
  Object.keys(groups).forEach(function(k){
    var g = groups[k];
    g.asns.sort(function(a, b){
      return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10);
    });
    g.nome = g.nome || "Operadora não identificada";
    g.key = g.cnpj ? "cnpj:" + g.cnpj : (g.nameKey ? "name:" + g.nameKey : (g.asns[0] ? "asn:" + g.asns[0] : "unknown"));
    var key = g.key, n = 2;
    while(out[key]) key = g.key + ":" + (n++);
    g.key = key;
    out[key] = g;
  });
  return out;
}

function gruposOrdenados(groups){
  return Object.keys(groups || {}).map(function(k){ return groups[k]; }).sort(function(a, b){
    return String(a.nome).localeCompare(String(b.nome), "pt-BR");
  });
}

function gruposPorNome(groups){
  var out = {};
  Object.keys(groups || {}).forEach(function(k){
    out[groups[k].nome] = groups[k];
  });
  return out;
}

function chaveRegistro(l){
  return [l.ip, l.utc || (l.data + " " + l.hora), l.porta || ""].join("|");
}

function auditarPipeline(opts){
  opts = opts || {};
  var texto = opts.texto || "";
  var extraidos = opts.extraidos || [];
  var processados = opts.processados || [];
  var agrupados = opts.agrupados || {};
  var documentos = opts.documentos || [];
  var asnMap = opts.asnMap || {};
  var filtro = opts.filtro || "v6";

  var ipv6Arquivo = listarIpsNoTexto(texto, "v6");
  var ipv6Extraidos = extraidos.filter(function(l){ return ehV6(l.ip); });
  var ipv6Processados = processados.filter(function(l){ return ehV6(l.ip); });
  var ipv4Processados = processados.filter(function(l){ return ehV4(l.ip); });
  var agrupadasLinhas = [];
  Object.keys(agrupados).forEach(function(k){
    agrupadasLinhas = agrupadasLinhas.concat(agrupados[k].linhas || []);
  });
  var ipv6SemOperadora = ipv6Processados.filter(function(l){
    var info = asnMap[l.ip] || {};
    return !getCanonicalOperator(info).nameKey && !getCanonicalOperator(info).asn;
  });
  var asns = {};
  Object.keys(agrupados).forEach(function(k){
    (agrupados[k].asns || []).forEach(function(a){ asns[a] = 1; });
  });
  var mapProc = {};
  processados.forEach(function(l){ mapProc[chaveRegistro(l)] = l; });
  var mapDoc = {};
  documentos.forEach(function(l){ mapDoc[chaveRegistro(l)] = l; });
  var mapExt = {};
  extraidos.forEach(function(l){ mapExt[l.ip] = 1; });

  var perdidos = processados.filter(function(l){ return !mapDoc[chaveRegistro(l)]; });
  var adicionais = documentos.filter(function(l){ return !mapProc[chaveRegistro(l)]; });
  var ipv6PerdidosNaClassificacao = ipv6Extraidos.filter(function(l){
    return processados.filter(function(p){ return p.ip === l.ip; }).length === 0 && (filtro === "v6" || filtro === "tudo");
  });
  var docsForaDoArquivo = documentos.filter(function(l){ return !mapExt[l.ip]; });

  var log = [
    "IPv6 encontrados no arquivo: " + ipv6Arquivo.length,
    "IPv6 processados: " + ipv6Processados.length,
    "IPv6 sem operadora identificada: " + ipv6SemOperadora.length,
    "Operadoras identificadas: " + Object.keys(agrupados).length,
    "ASNs identificados: " + Object.keys(asns).length,
    "Registros incluídos nos documentos: " + documentos.length,
    "Registros perdidos: " + perdidos.length,
    "Registros adicionais: " + adicionais.length
  ].join("\n");

  return {
    ipv6Arquivo: ipv6Arquivo.length,
    ipv6Processados: ipv6Processados.length,
    ipv4Processados: ipv4Processados.length,
    ipv6SemOperadora: ipv6SemOperadora.length,
    operadoras: Object.keys(agrupados).length,
    asns: Object.keys(asns).length,
    registrosDocumentos: documentos.length,
    perdidos: perdidos.length,
    adicionais: adicionais.length,
    ipv6PerdidosNaClassificacao: ipv6PerdidosNaClassificacao.length,
    docsForaDoArquivo: docsForaDoArquivo.length,
    log: log,
    ok: perdidos.length === 0 && adicionais.length === 0 && docsForaDoArquivo.length === 0
      && ipv6PerdidosNaClassificacao.length === 0
      && (filtro !== "v6" || ipv4Processados.length === 0)
  };
}

function textoOrigemRegistros(origem, offset){
  origem = origem || {};
  var fuso = offset === undefined || offset === null || offset === "" ? -3 : Number(offset);
  var horario = fuso === 0
    ? "no horário original informado pela plataforma (UTC)"
    : "convertidos para o horário oficial de Brasília (UTC-3)";
  var provedor = origem.provedor || "de internet";
  if(origem.tipo === "whatsapp" || /^whatsapp$/i.test(provedor)){
    return "Os registros decorrem de resposta fornecida pelo provedor de aplicações WhatsApp, encontrando-se os horários " + horario + ":";
  }
  var conta = origem.identificador ? ", referente à conta " + origem.identificador : "";
  return "Os registros decorrem de resposta fornecida pelo provedor de aplicações " + provedor + conta + ", encontrando-se os horários " + horario + ":";
}

function normalizaRespostaConsulta(j, fonte){
  if(!j) return null;
  var asn = "", owner = "", org = "", cnpj = "", city = "", region = "";
  if(fonte === "ipwho" || j.connection){
    var c = j.connection || {};
    asn = formatAsn(c.asn != null && String(c.asn).trim() !== "" ? c.asn : (c.org || ""));
    owner = stripAsnPrefix(c.org || c.isp || "");
    org = (asn ? asn + " " : "") + owner;
    city = j.city || "";
    region = j.region || "";
    var cnpjWho = digits(j.cnpj || c.cnpj || "");
    if(cnpjWho.length === 14) cnpj = cnpjWho;
  } else {
    org = j.org || "";
    asn = formatAsn(org) || formatAsn(j.asn);
    owner = stripAsnPrefix(org) || (j.asn && (j.asn.name || j.asn)) || (j.company && j.company.name) || "";
    owner = stripAsnPrefix(owner);
    city = j.city || "";
    region = j.region || "";
    var cid = digits((j.company && (j.company.cnpj || j.company.tax_id)) || j.cnpj || "");
    if(cid.length === 14) cnpj = cid;
    if(!org) org = (asn ? asn + " " : "") + owner;
  }
  if(!owner && !asn && !org) return null;
  return { org: org, asn: asn, owner: owner, cnpj: cnpj, city: city, region: region };
}

function linhasDosGrupos(groups){
  var out = [];
  gruposOrdenados(groups).forEach(function(g){
    out = out.concat(g.linhas || []);
  });
  return out;
}

var api = {
  IPV6: IPV6,
  IPV4: IPV4,
  TS: TS,
  textoDoHTML: textoDoHTML,
  detectarOrigem: detectarOrigem,
  parse: parse,
  parseArquivo: parseArquivo,
  listarIpsNoTexto: listarIpsNoTexto,
  ehV4: ehV4,
  ehV6: ehV6,
  ajustaFuso: ajustaFuso,
  processarLinhas: processarLinhas,
  extractAsn: extractAsn,
  formatAsn: formatAsn,
  stripAsnPrefix: stripAsnPrefix,
  normalizeOperatorName: normalizeOperatorName,
  normalizeOperator: normalizeOperator,
  getCanonicalOperator: getCanonicalOperator,
  groupRecordsByOperator: groupRecordsByOperator,
  gruposOrdenados: gruposOrdenados,
  gruposPorNome: gruposPorNome,
  auditarPipeline: auditarPipeline,
  textoOrigemRegistros: textoOrigemRegistros,
  normalizaRespostaConsulta: normalizaRespostaConsulta,
  linhasDosGrupos: linhasDosGrupos,
  chaveRegistro: chaveRegistro
};

if(typeof module !== "undefined" && module.exports) module.exports = api;
root.FiltroIpCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
