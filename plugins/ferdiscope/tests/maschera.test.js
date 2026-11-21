'use strict';
// Test del mascheramento dei segreti (../hooks/maschera.js).
const test = require('node:test');
const assert = require('node:assert');
const { mascheraTesto, mascheraValore, troncaCampi } = require("../hooks/maschera.js");

// segreti finti, costruiti a pezzi
const SK = 'sk-' + 'ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0_kLmNoPqRsT-uvwxyz';
const TG = '123456789' + ':' + 'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ';
const GH = 'ghp' + '_' + '0123456789abcdefghijABCDEFGHIJ012345';
const GHPAT = 'github' + '_pat_' + '11ABCDEFG0123456789_abcdefghijklmnopqrstuv';
const PEM = '-----BEGIN OPENSSH ' + 'PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\nQQQQ\n-----END OPENSSH ' + 'PRIVATE KEY-----';

test('sk-ant, Telegram, GitHub e PRIVATE KEY spariscono dal testo', () => {
  const stat = {};
  const s = mascheraTesto(`a ${SK} b ${TG} c ${GH} d ${GHPAT}\n${PEM}\ndopo`, stat);
  for (const segreto of [SK, TG, GH, GHPAT, 'b3BlbnNzaC1rZXktdjEAAAAA']) assert.ok(!s.includes(segreto), segreto);
  assert.match(s, /\[MASCHERATO:sk-ant\]/);
  assert.match(s, /\[MASCHERATO:telegram\]/);
  assert.match(s, /\[MASCHERATO:github\]/);
  assert.match(s, /\[MASCHERATO:private-key\]\ndopo$/);
  assert.deepStrictEqual(stat, { 'private-key': 1, 'sk-ant': 1, github: 2, telegram: 1, totale: 5 });
});

test('PRIVATE KEY tagliata prima dell\'END: mascherata fino alla fine', () => {
  const s = mascheraTesto('x\n-----BEGIN RSA ' + 'PRIVATE KEY-----\nMIIEowIBAAKCAQEA');
  assert.strictEqual(s, 'x\n[MASCHERATO:private-key]');
});

test('PASSWORD/SECRET/TOKEN/API_KEY=valore: maschera il valore, tiene il nome', () => {
  const s = mascheraTesto('export API_KEY="abc123xyz" DB_PASSWORD=pw CLIENT_SECRET=\'s3cr3t!\' FERDISCOPE_TOKEN=tok123456');
  assert.strictEqual(s, 'export API_KEY="[MASCHERATO:valore]" DB_PASSWORD=[MASCHERATO:valore] CLIENT_SECRET=\'[MASCHERATO:valore]\' FERDISCOPE_TOKEN=[MASCHERATO:valore]');
  assert.strictEqual(mascheraTesto('https://x.it/mcp?token=oEKXf4tDW6z1BP7u&a=1'), 'https://x.it/mcp?token=[MASCHERATO:valore]&a=1');
});

test('JSON dentro un testo, anche con virgolette escapate', () => {
  assert.strictEqual(mascheraTesto('{"api_key": "abcdef123"}'), '{"api_key": "[MASCHERATO:valore]"}');
  assert.strictEqual(mascheraTesto('{\\"client_secret\\":\\"zzzzzz\\"}'), '{\\"client_secret\\":\\"[MASCHERATO:valore]\\"}');
});

test('chiavi API Google', () => {
  const g = 'AIza' + 'SyA1234567890abcdefghijklmnopqrstuv';
  assert.strictEqual(mascheraTesto(`maps?key=${g}&x=1`), 'maps?key=[MASCHERATO:google]&x=1');
});

test('Bearer nelle intestazioni', () => {
  assert.strictEqual(mascheraTesto('Authorization: Bearer abcdefghijklmnop1234'), 'Authorization: Bearer [MASCHERATO:bearer]');
});

test('niente falsi positivi su conteggi, variabili e codice', () => {
  const testi = [
    'TOKEN=$TOKEN API_KEY=${API_KEY} SECRET=%SECRET%',
    'max_tokens=5 tokens_used=42 input_tokens=1000',
    '{"tokens_used": "12345", "max_tokens": "4096"}',
    'const token = cfg.token; const password = leggi(file); api_key = None',
    "const PASSWORD = process.env.ADRIATICA_PASSWORD || ''; BOT_TOKEN = os.environ[\"BOT_TOKEN\"]",
    "const bearerToken = (req.headers['authorization'] || '')",
    'ore 12:30, id 1234:abc, commit 0123456789abcdef',
  ];
  for (const t of testi) assert.strictEqual(mascheraTesto(t), t);
});

test('idempotente: rimascherare non cambia niente e non conta niente', () => {
  const una = mascheraTesto(`PASSWORD=hunter22 ${SK} Bearer abcdefghijklmnop1234 {"token": "abcdef12"}`);
  const stat = {};
  assert.strictEqual(mascheraTesto(una, stat), una);
  assert.deepStrictEqual(stat, {});
});

test('mascheraValore: oggetti annidati, chiavi segrete, nessuna mutazione', () => {
  const ev = {
    tool_name: 'Bash',
    tool_input: { command: `curl -H "x-api-key: ${SK}" https://api.x` },
    tool_response: { stdout: `BOT_TOKEN=${TG}`, righe: [GH, 'ok'] },
    env: { password: 'segreta1', FERDISCOPE_TOKEN: 'abcd1234', token: '$X' },
    usage: { input_tokens: 10, output_tokens: 20 },
    tokens: 'molti',
  };
  const copia = JSON.parse(JSON.stringify(ev));
  const stat = {};
  const out = mascheraValore(ev, stat);
  assert.deepStrictEqual(ev, copia);
  const testo = JSON.stringify(out);
  for (const s of [SK, TG, GH, 'segreta1', 'abcd1234']) assert.ok(!testo.includes(s), s);
  assert.strictEqual(out.env.token, '$X');
  assert.deepStrictEqual(out.usage, ev.usage);
  assert.strictEqual(out.tokens, 'molti');
  assert.strictEqual(out.tool_name, 'Bash');
  // chiave che è un testo libero (risposte di AskUserQuestion): non è un campo segreto
  const risposta = mascheraValore({ answers: { 'Metti tu password e OTP?': 'Sì, ci penso io' } });
  assert.strictEqual(risposta.answers['Metti tu password e OTP?'], 'Sì, ci penso io');
  assert.strictEqual(stat.totale, 5);
});

test('mascheraValore e mascheraTesto reggono input strani', () => {
  assert.strictEqual(mascheraValore(null), null);
  assert.strictEqual(mascheraValore(5), 5);
  assert.strictEqual(mascheraTesto(undefined), undefined);
  const ciclo = { a: 1 }; ciclo.self = ciclo;
  assert.doesNotThrow(() => mascheraValore(ciclo));
});

test('testi enormi: lineare, sotto il mezzo secondo', () => {
  const t0 = Date.now();
  mascheraTesto('a'.repeat(500000) + 'TOKEN');
  mascheraTesto('1'.repeat(300000) + ':');
  mascheraTesto('-----BEGIN X'.repeat(30000));
  mascheraTesto('PASSWORD'.repeat(50000));
  assert.ok(Date.now() - t0 < 500, `${Date.now() - t0} ms`);
});

test('troncaCampi taglia solo le stringhe oltre il tetto e lo dice', () => {
  const stat = {};
  const out = troncaCampi({ a: 'x'.repeat(50), b: ['y'.repeat(5)], n: 3 }, 10, stat);
  assert.ok(out.a.startsWith('x'.repeat(10) + '\n…[troncato da FerdiScope: 50 caratteri]'));
  assert.deepStrictEqual(out.b, ['yyyyy']);
  assert.strictEqual(out.n, 3);
  assert.deepStrictEqual(stat, { troncati: 1, totale: 1 });
  assert.deepStrictEqual(troncaCampi({ a: 'x'.repeat(50) }, 0), { a: 'x'.repeat(50) });
});
