// Prova del plugin FerdiScope: scrive una riga in ~/.ferdiscope-prova.log
// a ogni avvio di sessione. Non blocca mai: esce sempre con 0.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let finito = false;
function scrivi(input) {
  if (finito) return;
  finito = true;
  try {
    let cwd = process.cwd();
    try {
      const dati = JSON.parse(input || '{}');
      if (dati && typeof dati.cwd === 'string' && dati.cwd) cwd = dati.cwd;
    } catch (e) { /* stdin non JSON: si usa process.cwd() */ }
    const riga = `${new Date().toISOString()} ${os.hostname()} ${cwd}\n`;
    fs.appendFileSync(path.join(os.homedir(), '.ferdiscope-prova.log'), riga);
  } catch (e) { /* mai fallire */ }
  process.exit(0);
}

try {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { buf += c; });
  process.stdin.on('end', () => scrivi(buf));
  process.stdin.on('error', () => scrivi(buf));
  setTimeout(() => scrivi(buf), 1000);
} catch (e) {
  scrivi('');
}
