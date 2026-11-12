// Funzioni comuni degli hook del plugin FerdiScope.
// Solo moduli standard di Node (>= 20). Nessuna funzione lancia eccezioni
// verso chi la chiama: in caso di problemi si restituisce null.
// Il token non viene mai stampato né scritto da nessuna parte.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const NOME_SEGNAPOSTO = '.ferdiscope';
const TIMEOUT_MS = 3000;

const NON_DISPONIBILE =
  'Memoria FerdiScope non disponibile in questa sessione (server o token mancanti): lavora normalmente.';

const REGOLE =
  "Le aree non sono caricate: leggile con `get_memory_entry(progetto, 'area:<progetto>:<area>')` quando il lavoro le tocca. " +
  "Quando dichiari un lavoro finito aggiorna da solo l'area (solo le righe cambiate, ciò che non è più vero va in `storia:`, " +
  "le [D] non si toccano, l'indice solo se cambia qualcosa per tutto il progetto) e dillo in una riga. " +
  'Dettagli: skill ferdiscope-memoria.';

// Risale da `dir` fino alla radice del disco cercando `.ferdiscope`.
// Restituisce {nome, radice} con la prima riga non vuota del file, oppure null.
function trovaSegnaposto(dir) {
  try {
    if (typeof dir !== 'string' || !dir) return null;
    let corrente = path.resolve(dir);
    for (;;) {
      const file = path.join(corrente, NOME_SEGNAPOSTO);
      try {
        if (fs.statSync(file).isFile()) {
          const riga = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((r) => r.trim()).find((r) => r);
          if (riga) return { nome: riga, radice: corrente };
        }
      } catch (e) { /* file assente o illeggibile: si sale */ }
      const sopra = path.dirname(corrente);
      if (sopra === corrente) return null;
      corrente = sopra;
    }
  } catch (e) {
    return null;
  }
}

function config(env) {
  const e = env || {};
  const url = typeof e.FERDISCOPE_URL === 'string' ? e.FERDISCOPE_URL.trim().replace(/\/+$/, '') : '';
  const token = typeof e.FERDISCOPE_TOKEN === 'string' ? e.FERDISCOPE_TOKEN.trim() : '';
  return { url: url || null, token: token || null };
}

// Le chiamate dalla stessa macchina (VPS) sono esenti dal token in FerdiScope.
function eLocale(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch (e) {
    return false;
  }
}

function intestazioni(cfg, extra) {
  const h = { ...(extra || {}) };
  if (cfg.token) h.Authorization = `Bearer ${cfg.token}`;
  return h;
}

// fetch con un tetto di tempo che copre anche la lettura del corpo.
async function chiamata(url, opzioni, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opzioni, signal: ctrl.signal });
    const testo = await res.text();
    return { ok: res.ok, status: res.status, testo };
  } finally {
    clearTimeout(timer);
  }
}

// GET <url>/api/context. null su: URL mancante, token mancante verso un URL
// non locale (nessuna richiesta), errore di rete, timeout, stato non 2xx, JSON non valido.
async function chiediContesto(cfg, dati, timeoutMs = TIMEOUT_MS) {
  try {
    if (!cfg || !cfg.url) return null;
    if (!cfg.token && !eLocale(cfg.url)) return null;
    const { cwd, project, root } = dati || {};
    const parti = [];
    if (cwd) parti.push('cwd=' + encodeURIComponent(cwd));
    if (project) parti.push('project=' + encodeURIComponent(project));
    if (root) parti.push('root=' + encodeURIComponent(root));
    const indirizzo = `${cfg.url}/api/context${parti.length ? '?' + parti.join('&') : ''}`;
    const r = await chiamata(indirizzo, { method: 'GET', headers: intestazioni(cfg, { Accept: 'application/json' }) }, timeoutMs);
    if (!r.ok) return null;
    const ctx = JSON.parse(r.testo);
    return ctx && typeof ctx === 'object' && !Array.isArray(ctx) ? ctx : null;
  } catch (e) {
    return null;
  }
}

// POST <url>/hooks con l'evento. Non lancia mai; restituisce true se il server ha risposto 2xx.
async function inoltraEvento(cfg, evento, timeoutMs = TIMEOUT_MS) {
  try {
    if (!cfg || !cfg.url) return false;
    const r = await chiamata(`${cfg.url}/hooks`, {
      method: 'POST',
      headers: intestazioni(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(evento),
    }, timeoutMs);
    return r.ok;
  } catch (e) {
    return false;
  }
}

function testoContesto(ctx, nomeSegnaposto) {
  if (!ctx || typeof ctx !== 'object') return NON_DISPONIBILE;
  const parti = [REGOLE];
  if (ctx.globale) parti.push(`## indice:globale\n${ctx.globale}`);
  const p = ctx.progetto;
  if (p) {
    if (ctx.indice) {
      parti.push(`## indice:${p}\n${ctx.indice}`);
    } else if (ctx.registrato === false) {
      parti.push(`Progetto "${p}" non registrato in FerdiScope: dillo in una riga.`);
    } else {
      parti.push(`Il progetto "${p}" non ha ancora indice e aree: dillo in una riga e proponi di prepararli (skill ferdiscope-memoria), poi lavora normalmente.`);
    }
  }
  return parti.join('\n\n');
}

// Legge tutto stdin, con un tetto di tempo nel caso non arrivi mai la fine.
function leggiStdin(timeoutMs = 1000) {
  return new Promise((ok) => {
    let buf = '';
    let finito = false;
    const fine = () => {
      if (finito) return;
      finito = true;
      clearTimeout(timer);
      ok(buf);
    };
    const timer = setTimeout(fine, timeoutMs);
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { buf += c; });
      process.stdin.on('end', fine);
      process.stdin.on('error', fine);
    } catch (e) {
      fine();
    }
  });
}

function analizzaInput(testo) {
  try {
    const dati = JSON.parse(testo || '');
    return dati && typeof dati === 'object' && !Array.isArray(dati) ? dati : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  NON_DISPONIBILE,
  REGOLE,
  TIMEOUT_MS,
  trovaSegnaposto,
  config,
  eLocale,
  chiediContesto,
  inoltraEvento,
  testoContesto,
  leggiStdin,
  analizzaInput,
};
