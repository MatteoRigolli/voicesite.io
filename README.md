# VoiceSite – Copilot Studio con voce

Sito HTML statico che integra un agente Microsoft Copilot Studio tramite Bot Framework Web Chat e offre una conversazione completa nel browser:

1. l'utente parla in italiano;
2. il browser trascrive la domanda;
3. la domanda viene inviata a Copilot Studio;
4. la risposta testuale viene letta ad alta voce.

## Configurazione obbligatoria

1. In Copilot Studio apri l'agente.
2. Vai in **Settings > Security > Authentication**.
3. Seleziona **No authentication**, salva e pubblica l'agente.
4. Vai in **Channels > Web app**.
5. Copia il **Token endpoint**.
6. Apri `config.js` e sostituisci:

```js
tokenEndpoint: "INCOLLA_QUI_IL_TOKEN_ENDPOINT_DI_COPILOT_STUDIO"
```

con il valore copiato, mantenendo le virgolette.

> Non inserire nel repository chiavi Azure, client secret o altre credenziali. Il codice usa le API vocali del browser e non richiede una chiave Azure Speech.

## Pubblicazione su GitHub Pages

1. Carica `index.html`, `styles.css`, `config.js` e `app.js` nella root del repository.
2. In GitHub apri **Settings > Pages**.
3. In **Build and deployment**, scegli **Deploy from a branch**.
4. Seleziona il branch `main` e la cartella `/ (root)`.
5. Salva e attendi il completamento del workflow Pages.

Il microfono richiede un contesto HTTPS; GitHub Pages usa HTTPS.

## Compatibilità voice

Il sito utilizza `SpeechRecognition`/`webkitSpeechRecognition` per l'input e `speechSynthesis` per l'output. La combinazione è indicata soprattutto per versioni correnti di Microsoft Edge e Google Chrome. Se il riconoscimento non è disponibile, la chat testuale continua a funzionare e il pulsante microfono viene disabilitato.

Il riconoscimento vocale del browser può essere elaborato dal provider del browser. Per requisiti enterprise, controllo regionale o compatibilità più ampia, sostituire il riconoscimento nativo con Azure AI Speech e usare un endpoint backend per emettere token temporanei; non esporre mai la chiave Speech nel frontend.

## Test locale

Non aprire direttamente `index.html` con `file://`. Avvia un server statico, ad esempio:

```bash
python -m http.server 8000
```

Quindi visita `http://localhost:8000`. Per il microfono fuori da `localhost` è necessario HTTPS.

## File

- `index.html`: struttura accessibile dell'interfaccia.
- `styles.css`: layout desktop/mobile.
- `config.js`: configurazione non segreta del canale Copilot.
- `app.js`: connessione Direct Line, riconoscimento vocale e sintesi.
