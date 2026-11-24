// Funzioni comuni degli hook del plugin FerdiScope.
// Solo moduli standard di Node (>= 20). Nessuna funzione lancia eccezioni
// verso chi la chiama: in caso di problemi si restituisce null.
// Il token non viene mai stampato né scritto da nessuna parte.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { mascheraValore, troncaCampi } = require('./maschera.js');

const NOME_SEGNAPOSTO = '.ferdiscope';
const TIMEOUT_MS = 3000;
// Tetto per ogni campo di testo dell'evento inoltrato (FERDISCOPE_MAX_CAMPO per cambiarlo, 0 = nessun tetto).
const MAX_CAMPO_DEFAULT = 20000;

const NON_DISPONIBILE =
  'Memoria FerdiScope non disponibile in questa sessione (server o token mancanti): lavora normalmente.';

const REGOLE =
  "Le aree non sono caricate: quando il lavoro le tocca leggile tutte insieme con `get_memory_entries(progetto, ['area:<progetto>:<area>', ...])`. " +
  "Aggiorna la memoria una volta sola, quando Ferdi chiude la sessione o te lo chiede (non a ogni lavoro finito): " +
  "con `edit_memory` cambi solo le righe cambiate (ciò che non è più vero va in `storia:` con `to_history`, le [D] non si toccano, " +
  "l'indice solo se cambia qualcosa per tutto il progetto), non rileggi dopo aver salvato, e lo dici in una riga. " +
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

// File di riserva quando mancano le variabili d'ambiente (es. terminale aperto
// prima di `setx`): JSON {"url": "...", "token": "..."}. Percorso da
// FERDISCOPE_CONFIG, altrimenti ~/.ferdiscope.json.
function percorsoConfig(env) {
  const e = env || {};
  const p = typeof e.FERDISCOPE_CONFIG === 'string' ? e.FERDISCOPE_CONFIG.trim() : '';
  return p || path.join(os.homedir(), '.ferdiscope.json');
}

function leggiFileConfig(file) {
  try {
    const dati = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return dati && typeof dati === 'object' ? dati : {};
  } catch (e) {
    return {};
  }
}

function testo(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// Le variabili d'ambiente vincono; il file copre solo i campi che mancano.
function config(env, file) {
  const e = env || {};
  let url = testo(e.FERDISCOPE_URL);
  let token = testo(e.FERDISCOPE_TOKEN);
  if (!url || !token) {
    const f = leggiFileConfig(file || percorsoConfig(e));
    if (!url) url = testo(f.url);
    if (!token) token = testo(f.token);
  }
  url = url.replace(/\/+$/, '');
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

// Il token parte solo verso la stessa macchina o in https; verso un URL non
// locale serve il token (senza, il server risponderebbe comunque 401).
function destinazioneAmmessa(cfg) {
  try {
    if (!cfg || !cfg.url) return false;
    if (eLocale(cfg.url)) return true;
    return Boolean(cfg.token) && new URL(cfg.url).protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function maxCampo(env) {
  const v = parseInt((env || {}).FERDISCOPE_MAX_CAMPO, 10);
  return Number.isFinite(v) && v >= 0 ? v : MAX_CAMPO_DEFAULT;
}

// Copia dell'evento pronta per l'invio: segreti mascherati, poi campi lunghi tagliati.
function preparaEvento(evento, max = MAX_CAMPO_DEFAULT) {
  return troncaCampi(mascheraValore(evento), max);
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

// GET <url>/api/context. null su: URL mancante, URL non locale senza token o
// non https (nessuna richiesta), errore di rete, timeout, stato non 2xx, JSON non valido.
async function chiediContesto(cfg, dati, timeoutMs = TIMEOUT_MS) {
  try {
    if (!destinazioneAmmessa(cfg)) return null;
    const { cwd, project, root, avvio } = dati || {};
    const parti = [];
    if (avvio === false) parti.push('avvio=0');
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

// POST <url>/hooks con l'evento, dopo preparaEvento (segreti mascherati, campi
// lunghi tagliati). Niente richiesta verso URL non locali senza token o non https.
// Non lancia mai; restituisce true se il server ha risposto 2xx, oppure {avviso} se il server ne manda uno.
async function inoltraEvento(cfg, evento, timeoutMs = TIMEOUT_MS, max = MAX_CAMPO_DEFAULT) {
  try {
    if (!destinazioneAmmessa(cfg)) return false;
    const r = await chiamata(`${cfg.url}/hooks`, {
      method: 'POST',
      headers: intestazioni(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(preparaEvento(evento, max)),
    }, timeoutMs);
    if (!r.ok) return false;
    const risposta = analizzaInput(r.testo);
    return risposta && typeof risposta.avviso === 'string' && risposta.avviso ? { avviso: risposta.avviso.slice(0, 1000) } : true;
  } catch (e) {
    return false;
  }
}

// opzioni.sessioni: aggiunge ultime sessioni e filoni (solo all'avvio vero, non su resume/compact).
// 0.1.6: se il server manda `testo` (già composto, entro 1900 byte) si usa quello così com'è.
function testoContesto(ctx, nomeSegnaposto, opzioni = {}) {
  if (!ctx || typeof ctx !== 'object') return NON_DISPONIBILE;
  if (typeof ctx.testo === 'string' && ctx.testo.trim()) return ctx.testo;
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
    if (opzioni.sessioni) {
      const s = testoSessioni(ctx, opzioni.ora);
      if (s) parti.push(s);
    }
  }
  return parti.join('\n\n');
}

// --- ultime sessioni e filoni (0.1.5) ---
const GRANDE_BYTE = 2 * 1024 * 1024;   // oltre: riprendere ricarica molto contesto
const VECCHIA_GIORNI = 7;

// '2026-11-20 20:45:34' (UTC, come lo salva FerdiScope) -> ms, oppure NaN
function istante(ts) {
  if (typeof ts !== 'string' || !ts) return NaN;
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}

function eta(ts, ora) {
  const ms = ora - istante(ts);
  if (!Number.isFinite(ms)) return 'data ignota';
  const ore = Math.floor(ms / 3600000);
  if (ore < 1) return 'poco fa';
  if (ore < 24) return `${ore} ${ore === 1 ? 'ora' : 'ore'} fa`;
  const g = Math.floor(ore / 24);
  return `${g} ${g === 1 ? 'giorno' : 'giorni'} fa`;
}

function dimensione(byte) {
  if (!Number.isFinite(byte) || byte <= 0) return null;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function corto(t, n) {
  const s = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function testoSessioni(ctx, ora = Date.now()) {
  const p = ctx && ctx.progetto;
  const sessioni = Array.isArray(ctx && ctx.sessioni) ? ctx.sessioni : [];
  const filoni = Array.isArray(ctx && ctx.filoni) ? ctx.filoni : [];
  if (!p || (!sessioni.length && !filoni.length)) return '';
  const righe = [];
  if (sessioni.length) {
    righe.push(`## Ultime sessioni di «${p}» (descrizioni automatiche, possono essere imprecise)`);
    for (const s of sessioni.slice(0, 5)) {
      const pezzi = [eta(s.fine, ora)];
      pezzi.push(s.filone_titolo ? `filone «${s.filone_titolo}»` : 'senza filone');
      const dim = dimensione(s.byte);
      if (dim) pezzi.push(dim);
      pezzi.push(`id ${String(s.id).slice(0, 8)}`);
      const g = (ora - istante(s.fine)) / 86400000;
      if ((Number.isFinite(s.byte) && s.byte > GRANDE_BYTE) || g > VECCHIA_GIORNI) {
        pezzi.push('grande o vecchia → meglio nuova dal riassunto');
      }
      righe.push(`- ${pezzi.join(' · ')}`);
      righe.push(`  Fatto: ${corto(s.descrizione, 170)}${s.fermata ? ` Fermata: ${corto(s.fermata, 130)}` : ''}`);
    }
  }
  if (filoni.length) {
    righe.push('', `## Filoni di «${p}»`);
    for (const f of filoni.slice(0, 8)) {
      const quando = f.ultima ? `, ultima ${eta(f.ultima, ora)}` : '';
      righe.push(`- ${f.titolo} — \`${f.chiave}\` (${f.sessioni || 0} sessioni${quando})`);
    }
  }
  righe.push('',
    "Se la prima richiesta di Ferdi non dice già su cosa lavorare, chiedigli in una riga se vuole riprendere uno di questi filoni. " +
    `Per riprendere un filone leggi il suo riassunto con \`get_memory_entries('${p}', ['<chiave del filone>'])\`, non il transcript. ` +
    "Se vuole proprio la sessione vecchia, il comando (lo lancia lui) è `claude -r <id completo>` (cercalo con `ls ~/.claude/projects/*/<id>*`); per una sessione grande o vecchia conviene la sessione nuova dal riassunto: costa meno token.");
  return righe.join('\n');
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
  percorsoConfig,
  eLocale,
  destinazioneAmmessa,
  maxCampo,
  preparaEvento,
  MAX_CAMPO_DEFAULT,
  chiediContesto,
  inoltraEvento,
  testoContesto,
  testoSessioni,
  leggiStdin,
  analizzaInput,
};
