'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const lib = require('../hooks/lib.js');

function cartellaTmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-plugin-')));
}

function avviaServer(gestore) {
  return new Promise((ok) => {
    const stato = { richieste: [] };
    const server = http.createServer((req, res) => {
      let corpo = '';
      req.on('data', (c) => { corpo += c; });
      req.on('end', () => {
        stato.richieste.push({ metodo: req.method, url: req.url, headers: req.headers, corpo });
        gestore(req, res, corpo);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      stato.porta = server.address().port;
      stato.chiudi = () => new Promise((fine) => { server.closeAllConnections?.(); server.close(() => fine()); });
      ok(stato);
    });
  });
}

// --- trovaSegnaposto ---

test('trovaSegnaposto risale dalle sottocartelle e legge la prima riga non vuota', () => {
  const tmp = cartellaTmp();
  fs.writeFileSync(path.join(tmp, '.ferdiscope'), '\n  Edicola In  \naltro\n');
  const sotto = path.join(tmp, 'src', 'modulo');
  fs.mkdirSync(sotto, { recursive: true });
  assert.deepStrictEqual(lib.trovaSegnaposto(sotto), { nome: 'Edicola In', radice: tmp });
  assert.deepStrictEqual(lib.trovaSegnaposto(tmp), { nome: 'Edicola In', radice: tmp });
});

test('trovaSegnaposto senza file restituisce null', () => {
  const tmp = cartellaTmp();
  const sotto = path.join(tmp, 'a', 'b');
  fs.mkdirSync(sotto, { recursive: true });
  assert.strictEqual(lib.trovaSegnaposto(sotto), null);
});

test('trovaSegnaposto con input non valido restituisce null', () => {
  assert.strictEqual(lib.trovaSegnaposto(undefined), null);
  assert.strictEqual(lib.trovaSegnaposto(''), null);
});

// --- config ---

test('config toglie la / finale e legge il token', () => {
  const nessunFile = path.join(cartellaTmp(), 'assente.json');
  assert.strictEqual(lib.config({ FERDISCOPE_URL: 'https://x/ferdiscope/' }, nessunFile).url, 'https://x/ferdiscope');
  assert.deepStrictEqual(lib.config({ FERDISCOPE_URL: 'http://localhost:3010', FERDISCOPE_TOKEN: 'abc' }, nessunFile),
    { url: 'http://localhost:3010', token: 'abc' });
  assert.deepStrictEqual(lib.config({}, nessunFile), { url: null, token: null });
  assert.deepStrictEqual(lib.config({ FERDISCOPE_URL: '  ', FERDISCOPE_TOKEN: '' }, nessunFile), { url: null, token: null });
});

test('config: senza variabili legge il file di riserva', () => {
  const file = path.join(cartellaTmp(), '.ferdiscope.json');
  fs.writeFileSync(file, JSON.stringify({ url: 'https://y/ferdiscope/', token: ' tok ' }));
  assert.deepStrictEqual(lib.config({}, file), { url: 'https://y/ferdiscope', token: 'tok' });
});

test('config: le variabili vincono sul file, campo per campo', () => {
  const file = path.join(cartellaTmp(), '.ferdiscope.json');
  fs.writeFileSync(file, JSON.stringify({ url: 'https://file', token: 'dal-file' }));
  assert.deepStrictEqual(lib.config({ FERDISCOPE_URL: 'https://env' }, file), { url: 'https://env', token: 'dal-file' });
});

test('config: file rotto o con campi sbagliati non lancia', () => {
  const dir = cartellaTmp();
  const rotto = path.join(dir, 'rotto.json');
  fs.writeFileSync(rotto, '{ non è json');
  assert.deepStrictEqual(lib.config({}, rotto), { url: null, token: null });
  const strano = path.join(dir, 'strano.json');
  fs.writeFileSync(strano, JSON.stringify({ url: 42, token: ['x'] }));
  assert.deepStrictEqual(lib.config({}, strano), { url: null, token: null });
  const conBom = path.join(dir, 'bom.json');
  fs.writeFileSync(conBom, '﻿' + JSON.stringify({ url: 'https://z', token: 't' }));
  assert.deepStrictEqual(lib.config({}, conBom), { url: 'https://z', token: 't' });
});

test('config: il percorso del file viene da FERDISCOPE_CONFIG, altrimenti dalla home', () => {
  const file = path.join(cartellaTmp(), 'altro.json');
  fs.writeFileSync(file, JSON.stringify({ url: 'https://da-config', token: 't' }));
  assert.deepStrictEqual(lib.config({ FERDISCOPE_CONFIG: file }), { url: 'https://da-config', token: 't' });
  assert.strictEqual(lib.percorsoConfig({}), path.join(os.homedir(), '.ferdiscope.json'));
});

// --- chiediContesto ---

test('chiediContesto verso un server che non risponde mai: null entro 3,5 s', async () => {
  const srv = await avviaServer(() => { /* non risponde */ });
  try {
    const t0 = Date.now();
    const ctx = await lib.chiediContesto({ url: `http://127.0.0.1:${srv.porta}`, token: 't' }, { cwd: '/x' }, 3000);
    const durata = Date.now() - t0;
    assert.strictEqual(ctx, null);
    assert.ok(durata < 3500, `durata ${durata} ms`);
  } finally {
    await srv.chiudi();
  }
});

test('chiediContesto senza token verso URL pubblico: null senza alcuna richiesta', async () => {
  const fetchVero = globalThis.fetch;
  let chiamate = 0;
  globalThis.fetch = async () => { chiamate++; throw new Error('non doveva chiamare'); };
  try {
    const ctx = await lib.chiediContesto({ url: 'https://www.edicolain.it/ferdiscope', token: null }, { cwd: '/x' });
    assert.strictEqual(ctx, null);
    assert.strictEqual(chiamate, 0);
  } finally {
    globalThis.fetch = fetchVero;
  }
});

test('chiediContesto senza URL: null senza richiesta', async () => {
  const fetchVero = globalThis.fetch;
  let chiamate = 0;
  globalThis.fetch = async () => { chiamate++; throw new Error('no'); };
  try {
    assert.strictEqual(await lib.chiediContesto({ url: null, token: 't' }, { cwd: '/x' }), null);
    assert.strictEqual(chiamate, 0);
  } finally {
    globalThis.fetch = fetchVero;
  }
});

test('chiediContesto senza token verso localhost: la richiesta parte (chiamate locali esenti)', async () => {
  const srv = await avviaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ progetto: 'Edicola In', registrato: true, globale: 'G', indice: 'I' }));
  });
  try {
    for (const host of ['127.0.0.1', 'localhost']) {
      const ctx = await lib.chiediContesto({ url: `http://${host}:${srv.porta}`, token: null }, { cwd: '/x' });
      assert.deepStrictEqual(ctx, { progetto: 'Edicola In', registrato: true, globale: 'G', indice: 'I' });
    }
    assert.strictEqual(srv.richieste.length, 2);
    for (const r of srv.richieste) assert.strictEqual(r.headers.authorization, undefined);
  } finally {
    await srv.chiudi();
  }
});

test('chiediContesto manda token, codifica la query e legge il JSON', async () => {
  const srv = await avviaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ progetto: null, registrato: false, globale: 'G', indice: null }));
  });
  try {
    const ctx = await lib.chiediContesto(
      { url: `http://127.0.0.1:${srv.porta}`, token: 'segreto' },
      { cwd: 'C:\\Users\\Ferdi\\Desktop\\Edicola In', project: 'Edicola In', root: 'C:\\a&b' });
    assert.strictEqual(ctx.globale, 'G');
    const r = srv.richieste[0];
    assert.strictEqual(r.metodo, 'GET');
    assert.strictEqual(r.headers.authorization, 'Bearer segreto');
    assert.strictEqual(r.url,
      '/api/context?cwd=' + encodeURIComponent('C:\\Users\\Ferdi\\Desktop\\Edicola In') +
      '&project=' + encodeURIComponent('Edicola In') +
      '&root=' + encodeURIComponent('C:\\a&b'));
  } finally {
    await srv.chiudi();
  }
});

test('chiediContesto omette project e root quando mancano', async () => {
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    await lib.chiediContesto({ url: `http://127.0.0.1:${srv.porta}`, token: 't' }, { cwd: '/root' });
    assert.strictEqual(srv.richieste[0].url, '/api/context?cwd=%2Froot');
  } finally {
    await srv.chiudi();
  }
});

test('chiediContesto con 401, 500 o corpo non JSON: null', async () => {
  let risposta;
  const srv = await avviaServer((req, res) => risposta(res));
  try {
    const cfg = { url: `http://127.0.0.1:${srv.porta}`, token: 't' };
    risposta = (res) => { res.writeHead(401); res.end('{"error":"no"}'); };
    assert.strictEqual(await lib.chiediContesto(cfg, { cwd: '/x' }), null);
    risposta = (res) => { res.writeHead(500); res.end('{}'); };
    assert.strictEqual(await lib.chiediContesto(cfg, { cwd: '/x' }), null);
    risposta = (res) => { res.writeHead(200); res.end('<html>'); };
    assert.strictEqual(await lib.chiediContesto(cfg, { cwd: '/x' }), null);
  } finally {
    await srv.chiudi();
  }
});

test('chiediContesto verso porta chiusa: null', async () => {
  const srv = await avviaServer(() => {});
  const porta = srv.porta;
  await srv.chiudi();
  assert.strictEqual(await lib.chiediContesto({ url: `http://127.0.0.1:${porta}`, token: 't' }, { cwd: '/x' }), null);
});

// --- testoContesto ---

const NON_DISPONIBILE = 'Memoria FerdiScope non disponibile in questa sessione (server o token mancanti): lavora normalmente.';

test('testoContesto con ctx null: solo la riga "non disponibile"', () => {
  assert.strictEqual(lib.testoContesto(null, null), NON_DISPONIBILE);
  assert.strictEqual(lib.testoContesto(null, 'Edicola In'), NON_DISPONIBILE);
});

test('testoContesto con progetto e indice: regole, indice globale, indice del progetto', () => {
  const t = lib.testoContesto({ progetto: 'Edicola In', registrato: true, globale: 'GLOB', indice: 'IND' }, 'Edicola In');
  assert.ok(t.startsWith(lib.REGOLE), 'comincia con le regole');
  assert.ok(t.includes('get_memory_entries(progetto,'));
  assert.ok(t.includes('edit_memory'));
  assert.ok(t.includes('Dettagli: skill ferdiscope-memoria.'));
  const iG = t.indexOf('## indice:globale\nGLOB');
  const iP = t.indexOf('## indice:Edicola In\nIND');
  assert.ok(iG > 0 && iP > iG, 'ordine: regole, globale, progetto');
  assert.ok(!t.includes('non registrato'));
  assert.ok(!t.includes('non disponibile'));
});

test('testoContesto con progetto non registrato', () => {
  const t = lib.testoContesto({ progetto: 'Inesistente', registrato: false, globale: 'GLOB', indice: null }, 'Inesistente');
  assert.ok(t.startsWith(lib.REGOLE));
  assert.ok(t.includes('## indice:globale\nGLOB'));
  assert.ok(t.includes('Progetto "Inesistente" non registrato in FerdiScope: dillo in una riga.'));
  assert.ok(!t.includes('## indice:Inesistente'));
  assert.ok(!t.includes('non ha ancora indice'));
});

test('testoContesto con progetto registrato senza indice', () => {
  const t = lib.testoContesto({ progetto: 'Nuovo', registrato: true, globale: 'GLOB', indice: null }, null);
  assert.ok(t.startsWith(lib.REGOLE));
  assert.ok(t.includes('## indice:globale\nGLOB'));
  assert.ok(t.includes('Il progetto "Nuovo" non ha ancora indice e aree: dillo in una riga e proponi di prepararli (skill ferdiscope-memoria), poi lavora normalmente.'));
  assert.ok(!t.includes('non registrato'));
});

test('testoContesto con cartella che non è un progetto: solo regole e indice globale', () => {
  const t = lib.testoContesto({ progetto: null, registrato: false, globale: 'GLOB', indice: null }, null);
  assert.strictEqual(t, lib.REGOLE + '\n\n## indice:globale\nGLOB');
});

// --- inoltraEvento ---

test('inoltraEvento verso URL non locale senza token: false senza richiesta', async () => {
  const t0 = Date.now();
  assert.strictEqual(await lib.inoltraEvento({ url: 'https://192.0.2.1', token: null }, { a: 1 }), false);
  assert.ok(Date.now() - t0 < 200);
});

test('inoltraEvento verso URL non locale in http, anche con token: false senza richiesta', async () => {
  const t0 = Date.now();
  assert.strictEqual(await lib.inoltraEvento({ url: 'http://192.0.2.1', token: 'segreto' }, { a: 1 }), false);
  assert.strictEqual(await lib.chiediContesto({ url: 'http://192.0.2.1', token: 'segreto' }, {}), null);
  assert.ok(Date.now() - t0 < 200);
});

test('destinazioneAmmessa: locale sempre, altrove solo https con token', () => {
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'http://localhost:3010', token: null }), true);
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'http://127.0.0.1:3010', token: 'x' }), true);
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'https://www.edicolain.it/ferdiscope', token: 'x' }), true);
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'https://www.edicolain.it/ferdiscope', token: null }), false);
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'http://www.edicolain.it/ferdiscope', token: 'x' }), false);
  assert.strictEqual(lib.destinazioneAmmessa({ url: 'non un url', token: 'x' }), false);
  assert.strictEqual(lib.destinazioneAmmessa(null), false);
});

test('inoltraEvento verso localhost: manda l\'evento con segreti mascherati e campi lunghi tagliati', async () => {
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    const sk = 'sk-' + 'ant-api03-' + 'zzzzzzzzzzzzzzzzzzzz';
    const evento = { tool_name: 'Bash', tool_input: { command: `export ANTHROPIC_API_KEY=${sk}` }, tool_response: { stdout: 'r'.repeat(300) } };
    const ok = await lib.inoltraEvento({ url: `http://127.0.0.1:${srv.porta}`, token: null }, evento, 3000, 100);
    assert.strictEqual(ok, true);
    const inviato = JSON.parse(srv.richieste[0].corpo);
    assert.ok(!srv.richieste[0].corpo.includes(sk));
    assert.strictEqual(inviato.tool_input.command, 'export ANTHROPIC_API_KEY=[MASCHERATO:sk-ant]');
    assert.match(inviato.tool_response.stdout, /^r{100}\n…\[troncato da FerdiScope: 300 caratteri\]$/);
    assert.strictEqual(evento.tool_response.stdout.length, 300);
  } finally {
    await srv.chiudi();
  }
});

test('maxCampo: default 20000, FERDISCOPE_MAX_CAMPO lo cambia, valori non validi ignorati', () => {
  assert.strictEqual(lib.maxCampo({}), 20000);
  assert.strictEqual(lib.maxCampo({ FERDISCOPE_MAX_CAMPO: '500' }), 500);
  assert.strictEqual(lib.maxCampo({ FERDISCOPE_MAX_CAMPO: '0' }), 0);
  assert.strictEqual(lib.maxCampo({ FERDISCOPE_MAX_CAMPO: 'abc' }), 20000);
  assert.strictEqual(lib.maxCampo({ FERDISCOPE_MAX_CAMPO: '-3' }), 20000);
});

// --- testoSessioni (0.1.5) ---

const ORA = Date.parse('2026-11-21T12:00:00Z');
const CTX = {
  progetto: 'P', registrato: true, indice: 'I',
  sessioni: [
    { id: 'a1', fine: '2026-11-21 10:00:00', descrizione: 'Retry aggiunto.', fermata: 'Finita.', filone_titolo: 'bot', byte: 500 * 1024 },
    { id: 'b2', fine: '2026-11-10 10:00:00', descrizione: 'Vecchia.', fermata: '', filone_titolo: null, byte: null },
    { id: 'c3', fine: '2026-11-20 10:00:00', descrizione: 'x'.repeat(400), fermata: 'ok', filone_titolo: 'sito', byte: 5 * 1024 * 1024 },
  ],
  filoni: [{ chiave: 'filone:P:bot', titolo: 'bot', sessioni: 4, ultima: '2026-11-21 10:00:00' }],
};

test('testoSessioni: età, filone, dimensione, id e consiglio per sessioni grandi o vecchie', () => {
  const t = lib.testoSessioni(CTX, ORA);
  const righe = t.split('\n');
  assert.ok(righe.includes('- 2 ore fa · filone «bot» · 500 KB · id a1'));
  assert.ok(t.includes('- 11 giorni fa · senza filone · id b2 · grande o vecchia → meglio nuova dal riassunto'));
  assert.ok(t.includes('1 giorno fa · filone «sito» · 5,0 MB · id c3 · grande o vecchia'));
  assert.ok(t.includes('x'.repeat(169) + '…'));
  assert.ok(t.includes('- bot — `filone:P:bot` (4 sessioni, ultima 2 ore fa)'));
  assert.ok(t.includes("get_memory_entries('P'"));
});

test('testoSessioni: niente sessioni né filoni, o niente progetto: stringa vuota', () => {
  assert.strictEqual(lib.testoSessioni({ progetto: 'P', sessioni: [], filoni: [] }, ORA), '');
  assert.strictEqual(lib.testoSessioni({ sessioni: CTX.sessioni }, ORA), '');
  assert.strictEqual(lib.testoSessioni(null, ORA), '');
});

test('testoContesto aggiunge le sessioni solo con opzioni.sessioni', () => {
  assert.ok(!lib.testoContesto(CTX, 'P').includes('Ultime sessioni'));
  assert.ok(lib.testoContesto(CTX, 'P', { sessioni: true, ora: ORA }).includes('## Ultime sessioni di «P»'));
  // server vecchio senza i campi: nessun errore, nessun blocco
  assert.ok(!lib.testoContesto({ progetto: 'P', registrato: true, indice: 'I' }, 'P', { sessioni: true }).includes('Ultime'));
});
