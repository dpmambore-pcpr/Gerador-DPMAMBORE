#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var core = require('../filtro-ip-core.js');

var fixturePath = path.join(__dirname, 'fixtures', 'whatsapp-records.html');
var html = fs.readFileSync(fixturePath, 'utf8');
var texto = core.textoDoHTML(html);

var IP_DUP = '2804:18:1135:bb84:7cb2:caff:feaa:41fc';
var IP_VIVO_A = '2804:18:10:abcd:1:2:3:4';
var IP_VIVO_B = '2804:14d:1:2:3:4:5:6';
var IP_VIVO_C = '2804:14d:9:8:7:6:5:4';
var IP_CLARO = '2804:4e0:1:2:3:4:5:6';
var IP_V4_A = '177.22.45.10';
var IP_V4_B = '200.222.10.20';

var asnMap = {};
asnMap[IP_DUP] = core.normalizaRespostaConsulta({ org: 'AS18881 TELEFÔNICA BRASIL S.A.', city: 'São Paulo', region: 'SP' }, 'ipinfo');
asnMap[IP_VIVO_A] = core.normalizaRespostaConsulta({ org: 'AS18881 TELEFÔNICA BRASIL S.A.', city: 'São Paulo', region: 'SP' }, 'ipinfo');
asnMap[IP_VIVO_B] = core.normalizaRespostaConsulta({
  success: true,
  city: 'Curitiba',
  region: 'Paraná',
  connection: { asn: 26599, org: 'TELEFÔNICA BRASIL S.A.', isp: 'Vivo' }
}, 'ipwho');
asnMap[IP_VIVO_C] = core.normalizaRespostaConsulta({ org: 'AS26599 TELEFÔNICA BRASIL S.A.' }, 'ipinfo');
asnMap[IP_CLARO] = core.normalizaRespostaConsulta({ org: 'AS28573 CLARO S.A.' }, 'ipinfo');
asnMap[IP_V4_A] = core.normalizaRespostaConsulta({ org: 'AS18881 TELEFÔNICA BRASIL S.A.' }, 'ipinfo');
asnMap[IP_V4_B] = core.normalizaRespostaConsulta({ org: 'AS26599 TELEFÔNICA BRASIL S.A.' }, 'ipinfo');

var passed = 0, failed = 0;
function test(name, fn){
  try{
    fn();
    passed++;
    console.log('ok  - ' + name);
  }catch(e){
    failed++;
    console.error('FAIL - ' + name);
    console.error('      ' + (e && e.stack ? e.stack : e));
  }
}

test('UTC-3: 28/04/2026 03:03:41 UTC vira 28/04/2026 00:03:41', function(){
  var conv = core.ajustaFuso({ data: '2026-04-28', hora: '03:03:41' }, -3);
  assert.strictEqual(conv.data, '2026-04-28');
  assert.strictEqual(conv.hora, '00:03:41');
});

test('UTC-3 atravessa a data (00:10 UTC vira dia anterior 21:10)', function(){
  var conv = core.ajustaFuso({ data: '2026-04-28', hora: '00:10:00' }, -3);
  assert.strictEqual(conv.data, '2026-04-27');
  assert.strictEqual(conv.hora, '21:10:00');
});

test('fuso 0 preserva o horário original', function(){
  var conv = core.ajustaFuso({ data: '2026-04-28', hora: '03:03:41' }, 0);
  assert.strictEqual(conv.data, '2026-04-28');
  assert.strictEqual(conv.hora, '03:03:41');
});

test('leitura correta do records.html e origem WhatsApp', function(){
  var origem = core.detectarOrigem(texto);
  assert.strictEqual(origem.tipo, 'whatsapp');
  assert.strictEqual(origem.provedor, 'WhatsApp');
  assert.strictEqual(origem.ticket, '24824387');
  assert.strictEqual(origem.identificador, '');
  assert.ok(!/start/i.test(origem.provedor));
  assert.ok(!/sprint/i.test(origem.identificador));
});

test('parser não classifica Service/Start Time como provedor Start nem conta sPrint', function(){
  var recs = core.parseArquivo(html, 'records.html');
  assert.ok(recs.length >= 6, 'esperava registros, veio ' + recs.length);
  recs.forEach(function(l){
    assert.strictEqual(l.servico, 'WhatsApp');
    assert.notStrictEqual(String(l.servico).toLowerCase(), 'start');
    assert.ok(!/sprint/i.test(l.identificador || ''));
  });
});

test('reconhece IPv4 e IPv6 no arquivo', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var v6 = recs.filter(function(l){ return core.ehV6(l.ip); });
  var v4 = recs.filter(function(l){ return core.ehV4(l.ip); });
  assert.ok(v6.length >= 6, 'IPv6 parseados: ' + v6.length);
  assert.ok(v4.length >= 2, 'IPv4 parseados: ' + v4.length);
  assert.ok(v6.some(function(l){ return l.ip === IP_DUP; }));
  assert.ok(v4.some(function(l){ return l.ip === IP_V4_A; }));
});

test('filtro somente IPv6 não deixa entrar IPv4', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  assert.strictEqual(proc.finais.filter(function(l){ return core.ehV4(l.ip); }).length, 0);
  assert.ok(proc.finais.every(function(l){ return core.ehV6(l.ip); }));
});

test('filtro somente IPv4 não deixa entrar IPv6', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v4', dedup: 'ipdia', fuso: -3 });
  assert.strictEqual(proc.finais.filter(function(l){ return core.ehV6(l.ip); }).length, 0);
  assert.ok(proc.finais.length >= 2);
});

test('ocorrências do mesmo IPv6 em datas distintas são preservadas (não usa só Set(ip))', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  var dups = proc.finais.filter(function(l){ return l.ip === IP_DUP; });
  assert.strictEqual(dups.length, 2, 'esperava 2 ocorrências do IP repetido, veio ' + dups.length);
  var datas = dups.map(function(l){ return l.data; }).sort();
  assert.deepStrictEqual(datas, ['2026-04-27', '2026-04-28']);
  assert.ok(dups.some(function(l){ return l.data === '2026-04-28' && l.hora === '00:03:41'; }));
});

test('todos os IPv6 extraídos chegam à classificação e nenhum some na identificação de ASN', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var ipv6 = recs.filter(function(l){ return core.ehV6(l.ip); });
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  ipv6.forEach(function(l){
    assert.ok(proc.filtradas.some(function(p){ return p.ip === l.ip && p.data === l.data && p.hora === l.hora; }),
      'IPv6 não chegou à classificação: ' + l.ip + ' ' + l.data);
    assert.ok(asnMap[l.ip] && (asnMap[l.ip].asn || asnMap[l.ip].owner),
      'IPv6 sem ASN/operadora na etapa de identificação: ' + l.ip);
  });
  proc.finais.forEach(function(l){
    assert.ok(asnMap[l.ip], 'registro processado sem identificação: ' + l.ip);
  });
});

test('AS18881 e AS26599 identificam TELEFÔNICA e geram um único ofício', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  var groups = core.groupRecordsByOperator(proc.finais, asnMap);
  var operatorGroups = core.gruposPorNome(groups);
  var tel = operatorGroups['TELEFÔNICA BRASIL S.A.'];
  assert.ok(tel, 'grupo TELEFÔNICA BRASIL S.A. não encontrado. grupos=' + Object.keys(operatorGroups).join(', '));
  assert.ok(tel.asns.indexOf('AS18881') >= 0, 'AS18881 ausente: ' + tel.asns.join(','));
  assert.ok(tel.asns.indexOf('AS26599') >= 0, 'AS26599 ausente: ' + tel.asns.join(','));
  var numeroDeOficiosTelefonica = Object.keys(operatorGroups).filter(function(n){
    return core.normalizeOperatorName(n) === 'TELEFONICA BRASIL SA';
  }).length;
  assert.strictEqual(numeroDeOficiosTelefonica, 1);
  var ipsTel = tel.linhas.map(function(l){ return l.ip; });
  assert.ok(ipsTel.indexOf(IP_DUP) >= 0);
  assert.ok(ipsTel.indexOf(IP_VIVO_A) >= 0);
  assert.ok(ipsTel.indexOf(IP_VIVO_B) >= 0);
  assert.ok(ipsTel.indexOf(IP_VIVO_C) >= 0);
  assert.ok(core.gruposOrdenados(groups).length >= 2, 'CLARO deveria permanecer em ofício separado');
});

test('agrupamento genérico por CNPJ une ASNs distintos da mesma empresa', function(){
  var linhas = [
    { ip: '2001:db8::1', data: '2026-01-01', hora: '10:00:00', utc: '2026-01-01 13:00:00', porta: '' },
    { ip: '2001:db8::2', data: '2026-01-02', hora: '11:00:00', utc: '2026-01-02 14:00:00', porta: '' }
  ];
  var map = {
    '2001:db8::1': { asn: 'AS111', owner: 'EMPRESA ALFA TELECOM LTDA', cnpj: '02.558.157/0001-62' },
    '2001:db8::2': { asn: 'AS222', owner: 'Alfa Telecom', cnpj: '02558157000162' }
  };
  var groups = core.groupRecordsByOperator(linhas, map);
  assert.strictEqual(Object.keys(groups).length, 1);
  var g = groups[Object.keys(groups)[0]];
  assert.ok(g.asns.indexOf('AS111') >= 0);
  assert.ok(g.asns.indexOf('AS222') >= 0);
});

test('nome empresarial normalizado une TELEFONICA e TELEFÔNICA sem hardcode de ASN', function(){
  var a = core.normalizeOperatorName('AS18881 TELEFÔNICA BRASIL S.A.');
  var b = core.normalizeOperatorName('AS26599 Telefonica Brasil S.A.');
  var c = core.normalizeOperatorName('TELEFONICA BRASIL SA');
  assert.strictEqual(a, b);
  assert.strictEqual(b, c);
});

test('operadoras distintas continuam em ofícios separados', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  var groups = core.groupRecordsByOperator(proc.finais, asnMap);
  var nomes = Object.keys(core.gruposPorNome(groups));
  assert.ok(nomes.some(function(n){ return /claro/i.test(n); }));
  assert.ok(nomes.some(function(n){ return /telef/i.test(n); }));
});

test('texto do ofício identifica WhatsApp e não menciona Start/sPrint', function(){
  var origem = core.detectarOrigem(texto);
  var paragrafo = core.textoOrigemRegistros(origem, -3);
  assert.ok(/WhatsApp/.test(paragrafo));
  assert.ok(/UTC-3/.test(paragrafo));
  assert.ok(!/Start/.test(paragrafo));
  assert.ok(!/sPrint/.test(paragrafo));
  assert.ok(!/requisição dirigida ao provedor/.test(paragrafo));
});

test('auditoria de contagem: nenhum IPv6 elegível perdido ou inventado', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  var groups = core.groupRecordsByOperator(proc.finais, asnMap);
  var docs = core.linhasDosGrupos(groups);
  var audit = core.auditarPipeline({
    texto: texto,
    extraidos: recs,
    processados: proc.finais,
    agrupados: groups,
    documentos: docs,
    asnMap: asnMap,
    filtro: 'v6'
  });
  console.log('\n' + audit.log + '\n');
  assert.strictEqual(audit.ipv4Processados, 0, 'filtro IPv6 deixou IPv4 passar');
  assert.strictEqual(audit.perdidos, 0);
  assert.strictEqual(audit.adicionais, 0);
  assert.strictEqual(audit.docsForaDoArquivo, 0);
  assert.strictEqual(audit.ipv6PerdidosNaClassificacao, 0);
  assert.ok(audit.ok);
  assert.ok(audit.ipv6Processados >= 6);
  assert.ok(audit.asns >= 3);
});

test('comportamento antigo (chave = org com ASN) geraria 2 ofícios da Telefônica; o novo gera 1', function(){
  var recs = core.parseArquivo(html, 'records.html');
  var proc = core.processarLinhas(recs, { modoIP: 'v6', dedup: 'ipdia', fuso: -3 });
  var antigo = {};
  proc.finais.forEach(function(l){
    var a = asnMap[l.ip] || {};
    var nome = a.org || 'Operadora não identificada';
    (antigo[nome] = antigo[nome] || []).push(l);
  });
  var oficiosAntigosTelefonica = Object.keys(antigo).filter(function(n){
    return /telefonica/i.test(core.normalizeOperatorName(n));
  }).length;
  var groups = core.groupRecordsByOperator(proc.finais, asnMap);
  var oficiosNovosTelefonica = Object.keys(core.gruposPorNome(groups)).filter(function(n){
    return core.normalizeOperatorName(n) === 'TELEFONICA BRASIL SA';
  }).length;
  assert.ok(oficiosAntigosTelefonica >= 2, 'o caso real precisa reproduzir 2 chaves antigas, veio ' + oficiosAntigosTelefonica);
  assert.strictEqual(oficiosNovosTelefonica, 1);
  console.log('quantidade de ofícios Telefônica antes: ' + oficiosAntigosTelefonica);
  console.log('quantidade de ofícios Telefônica depois: ' + oficiosNovosTelefonica);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
