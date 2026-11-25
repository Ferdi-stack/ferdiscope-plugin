---
name: contesto-snello
description: Regole per leggere file, cercare e lanciare comandi senza riempire il contesto. Usala in ogni sessione di codice, soprattutto in task lunghi, loop /goal e Code Mode.
---

# Contesto snello

Il contesto si riempie soprattutto con l'output degli strumenti (file letti, diff, log, risultati di comandi), non con i messaggi. Ogni output resta in memoria per tutta la sessione: prima di lanciare qualcosa, chiediti quante righe ti servono davvero.

## Leggere file
- Prima localizza, poi leggi: `grep -n` / `rg -n` per trovare il punto, poi leggi solo l'intervallo di righe che serve (±20 righe).
- File sopra ~200 righe: mai per intero, salvo che serva davvero tutto. Per capirne la struttura: `wc -l` e `grep -n` su funzioni/sezioni.
- Non rileggere un file già letto in questa sessione se non è cambiato.
- CSV, JSON, log grandi: conta (`wc -l`), guarda l'intestazione (`head -n 5`), filtra (`jq`, `grep`, `awk`). Non stamparli.

## Cercare
- Prima `rg -l` (solo i nomi dei file), poi `rg -n -m 5` sui file giusti.
- Escludi sempre `node_modules`, `.git`, `dist`, `build`, backup e cartelle di dati pesanti.
- Esplorazioni ampie del codice (molti file, "dove viene usato X?"): se puoi, delega a un subagente che restituisce solo la conclusione.

## Lanciare comandi
- Output potenzialmente lungo: reindirizza su file e guarda solo quello che serve:
  `cmd > /tmp/out.log 2>&1; echo "exit $?"; tail -n 30 /tmp/out.log`
  poi, se serve, `grep -n -i -E "error|fail|warn" /tmp/out.log | head -n 20`.
- Usa le opzioni silenziose: `npm ci --silent`, `pip install -q`, `git diff --stat`, `git log --oneline -n 10`, `git status -s`.
- Test: lancia solo quelli pertinenti e mostra solo i fallimenti.
- Log di servizi (PM2, journalctl, nginx): sempre con `--lines`/`-n` e un filtro, mai l'intero log.
- Se un comando fallisce con lo stesso output lungo, non rilanciarlo identico: cambia approccio o restringi l'output.

## Code Mode / REPL
- Nel codice che esegui, stampa riassunti (conteggi, prime righe, chiavi) invece di oggetti o array interi.
- Tronca le stringhe lunghe prima di stamparle.

## Messaggi
- Non ripetere nei messaggi codice o diff appena scritti: indica `file:righe` e il motivo.
- Il resoconto finale per l'utente resta chiaro, completo e in italiano normale: cosa è stato fatto, cosa non è verificato, cosa deve fare lui. Questa regola riguarda gli strumenti, non come parli all'utente.

## Task lunghi
- Se il lavoro ha molti punti indipendenti e il contesto sta crescendo molto, fermati a un punto pulito, riassumi lo stato (fatto / da fare / non verificato) e proponi di continuare in una sessione nuova.
