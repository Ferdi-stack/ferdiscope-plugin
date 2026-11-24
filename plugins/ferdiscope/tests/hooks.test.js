'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const HOOKS = path.join(__dirname, '..', 'hooks');
const SESSION_START = path.join(HOOKS, 'session-start.js');
const FORWARD = path.join(HOOKS, 'forward.js');

function cartellaTmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-plugin-')));
}

// Ambiente pulito: senza le variabili FerdiScope della macchina (il token vero non entra nei test).
function ambiente(extra) {
  const env = { ...process.env };
  delete env.FERDISCOPE_URL;
  delete env.FERDISCOPE_TOKEN;
  // Nemmeno il file di riserva vero: si punta a un percorso che non esiste.
  env.FERDISCOPE_CONFIG = path.join(os.tmpdir(), 'ferdiscope-test-assente', 'nessuno.json');
  return { ...env, ...extra };
}

function esegui(script, input, env) {
  return new Promise((ok) => {
    const t0 = Date.now();
    const figlio = spawn(process.execPath, [script], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    figlio.stdout.on('data', (c) => { out += c; });
    figlio.stderr.on('data', (c) => { err += c; });
    figlio.on('close', (codice) => ok({ codice, out, err, durata: Date.now() - t0 }));
    figlio.stdin.end(input);
  });
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

async function portaChiusa() {
  const srv = await avviaServer(() => {});
  const porta = srv.porta;
  await srv.chiudi();
  return porta;
}

function contesto(out) {
  const json = JSON.parse(out);
  assert.strictEqual(json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.strictEqual(typeof json.hookSpecificOutput.additionalContext, 'string');
  return json.hookSpecificOutput.additionalContext;
}

// --- session-start.js ---

test('session-start con server giù: esce 0, JSON valido con "non disponibile", sotto i 4 s', async () => {
  const porta = await portaChiusa();
  const r = await esegui(SESSION_START, JSON.stringify({ cwd: os.tmpdir(), hook_event_name: 'SessionStart', source: 'startup' }),
    ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${porta}` }));
  assert.strictEqual(r.codice, 0);
  assert.ok(contesto(r.out).includes('non disponibile'));
  assert.ok(r.durata < 4000, `durata ${r.durata} ms`);
  assert.strictEqual(r.err, '');
});

test('session-start con server che non risponde: "non disponibile" sotto i 4,5 s', async () => {
  const srv = await avviaServer(() => { /* mai */ });
  try {
    const r = await esegui(SESSION_START, JSON.stringify({ cwd: os.tmpdir() }),
      ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` }));
    assert.strictEqual(r.codice, 0);
    assert.ok(contesto(r.out).includes('non disponibile'));
    assert.ok(r.durata < 4500, `durata ${r.durata} ms`);
  } finally {
    await srv.chiudi();
  }
});

test('session-start senza FERDISCOPE_URL: "non disponibile"', async () => {
  const r = await esegui(SESSION_START, JSON.stringify({ cwd: os.tmpdir() }), ambiente({}));
  assert.strictEqual(r.codice, 0);
  assert.ok(contesto(r.out).includes('non disponibile'));
});

test('session-start senza token verso URL pubblico: "non disponibile" senza errori', async () => {
  const r = await esegui(SESSION_START, JSON.stringify({ cwd: os.tmpdir() }),
    ambiente({ FERDISCOPE_URL: 'https://ferdiscope.invalid/ferdiscope' }));
  assert.strictEqual(r.codice, 0);
  assert.ok(contesto(r.out).includes('non disponibile'));
  assert.strictEqual(r.err, '');
});

test('session-start con stdin non JSON: esce 0 con JSON valido', async () => {
  const r = await esegui(SESSION_START, 'non è json', ambiente({}));
  assert.strictEqual(r.codice, 0);
  assert.ok(contesto(r.out).includes('non disponibile'));
});

test('session-start con server attivo e segnaposto: manda cwd, project, root e mostra gli indici', async () => {
  const tmp = cartellaTmp();
  fs.writeFileSync(path.join(tmp, '.ferdiscope'), 'Edicola In\n');
  const sotto = path.join(tmp, 'src');
  fs.mkdirSync(sotto);
  const srv = await avviaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ progetto: 'Edicola In', registrato: true, globale: 'indice globale finto', indice: 'indice progetto finto' }));
  });
  try {
    const r = await esegui(SESSION_START, JSON.stringify({ cwd: sotto }),
      ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}/` }));
    assert.strictEqual(r.codice, 0);
    const testo = contesto(r.out);
    assert.ok(testo.includes('## indice:globale\nindice globale finto'));
    assert.ok(testo.includes('## indice:Edicola In\nindice progetto finto'));
    const q = new URL(srv.richieste[0].url, 'http://x');
    assert.strictEqual(q.pathname, '/api/context');
    assert.strictEqual(q.searchParams.get('cwd'), sotto);
    assert.strictEqual(q.searchParams.get('project'), 'Edicola In');
    assert.strictEqual(q.searchParams.get('root'), tmp);
  } finally {
    await srv.chiudi();
  }
});

test('session-start: ultime sessioni e filoni all\'avvio, non su resume', async () => {
  const tmp = cartellaTmp();
  fs.writeFileSync(path.join(tmp, '.ferdiscope'), 'P\n');
  const srv = await avviaServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ progetto: 'P', registrato: true, globale: 'G', indice: 'I',
      sessioni: [{ id: 'abc-1', fine: '2026-11-20 10:00:00', descrizione: 'Fatto il retry.', fermata: 'Finita.',
        filone: 'filone:P:bot', filone_titolo: 'bot Telegram', byte: 1000 }],
      filoni: [{ chiave: 'filone:P:bot', titolo: 'bot Telegram', sessioni: 3, ultima: '2026-11-20 10:00:00' }] }));
  });
  try {
    const env = ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` });
    const avvio = contesto((await esegui(SESSION_START, JSON.stringify({ cwd: tmp, source: 'startup' }), env)).out);
    assert.ok(avvio.includes('## Ultime sessioni di «P»'));
    assert.ok(avvio.includes('id abc-1'));
    assert.ok(avvio.includes('`filone:P:bot` (3 sessioni'));
    const ripresa = contesto((await esegui(SESSION_START, JSON.stringify({ cwd: tmp, source: 'resume' }), env)).out);
    assert.ok(ripresa.includes('## indice:P\nI'));
    assert.ok(!ripresa.includes('Ultime sessioni'));
  } finally {
    await srv.chiudi();
  }
});

test('forward inoltra anche UserPromptSubmit, con il prompt mascherato', async () => {
  const tmp = cartellaTmp();
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    const evento = { session_id: 's9', cwd: tmp, hook_event_name: 'UserPromptSubmit',
      prompt: 'usa la chiave sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA per il test' };
    const r = await esegui(FORWARD, JSON.stringify(evento), ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` }));
    assert.strictEqual(r.codice, 0);
    const corpo = JSON.parse(srv.richieste[0].corpo);
    assert.strictEqual(corpo.hook_event_name, 'UserPromptSubmit');
    assert.ok(!corpo.prompt.includes('sk-ant-api03-AAAA'));
    assert.match(corpo.prompt, /MASCHERATO/);
  } finally {
    await srv.chiudi();
  }
});

// --- forward.js ---

test('forward con cwd sotto un segnaposto: POST /hooks con ferdiscope_project, niente su stdout', async () => {
  const tmp = cartellaTmp();
  fs.writeFileSync(path.join(tmp, '.ferdiscope'), 'Edicola In\n');
  const sotto = path.join(tmp, 'a', 'b');
  fs.mkdirSync(sotto, { recursive: true });
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{"ok":true}'); });
  try {
    const evento = { session_id: 's1', cwd: sotto, hook_event_name: 'PreToolUse', tool_name: 'Bash' };
    const r = await esegui(FORWARD, JSON.stringify(evento), ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` }));
    assert.strictEqual(r.codice, 0);
    assert.strictEqual(r.out, '');
    assert.strictEqual(srv.richieste.length, 1);
    const req = srv.richieste[0];
    assert.strictEqual(req.metodo, 'POST');
    assert.strictEqual(req.url, '/hooks');
    assert.match(req.headers['content-type'], /application\/json/);
    assert.deepStrictEqual(JSON.parse(req.corpo), { ...evento, ferdiscope_project: 'Edicola In' });
  } finally {
    await srv.chiudi();
  }
});

test('forward senza segnaposto: inoltra l\'evento così com\'è', async () => {
  const tmp = cartellaTmp();
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    const evento = { session_id: 's2', cwd: tmp, hook_event_name: 'Stop' };
    const r = await esegui(FORWARD, JSON.stringify(evento), ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` }));
    assert.strictEqual(r.codice, 0);
    assert.deepStrictEqual(JSON.parse(srv.richieste[0].corpo), evento);
  } finally {
    await srv.chiudi();
  }
});

test('forward senza FERDISCOPE_URL: non fa niente ed esce 0', async () => {
  const r = await esegui(FORWARD, JSON.stringify({ cwd: os.tmpdir() }), ambiente({}));
  assert.strictEqual(r.codice, 0);
  assert.strictEqual(r.out, '');
  assert.strictEqual(r.err, '');
});

test('forward verso un server che non risponde: esce 0 entro ~3,5 s', async () => {
  const srv = await avviaServer(() => { /* mai */ });
  try {
    const r = await esegui(FORWARD, JSON.stringify({ cwd: os.tmpdir() }), ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}` }));
    assert.strictEqual(r.codice, 0);
    assert.strictEqual(r.out, '');
    assert.ok(r.durata < 4000, `durata ${r.durata} ms`);
  } finally {
    await srv.chiudi();
  }
});

test('forward: segreti mascherati e campi oltre FERDISCOPE_MAX_CAMPO tagliati prima dell\'invio', async () => {
  const srv = await avviaServer((req, res) => { res.writeHead(200); res.end('{}'); });
  try {
    const gh = 'ghp' + '_' + 'abcdefghijABCDEFGHIJ0123456789abcdef';
    const evento = { session_id: 's3', cwd: os.tmpdir(), hook_event_name: 'PostToolUse', tool_name: 'Read',
      tool_response: { file: { content: `GITHUB_TOKEN=${gh}\n` + 'z'.repeat(5000) } } };
    const r = await esegui(FORWARD, JSON.stringify(evento), ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.porta}`, FERDISCOPE_MAX_CAMPO: '1000' }));
    assert.strictEqual(r.codice, 0);
    const corpo = srv.richieste[0].corpo;
    assert.ok(!corpo.includes(gh));
    const c = JSON.parse(corpo).tool_response.file.content;
    assert.ok(c.startsWith('GITHUB_TOKEN=[MASCHERATO:github]\n'));
    assert.match(c, /\n…\[troncato da FerdiScope: \d+ caratteri\]$/);
    assert.ok(c.length < 1100);
  } finally {
    await srv.chiudi();
  }
});

// --- 0.1.7: avviso del server ---
test('forward.js: stampa systemMessage solo se il server manda un avviso', async () => {
  let risposta = { ok: true };
  const srv = http.createServer((q, r) => { q.resume(); q.on('end', () => r.end(JSON.stringify(risposta))); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const env = ambiente({ FERDISCOPE_URL: `http://127.0.0.1:${srv.address().port}` });
    const ev = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: os.tmpdir() });
    const senza = await esegui(FORWARD, ev, env);
    assert.strictEqual(senza.out, '');
    risposta = { ok: true, avviso: 'soglia superata' };
    const con = await esegui(FORWARD, ev, env);
    assert.strictEqual(con.codice, 0);
    assert.match(JSON.parse(con.out).systemMessage, /^soglia superata /);
  } finally {
    srv.close();
  }
});
