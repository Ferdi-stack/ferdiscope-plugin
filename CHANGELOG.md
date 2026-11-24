# Changelog

## 0.1.8 — 2026-11-24
- skill ferdiscope-memoria: `get_memory_entries` anche come elenco (senza `keys`), tetto di 12.000 caratteri senza tagliare i valori, `set_memory_entries` con `type`, `activity_summary`; `indice:globale` corto e aree `area:globale:*` su richiesta. I tool vecchi sono deprecati fino al 2026-12-24. Hook invariati. Richiede il server FerdiScope del 2026-11-24.

## 0.1.7 — 2026-11-24
- hooks: se la risposta di `POST /hooks` contiene `avviso`, `forward.js` lo stampa come `systemMessage`. Essendo un hook async, l'avviso arriva a Claude al turno successivo e Claude lo riferisce a Ferdi (oggi: avviso di costo a 200k token di contesto, solo sessioni sulla VPS). Con un server vecchio non cambia niente.

## 0.1.6 — 2026-11-22
- SessionStart: se FerdiScope manda `testo` in `/api/context` (già composto, al massimo 1900 byte: regole essenziali, indice del progetto, ultime sessioni), il plugin passa quello così com'è; `indice:globale`, aree e filoni si leggono su richiesta. Prima il contesto superava i 15 KB e Claude Code ne mostrava solo l'inizio. Su resume/compact chiede `avvio=0` (niente sessioni). Con un server vecchio il testo resta quello di 0.1.5.
- hooks: `hooks/maschera.js` maschera anche il valore esatto di `FERDISCOPE_TOKEN`, ovunque compaia (di nuovo copia identica di `src/maschera.js` del server).

## 0.1.5 — 2026-11-21
- SessionStart: all'avvio vero (`source` startup o clear, non resume/compact) aggiunge le ultime 5 sessioni del progetto (età, filone, dimensione, id, cosa è stato fatto e dove si è fermata) e i filoni con la chiave del riassunto; Claude chiede se riprendere un filone, e per sessioni oltre 2 MB o più vecchie di 7 giorni consiglia una sessione nuova dal riassunto. Richiede FerdiScope con `sessioni`/`filoni` in `/api/context`; con un server vecchio il testo resta quello di prima.
- hooks: inoltra anche `UserPromptSubmit` (stesso mascheramento dei segreti), così le descrizioni automatiche delle sessioni del PC vedono le richieste di Ferdi.

## 0.1.4 — 2026-11-21
- hooks: prima di inoltrare un evento `forward.js`/`lib.inoltraEvento` maschera i segreti (`sk-ant-…`, token Telegram e GitHub, chiavi Google `AIza…`, blocchi `PRIVATE KEY`, `Bearer …`, valori di `PASSWORD/SECRET/TOKEN/API_KEY=…` e dei campi JSON con quei nomi) con `[MASCHERATO:<tipo>]`, e taglia ogni campo di testo oltre `FERDISCOPE_MAX_CAMPO` caratteri (default 20000). Regole in `hooks/maschera.js`, copia identica di `src/maschera.js` del server.
- hooks: `inoltraEvento` e `chiediContesto` verso URL non locali partono solo con token **e** in https (prima `inoltraEvento` non controllava niente).

## 0.1.2 — 2026-11-20
- hooks: `"onFailure": "continue"` su tutti gli hook (SessionStart, PreToolUse, PostToolUse, Stop), così in Code Mode un hook che fallisce o va in timeout non blocca la chiamata.
