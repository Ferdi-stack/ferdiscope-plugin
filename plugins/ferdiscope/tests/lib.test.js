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
  assert.strictEqual(lib.config({ FERDISCOPE_URL: 'https://x/ferdiscope/' }).url, 'https://x/ferdiscope');
  assert.deepStrictEqual(lib.config({ FERDISCOPE_URL: 'http://localhost:3010', FERDISCOPE_TOKEN: 'abc' }),
    { url: 'http://localhost:3010', token: 'abc' });
  assert.deepStrictEqual(lib.config({}), { url: null, token: null });
  assert.deepStrictEqual(lib.config({ FERDISCOPE_URL: '  ', FERDISCOPE_TOKEN: '' }), { url: null, token: null });
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
  assert.ok(t.includes("get_memory_entry(progetto, 'area:<progetto>:<area>')"));
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
