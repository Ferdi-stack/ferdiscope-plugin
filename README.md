# ferdiscope-plugin

Marketplace `ferdi-stack` con il plugin `ferdiscope`: porta la memoria di FerdiScope in ogni sessione di Claude Code (PC, portatile, VPS).

Versione 0.1.0:

- `hooks/session-start.js` (SessionStart): chiede `GET <FERDISCOPE_URL>/api/context` e passa a Claude le regole, `indice:globale` e `indice:<progetto>`. Se FerdiScope non risponde entro 3 s, o manca il token verso un URL non locale, passa una riga "memoria FerdiScope non disponibile".
- `hooks/forward.js` (PreToolUse, PostToolUse, Stop, in background): inoltra l'evento a `POST <FERDISCOPE_URL>/hooks`, aggiungendo `ferdiscope_project` quando la cartella sta sotto un segnaposto `.ferdiscope`.
- Segnaposto `.ferdiscope`: un file di una riga con il nome del progetto in FerdiScope, nella cartella radice del progetto (niente segreti).

Test: `node --test plugins/ferdiscope/tests/*.test.js`

## Installazione

```
claude plugin marketplace add Ferdi-stack/ferdiscope-plugin
claude plugin install ferdiscope@ferdi-stack
```

## Variabili d'ambiente

Da impostare a mano su ogni dispositivo, **mai nel repository**:

- `FERDISCOPE_URL`: sul VPS `http://localhost:3010`, altrove `https://www.edicolain.it/ferdiscope`
- `FERDISCOPE_TOKEN`: lo digita Ferdi (`setx` su Windows, `~/.bashrc` o `/etc/environment` sul VPS)

### File di riserva `~/.ferdiscope.json`

Se le variabili mancano (per esempio in un terminale aperto prima di `setx`), gli hook leggono
`~/.ferdiscope.json` (oppure il percorso in `FERDISCOPE_CONFIG`):

```json
{ "url": "https://www.edicolain.it/ferdiscope", "token": "..." }
```

Le variabili vincono sul file, campo per campo. Il file sta solo nella home del dispositivo, **mai nel repository**.
