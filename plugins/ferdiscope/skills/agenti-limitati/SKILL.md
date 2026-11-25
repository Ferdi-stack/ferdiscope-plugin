---
name: agenti-limitati
description: "Limita i sotto-agenti: massimo 3 in parallelo, Sonnet per implementare, Opus solo per revisione e coordinamento. Usala quando un task ha molti punti, con /goal, Code Mode o liste lunghe."
---

# Agenti limitati

Ogni sotto-agente è una sessione completa che consuma quota per conto suo (CLAUDE.md, definizioni dei tool, skill, file letti). Sette agenti in parallelo esauriscono la quota delle 5 ore in circa 20 minuti. Queste regole valgono anche quando l'utente chiede di "fare tutto insieme" o "procedere da solo".

## Regole fisse
1. **Massimo 3 sotto-agenti attivi nello stesso momento**, revisori compresi. Se ci sono più aree, mettile in coda: ne parte una nuova solo quando un'altra finisce.
2. **Implementatori su Sonnet**: ogni agente che scrive o modifica codice si lancia con `model: "sonnet"`.
3. **Opus solo per**: coordinamento nella sessione principale, revisione finale di un'area, decisioni architetturali. Una revisione per area, non una per ogni piccolo cambiamento.
4. **Esplorazioni e ricerche semplici** (trovare file, contare righe, leggere log): `model: "haiku"` oppure falle direttamente, senza agente.
5. **Lavori piccoli** (meno di ~30 minuti stimati, uno o due file): falli nella sessione principale, senza agente.

## Prima di lanciare agenti
- Scrivi il piano: elenco delle aree, ordine, quali partono insieme (al massimo 3) e quali aspettano.
- Raggruppa i punti piccoli della stessa area in un solo agente invece di un agente per punto.
- Assegna a ogni agente file che non si sovrappongono.

## Brief per ogni agente
- Obiettivo, file coinvolti, cosa NON toccare.
- Niente deploy: li fa la sessione principale, uno alla volta.
- Mai stampare segreti (.env, token, chiavi) in output, log o test; nei test usare valori finti.
- Risultato da restituire breve: file modificati, cosa è stato fatto, cosa non è verificato. Niente diff completi.

## Quota
- Se un agente fallisce per limite d'uso, non rilanciarlo subito e non lanciarne altri: salva lo stato (fatto / in corso / da fare) e fermati.
- Ogni 2-3 aree completate, riassumi lo stato per l'utente in italiano chiaro.
