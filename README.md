# ⚽ FantaSchiera AI • Piattaforma Intelligente per il Fantacalcio

Piattaforma web mobile-first (ottimizzata appositamente per **iPhone** e utilizzabile anche da desktop) progettata per calcolare e suggerire la **migliore formazione da schierare al Fantacalcio**, con **alert automatico 1 ora prima della prima partita di Serie A**.

---

## 🌟 Funzionalità Principali

1. **Algoritmo di Selezione & Indice di Schierabilità (0-100)**:
   - **Infortuni & Squalifiche**: esclusione automatica di calciatori indisponibili (lesioni, squalifiche con motivazioni e tempi di rientro).
   - **Titolarità & Ballottaggi**: probabilità di titolarità in percentuale reale (es. 90%, 80%) e note sui ballottaggi da *Fantacalcio.it* e *SOSFanta*.
   - **Difficoltà Partita & Matchup**: fattore campo (casa/trasferta), solidità difensiva dell'avversario (da 1 a 5 stelle), incidenza clean sheet per portieri e bonus gol per attaccanti.
   - **Rendimento & Status**: quotazione attuale (QA), FVM (Fantavoto di Mercato), status di primo rigorista (+3 bonus) e battitore di piazzati.
   - **Ottimizzazione Modulo**: valutazione di tutti i moduli (3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-2-3-1, 5-3-2) con supporto al **Modificatore di Difesa**.

2. **Campo da Gioco Tattico Interattivo**:
   - Visualizzazione realistica del campo da calcio con maglie, ruoli (P, D, C, A), percentuali di titolarità, voti attesi e avversario di giornata.
   - Scheda di dettaglio per ogni giocatore con motivazione tattica ("Perché schierarlo").
   - Panchina ordinata per ruolo (P, D, C, A) secondo i regolamenti ufficiali.
   - Pulsante per **copiare la formazione negli appunti** pronta per WhatsApp o l'app della tua lega!

3. **Alert 1 Ora Prima del Fischio d'Inizio**:
   - Rileva in tempo reale il primo anticipo della giornata di Serie A.
   - Countdown in tempo reale con secondi che scorrono.
   - Notifiche Web Push su iPhone/browser e segnale acustico sintetizzato (fischietto/campanella).

4. **Gestione Rosa Semplice & Veloce**:
   - Database completo precaricato con oltre **600 calciatori di Serie A**.
   - Ricerca rapida con supporto a soprannomi (es. *Lautaro*, *Kvara*, *Calha*, *Dimarco*).
   - Modalità **"Incolla da Testo"** per incollare l'intera rosa da un messaggio WhatsApp o Note con riconoscimento automatico.
   - Rosa di esempio precaricata per testare subito l'applicazione.

---

## 📱 Come aprire l'App dal tuo iPhone (Anche Fuori Casa in 4G/5G)

L'applicazione supporta due modalità di accesso:

### A. Accesso da qualsiasi parte del mondo (4G / 5G / Fuori casa) 🌍
È stato configurato e integrato un **Cloudflare Tunnel HTTPS sicuro**. Puoi aprire Safari sul tuo iPhone e collegarti da qualunque luogo all'indirizzo pubblico:
```text
https://trans-equipment-cove-commonwealth.trycloudflare.com
```
*Grazie al certificato SSL/HTTPS nativo, Safari su iPhone ti permetterà di attivare le notifiche push e salvare l'app sulla Home senza alcun avviso di sicurezza.*

### B. Accesso locale (Se connesso alla stessa Wi-Fi del computer) 🏠
Se ti trovi a casa connesso alla stessa rete Wi-Fi del PC:
```text
http://10.224.2.159:8000
```
*(Da computer locale: `http://localhost:8000`).*

### 📲 Come installarla a schermo intero su iPhone:
1. Apri il link su **Safari**.
2. Tocca l'icona di **Condivisione** in basso (il quadrato con la freccia verso l'alto `⎋`).
3. Scorri e tocca **"Aggiungi a Schermata Home"** (*Add to Home Screen*).
4. Tocca **"Aggiungi"** in alto a destra.
5. Ora avrai l'icona di **FantaSchiera** sulla Home del tuo iPhone: si aprirà come una vera app nativa a schermo intero!

---

## 🚀 Come avviare la piattaforma

Il server è attualmente già attivo e in ascolto. Per avviarlo o riavviarlo in qualsiasi momento:

```powershell
python run.py
```

I dati possono essere aggiornati in qualsiasi momento premendo il tasto **"Aggiorna Dati 🔄"** nell'interfaccia.
