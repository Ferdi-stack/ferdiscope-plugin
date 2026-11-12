// Hook SessionStart del plugin FerdiScope: chiede a FerdiScope gli indici
// (globale e del progetto) e li passa a Claude come additionalContext.
// Non blocca mai la sessione: esce sempre con 0 e, se qualcosa va storto,
// passa la riga "memoria FerdiScope non disponibile".
'use strict';

const NON_DISPONIBILE_RISERVA =
  'Memoria FerdiScope non disponibile in questa sessione (server o token mancanti): lavora normalmente.';

let scritto = false;
function rispondi(testo) {
  if (scritto) return;
  scritto = true;
  const uscita = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: typeof testo === 'string' && testo ? testo : NON_DISPONIBILE_RISERVA,
    },
  };
  try {
    process.stdout.write(JSON.stringify(uscita) + '\n', () => process.exit(0));
  } catch (e) {
    process.exit(0);
  }
}

// Rete di sicurezza: in ogni caso si risponde entro 6 s (timeout dell'hook: 10 s).
setTimeout(() => rispondi(NON_DISPONIBILE_RISERVA), 6000).unref();

async function main() {
  const lib = require('./lib.js');
  const input = lib.analizzaInput(await lib.leggiStdin()) || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const segnaposto = lib.trovaSegnaposto(cwd);
  const cfg = lib.config(process.env);
  const ctx = await lib.chiediContesto(cfg, {
    cwd,
    project: segnaposto ? segnaposto.nome : null,
    root: segnaposto ? segnaposto.radice : null,
  });
  rispondi(lib.testoContesto(ctx, segnaposto ? segnaposto.nome : null));
}

main().catch(() => rispondi(NON_DISPONIBILE_RISERVA));
