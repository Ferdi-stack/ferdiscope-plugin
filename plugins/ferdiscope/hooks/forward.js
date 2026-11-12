// Hook di inoltro del plugin FerdiScope (PreToolUse, PostToolUse, Stop):
// manda l'evento a <FERDISCOPE_URL>/hooks aggiungendo `ferdiscope_project`
// quando la cartella sta sotto un segnaposto `.ferdiscope`.
// Non stampa niente, esce sempre con 0 e termina entro ~3,5 s
// (gli hook async non hanno il timeout imposto da Claude Code).
'use strict';

function esci() {
  process.exit(0);
}

setTimeout(esci, 3500).unref();

async function main() {
  const lib = require('./lib.js');
  const cfg = lib.config(process.env);
  if (!cfg.url) return;
  const evento = lib.analizzaInput(await lib.leggiStdin());
  if (!evento) return;
  const segnaposto = lib.trovaSegnaposto(typeof evento.cwd === 'string' ? evento.cwd : '');
  if (segnaposto) evento.ferdiscope_project = segnaposto.nome;
  await lib.inoltraEvento(cfg, evento, 3000);
}

main().then(esci, esci);
