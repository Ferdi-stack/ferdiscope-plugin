---
name: ferdiscope-memoria
description: Da usare quando si legge o si aggiorna la memoria FerdiScope di un progetto (chiavi indice, area, storia; righe [F] [P] [I] [?] [D] [S]), quando Ferdi chiude la sessione o chiede di aggiornarla, o quando il contesto di avvio dice che il progetto non ha ancora indice e aree.
---

# Memoria FerdiScope

## In breve

FerdiScope tiene, per ogni progetto, un **indice** e delle **aree** fatte di righe tipizzate. All'avvio l'hook del plugin mette nel contesto le regole, `## indice:globale` e `## indice:<progetto>`. Le aree non sono caricate: si leggono, tutte insieme, quando il lavoro le tocca. La memoria si aggiorna **una volta per sessione**, correggendo le righe dell'area, non aggiungendo resoconti.

## Chiavi

| Chiave | Cosa contiene | Quando si legge |
|---|---|---|
| `indice:globale` (progetto `FerdiScope`) | i progetti di Ferdi | già nel contesto |
| `indice:<progetto>` | stato in breve, elenco delle aree | già nel contesto |
| `area:<progetto>:<area>` | sezioni Cosa copre / Stato / Trappole / Decisioni / Da fare | quando il lavoro tocca quell'area |
| `storia:<progetto>:<area>` | righe `[S data]` che non valgono più | **mai di default**: solo se serve capire il passato |

## Strumenti (server MCP FerdiScope)

I nomi sono gli stessi sul connettore claude.ai (`mcp__claude_ai_FerdiScope__…`) e su quello locale (`mcp__ferdiscope__…`).

**Leggere**
- `get_memory_entries(project_name, keys[])`: legge più chiavi in una chiamata. È il modo normale di leggere: le chiavi che servono si chiedono tutte insieme. Una chiave che non c'è torna come `(not found)`.
- `get_memory_entry(project_name, key)`: una chiave sola.
- `get_project_memory`: scarica tutta la memoria. Sui progetti grandi supera il limite di una risposta: non usarlo.

**Scrivere**
- `edit_memory(project_name, edits[])`: cambia **singole righe** di chiavi che esistono già. È il modo normale di aggiornare. Ogni elemento di `edits` è `{ key, ops: [...] }`; le operazioni:
  - `{ op: "replace", match, line }`: sostituisce la riga che contiene `match`;
  - `{ op: "add", section, line }`: aggiunge in fondo alla sezione (`section` = titolo senza `##`, es. `"Trappole"`); con `after: "<testo>"` la mette dopo quella riga; senza nessuno dei due, in fondo alla chiave;
  - `{ op: "to_history", match, note }`: toglie la riga dall'area e la aggiunge in `storia:<progetto>:<area>` come `[S oggi] <riga> → <note>` (crea la storia se manca; `date` facoltativa);
  - `{ op: "remove", match }`: toglie una riga (per i doppioni; ciò che non è più vero va con `to_history`).

  `match` è un pezzo di testo che deve stare in **una sola** riga (della sezione, se dai `section`): scegline uno distintivo, per esempio il comando di verifica o le prime parole. Se una riga non si trova, o se ne trovano due, non viene scritto niente e la risposta dice perché: correggi `match` e rimanda tutto. Le modifiche partono dal valore salvato in quel momento, quindi non cancellano ciò che un altro dispositivo ha scritto nel frattempo. La risposta contiene il testo risultante di ogni chiave (o solo le lunghezze con `echo: "none"`) e le righe aggiunte in storia.
- `set_project_memory(project_name, key, value)`: sostituisce **tutto** il valore. Serve solo per creare una chiave nuova o per ristrutturarla davvero.
- `set_memory_entries(project_name, entries[])`: come sopra per più chiavi, in una transazione.

Tutte le scritture rispondono con tipo e lunghezza del valore salvato (`text, N chars`). Se il tipo non è `text`, la risposta lo segnala: riscrivi e avvisa Ferdi. **Non serve rileggere** dopo aver scritto.

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

## Aggiornare la memoria: una volta per sessione

**Quando.** Una volta sola, quando Ferdi chiude la sessione (saluta, dice che ha finito, che per oggi basta) o te lo chiede. Non a ogni lavoro finito né a ogni giro di correzioni: se nella stessa sessione rifai due volte la stessa area, la scrivi una volta, con lo stato finale. Lo fai da solo, senza chiedere prima, prima di salutarlo. Se dopo l'aggiornamento cambia ancora qualcosa, una sola `edit_memory` con le righe in più.

**Come.**
1. Le aree toccate le hai già lette all'inizio del lavoro. Se no, leggile ora con **una** `get_memory_entries`. Non serve rileggerle per paura di un altro dispositivo: `edit_memory` parte dal valore salvato.
2. Per ogni riga che il lavoro ha cambiato, un'operazione:
   - fatto corretto o riverificato → `replace` della stessa riga con data nuova;
   - trappola scoperta (cosa che farebbe sbagliare il prossimo) → `add` in `Trappole`;
   - decisione presa da Ferdi in sessione → `add` di una `[D]` in `Decisioni`;
   - ciò che non è più vero → `to_history` con `note` = cosa è cambiato (mai cancellarlo).

   Tieni la forma che l'area ha già (sezioni o elenco): non ristrutturarla.
3. Manda **tutte** le modifiche, di tutte le aree, in **una** `edit_memory`. L'`indice:<progetto>` entra nella stessa chiamata solo se cambia qualcosa che vale per tutto il progetto (stato, area nuova).
4. Non rileggere: la risposta di `edit_memory` è già il testo salvato.
5. Dillo a Ferdi in **una riga**: quali chiavi e cosa è cambiato.

Area nuova (o progetto senza aree): crea le chiavi con `set_memory_entries`, tutte in una chiamata.

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
3. Scrivi tutte le chiavi con **una** `set_memory_entries` (la risposta dice tipo e lunghezza di ognuna: niente riletture), riassumi in una riga.

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
| Riscrivere un'area intera con `set_project_memory` per cambiare qualche riga | `edit_memory` con le sole righe cambiate |
| Scrivere solo le righe nuove con `set_project_memory` | La chiave viene sostituita: per le righe c'è `edit_memory` |
| Rileggere una chiave dopo averla scritta | La risposta della scrittura dice già cosa è stato salvato |
| Aggiornare la stessa area a ogni giro di lavoro | Una volta, quando Ferdi chiude o lo chiede |
| Leggere le aree una chiamata alla volta | Una `get_memory_entries` con tutte le chiavi |
| `get_project_memory` per "vedere cosa c'è" | `get_memory_entry` della chiave che serve |
| Leggere tutte le aree o la storia all'avvio | Solo l'area che il lavoro tocca |
