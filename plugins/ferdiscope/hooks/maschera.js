// Mascheramento dei segreti e troncamento dei campi lunghi negli eventi degli hook.
// COPIA IDENTICA in due posti, da tenere allineati:
//   /root/ferdiscope-plugin/plugins/ferdiscope/hooks/maschera.js (prima dell'invio)
//   /root/FerdiScope/src/maschera.js (prima del salvataggio in hook_events)
// Solo moduli standard, zero dipendenze. Non lancia mai: su input strani
// restituisce l'input così com'è.
'use strict';

const SEGNO = (tipo) => `[MASCHERATO:${tipo}]`;
const GIA = '(?!\\[MASCHERATO)';

// Nomi che indicano un segreto (variabili d'ambiente, campi JSON, query string).
const NOME_SEGRETO = '[A-Za-z0-9_.-]{0,40}?(?:PASSWORD|PASSWD|SECRET|TOKEN(?!S)|API_?KEY)[A-Za-z0-9_.-]{0,40}';

// Valori che sono codice, non segreti: token = cfg.token, password = leggi(...), null.
const NON_VALORE = /^(?:[A-Za-z_$][\w$]*(?:\.[\w$]+)+|[A-Za-z_$][\w$.]*[([].*|null|undefined|None|true|false|True|False)$/;

// NOME=valore: mai se il valore è codice (process.env.X, leggi(...), os.environ[...]);
// con il nome in maiuscolo (variabile d'ambiente) basta un carattere, altrimenti 4.
function sostAssegnazione(m, nome, sep, val) {
  if (NON_VALORE.test(val.replace(/;$/, ''))) return m;
  if (nome !== nome.toUpperCase() && val.length < 4) return m;
  return nome + sep + SEGNO('valore');
}

const REGOLE = [
  // blocchi PEM; se il testo è stato tagliato prima dell'END si maschera fino alla fine
  ['private-key', /-----BEGIN ([A-Z0-9 ]{0,40})PRIVATE KEY-----[\s\S]*?(?:-----END \1PRIVATE KEY-----|$)/g, () => SEGNO('private-key')],
  ['sk-ant', /sk-ant-[A-Za-z0-9_-]{8,}/g, () => SEGNO('sk-ant')],
  ['github', /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{20,255})(?![A-Za-z0-9_])/g, () => SEGNO('github')],
  ['google', /\bAIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g, () => SEGNO('google')],
  ['telegram', /(?<![A-Za-z0-9_:-])\d{6,12}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g, () => SEGNO('telegram')],
  ['bearer', new RegExp('\\b(Bearer\\s+)' + GIA + '[A-Za-z0-9._~+/=-]{16,}', 'g'), (m, p) => p + SEGNO('bearer')],
  // "api_key": "valore"  (JSON dentro un testo, anche con le virgolette escapate)
  ['json', new RegExp('((\\\\?")' + NOME_SEGRETO + '\\2\\s*:\\s*\\2)' + GIA + '([^"\\\\]{4,})', 'gi'), (m, p) => p + SEGNO('valore')],
  // PASSWORD=valore, export API_KEY="valore", ?token=valore  (non $VAR, non già mascherati)
  ['assegnazione', new RegExp('\\b(' + NOME_SEGRETO + ')(\\s*=\\s*(?:\\\\?["\'])?)' + GIA + '(?![\$%{(])([^\\s"\'`;&,)<>\\\\]+)', 'gi'), sostAssegnazione],
];

// Chiavi di oggetti che contengono un segreto ("tokens", "max_tokens" & co. no);
// solo chiavi a forma di identificatore, non testi liberi usati come chiave.
const CHIAVE_SEGRETA = /^[\w.-]{0,60}(password|passwd|secret|token(?!s)|api_?key)[\w.-]{0,60}$/i;

function conta(stat, tipo, n) {
  if (!stat || !n) return;
  stat[tipo] = (stat[tipo] || 0) + n;
  stat.totale = (stat.totale || 0) + n;
}

// Maschera i segreti dentro una stringa. `stat` (facoltativo) conta per tipo.
function mascheraTesto(s, stat) {
  if (typeof s !== 'string' || s.length < 8) return s;
  let out = s;
  for (const [tipo, re, sost] of REGOLE) {
    re.lastIndex = 0;
    let n = 0;
    out = out.replace(re, (...a) => {
      const r = sost(...a);
      if (r !== a[0]) n++;
      return r;
    });
    conta(stat, tipo, n);
  }
  return out;
}

// Copia profonda dell'oggetto con i segreti mascherati: nelle stringhe e nei
// valori di chiavi come "password", "api_key", "token" (escluse quelle dei conteggi).
function mascheraValore(v, stat, chiave, prof = 0) {
  try {
    if (typeof v === 'string') {
      if (chiave && CHIAVE_SEGRETA.test(chiave) &&
          v.length >= 4 && !v.startsWith('[MASCHERATO') && !/^[$%]/.test(v)) {
        conta(stat, 'chiave', 1);
        return SEGNO('valore');
      }
      return mascheraTesto(v, stat);
    }
    if (!v || typeof v !== 'object' || prof > 50) return v;
    if (Array.isArray(v)) return v.map((x) => mascheraValore(x, stat, null, prof + 1));
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = mascheraValore(x, stat, k, prof + 1);
    return out;
  } catch (e) {
    return v;
  }
}

// Copia profonda con ogni stringa più lunga di `max` caratteri tagliata.
function troncaCampi(v, max, stat, prof = 0) {
  try {
    if (!(max > 0)) return v;
    if (typeof v === 'string') {
      if (v.length <= max) return v;
      conta(stat, 'troncati', 1);
      return `${v.slice(0, max)}\n…[troncato da FerdiScope: ${v.length} caratteri]`;
    }
    if (!v || typeof v !== 'object' || prof > 50) return v;
    if (Array.isArray(v)) return v.map((x) => troncaCampi(x, max, stat, prof + 1));
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = troncaCampi(x, max, stat, prof + 1);
    return out;
  } catch (e) {
    return v;
  }
}

module.exports = { mascheraTesto, mascheraValore, troncaCampi };
