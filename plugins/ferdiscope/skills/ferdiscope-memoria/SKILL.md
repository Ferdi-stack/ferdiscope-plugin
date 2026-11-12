---
name: ferdiscope-memoria
description: Da usare quando si legge o si aggiorna la memoria FerdiScope di un progetto (chiavi indice, area, storia; righe [F] [P] [I] [?] [D] [S]), quando si dichiara finito un lavoro, o quando il contesto di avvio dice che il progetto non ha ancora indice e aree.
---

# Memoria FerdiScope

## In breve

FerdiScope tiene, per ogni progetto, un **indice** e delle **aree** fatte di righe tipizzate. All'avvio l'hook del plugin mette nel contesto le regole, `## indice:globale` e `## indice:<progetto>`. Le aree non sono caricate: si leggono una alla volta quando il lavoro le tocca. A fine lavoro si correggono le righe dell'area, non si aggiungono resoconti.

## Chiavi

| Chiave | Cosa contiene | Quando si legge |
|---|---|---|
| `indice:globale` (progetto `FerdiScope`) | i progetti di Ferdi | già nel contesto |
| `indice:<progetto>` | stato in breve, elenco delle aree | già nel contesto |
| `area:<progetto>:<area>` | sezioni Cosa copre / Stato / Trappole / Decisioni / Da fare | quando il lavoro tocca quell'area |
| `storia:<progetto>:<area>` | righe `[S data]` che non valgono più | **mai di default**: solo se serve capire il passato |

## Strumenti (connettore claude.ai FerdiScope)

- `mcp__claude_ai_FerdiScope__get_memory_entry(project_name, key)`: legge una chiave. È il modo normale di leggere.
- `mcp__claude_ai_FerdiScope__set_project_memory(project_name, key, value)`: sostituisce **tutto** il valore della chiave. `value` è una stringa di testo.
- `get_project_memory`: scarica tutta la memoria. Sui progetti grandi supera il limite di una risposta: non usarlo. Per sapere se una chiave esiste, `get_memory_entry` su quella chiave.

Il token di FerdiScope e ogni altra credenziale non passano dall'assistente: li digita Ferdi.

## Tipi di riga

| Riga | Significa | Come si usa |
|---|---|---|
| `[F AAAA-MM-GG \| verifica: <comando>]` | fatto verificato in quella data | se è scaduto (30 giorni per i dati, 90 per la struttura) si rilancia il comando di verifica **prima** di usarlo, e si aggiorna la data |
| `[P]` | possibilità | non è una cosa fatta né decisa |
| `[I]` | intenzione | non è una cosa fatta |
| `[?]` | domanda per Ferdi | si chiede a lui, non si risponde da soli |
| `[D]` | decisione di Ferdi | non si cambia se Ferdi non l'ha detto |
| `[S data]` | storia: era vero, non lo è più | sta nella chiave `storia:` |

Un `[F]` si scrive solo con un comando di verifica che si può rilanciare, e solo se tutta la riga l'hai verificata tu in questa sessione. Ciò che non hai verificato resta senza `[F]` (o è un `[?]`). Le date sono quelle di oggi in Europe/Rome.

## A fine lavoro: aggiornare l'area

Quando dichiari un lavoro finito, aggiorna da solo, senza chiedere prima, anche se Ferdi sta chiudendo (prima di salutarlo):

1. `get_memory_entry` dell'area toccata (se non l'hai già letta in sessione: rileggila comunque, potrebbe averla scritta un altro dispositivo).
2. Cambia solo le righe che il lavoro ha cambiato:
   - fatto corretto o riverificato → stessa riga con data nuova;
   - trappola scoperta (cosa che farebbe sbagliare il prossimo) → riga nuova in Trappole;
   - decisione presa da Ferdi in sessione → `[D]`;
   - ciò che non è più vero → toglilo dall'area e mettilo in `storia:<progetto>:<area>` come `[S AAAA-MM-GG] <vecchia riga> → <cosa è cambiato>`.

   Tieni la forma che l'area ha già (sezioni o elenco): non ristrutturarla.
3. Se tocchi la storia, scrivila **prima** dell'area: `get_memory_entry`, aggiungi in fondo, `set_project_memory` intera (se la chiave non esiste, la crei con la sola riga nuova). Poi `set_project_memory` con l'area **intera** (tutte le righe, anche quelle non toccate).
4. Rileggi con `get_memory_entry` ogni chiave scritta e controlla che torni **testo** uguale a quello scritto. Una volta un valore è finito salvato come oggetto di byte (Buffer): se succede, riscrivi e avvisa Ferdi.
5. L'`indice:<progetto>` solo se cambia qualcosa che vale per tutto il progetto (stato, area nuova).
6. Dillo a Ferdi in **una riga**: quali chiavi e cosa è cambiato.

Se il lavoro contraddice una `[D]`: la `[D]` resta com'è, aggiungi un `[?]` e dillo a Ferdi nella stessa riga.

Cosa NON entra nella memoria, né nell'area né nella storia: "oggi ho corretto X", elenchi dei file toccati, riassunti della sessione. Un bug corretto entra solo come fatto che ora è vero (`[F … | verifica: test]`) o come trappola, se il prossimo potrebbe ricascarci. Se Ferdi chiede di "segnare cosa abbiamo fatto oggi", scrivi i fatti che ora sono veri.

## Progetto senza indice

Il contesto lo dice ("non ha ancora indice e aree"). Allora:

1. Dillo in una riga e proponi di prepararli; poi fai subito quello che Ferdi ha chiesto. Non bloccare il lavoro: la memoria si prepara dopo, e il lavoro appena fatto ci entra come righe dell'area giusta.
2. Se Ferdi accetta, il metodo è quello usato per Edicola In:
   - **inventario delle trappole**: dal codice, dai README/CLAUDE.md, dalla cronologia (git log), le cose che hanno fatto o farebbero sbagliare;
   - **aree**: nomi in minuscolo con trattini, 4-10 parti del progetto che si lavorano separatamente, ciascuna con Cosa copre / Stato / Trappole / Decisioni / Da fare, più `metodo` (come si lavora: test, deploy, git);
   - **indice**: stato in una riga ed elenco delle aree;
   - le prepari tu; a Ferdi vanno **solo le domande** che il codice non risolve: scritte come righe `[?]` e mandate tutte insieme in un messaggio. Non chiedergli di dettare o confermare riga per riga.
3. Scrivi con `set_project_memory` una chiave alla volta, rileggi ognuna (passo 4 sopra), riassumi in una riga.

Se il contesto dice invece che il progetto **non è registrato** in FerdiScope: dillo in una riga e basta. Il plugin non crea progetti da solo.

## Cartelle che non sono un progetto

Home, `/root`, Desktop, cartelle temporanee: c'è solo `indice:globale`. Non proporre indice né aree, non scrivere memoria.

## Stesso progetto su più dispositivi

Il file `.ferdiscope` nella cartella radice contiene una riga: il nome del progetto in FerdiScope. L'hook lo cerca risalendo dalla cartella corrente, così PC e VPS leggono lo stesso progetto. Se un progetto registrato non ce l'ha, proponi di crearlo (nei progetti con git va committato). Niente segreti dentro.

## Errori tipici

| Errore | Invece |
|---|---|
| Aggiungere "Sessione del <data>: …" all'area o alla storia | Correggere le righe che sono cambiate |
| Usare un `[F]` scaduto come vero | Rilanciare la verifica, poi usarlo |
| Trattare `[P]`/`[I]` come fatti | Sono possibilità e intenzioni |
| Cancellare una riga non più vera | Spostarla in `storia:` come `[S data]` |
| Scrivere solo le righe nuove con `set_project_memory` | Scrivere l'area intera: la chiave viene sostituita |
| Fidarsi della scrittura senza rileggere | `get_memory_entry` e controllare che sia testo |
| `get_project_memory` per "vedere cosa c'è" | `get_memory_entry` della chiave che serve |
| Leggere tutte le aree o la storia all'avvio | Solo l'area che il lavoro tocca |
