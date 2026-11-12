# ferdiscope-plugin

Marketplace `ferdi-stack` con il plugin `ferdiscope`: porta la memoria di FerdiScope in ogni sessione di Claude Code (PC, portatile, VPS).

Versione attuale: prova minima. Un hook `SessionStart` scrive una riga in `~/.ferdiscope-prova.log` e la skill `prova-ferdiscope` conferma di essere attiva.

## Installazione

```
claude plugin marketplace add Ferdi-stack/ferdiscope-plugin
claude plugin install ferdiscope@ferdi-stack
```

## Variabili d'ambiente

Da impostare a mano su ogni dispositivo, **mai nel repository**:

- `FERDISCOPE_URL`: sul VPS `http://localhost:3010`, altrove `https://www.edicolain.it/ferdiscope`
- `FERDISCOPE_TOKEN`: lo digita Ferdi (`setx` su Windows, `~/.bashrc` o `/etc/environment` sul VPS)
