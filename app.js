(() => {
  "use strict";

  const config = window.VOICE_SITE_CONFIG || {};
  const elements = {
    webchat: document.getElementById("webchat"),
    mic: document.getElementById("microphone-button"),
    micLabel: document.getElementById("microphone-label"),
    stop: document.getElementById("stop-button"),
    outputToggle: document.getElementById("voice-output-toggle"),
    statusText: document.getElementById("status-text"),
    statusDot: document.getElementById("status-dot"),
    error: document.getElementById("configuration-error"),
    errorText: document.getElementById("configuration-error-text"),
    help: document.getElementById("voice-help")
  };

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  const spokenActivityIds = new Set();
  let recognition = null;
  let store = null;
  let connected = false;
  let listening = false;

  function setStatus(message, state = "busy") {
    elements.statusText.textContent = message;
    elements.statusDot.className = `status__dot status__dot--${state}`;
  }

  function showError(message) {
    elements.errorText.textContent = message;
    elements.error.hidden = false;
    setStatus("Errore", "error");
  }

  function setListening(value) {
    listening = value;
    elements.mic.classList.toggle("voice-button--listening", value);
    elements.mic.setAttribute("aria-pressed", String(value));
    elements.mic.setAttribute("aria-label", value ? "Interrompi ascolto" : "Inizia a parlare");
    elements.micLabel.textContent = value ? "In ascolto…" : "Parla";
  }

  function stripMarkup(text) {
    const container = document.createElement("div");
    container.innerHTML = String(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/[*_~>|]/g, " ");
    return (container.textContent || "").replace(/\s+/g, " ").trim();
  }

  function selectItalianVoice() {
    if (!synthesis) return null;
    const voices = synthesis.getVoices();
    return voices.find(voice => voice.lang.toLowerCase() === "it-it")
      || voices.find(voice => voice.lang.toLowerCase().startsWith("it"))
      || null;
  }

  function speak(text) {
    if (!synthesis || !elements.outputToggle.checked) return;
    const cleanText = stripMarkup(text);
    if (!cleanText) return;

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = config.locale || "it-IT";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    const voice = selectItalianVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      elements.stop.disabled = false;
      setStatus("Sto rispondendo", "busy");
    };
    utterance.onend = () => {
      elements.stop.disabled = true;
      setStatus("Pronto", "ready");
    };
    utterance.onerror = event => {
      elements.stop.disabled = true;
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setStatus("Chat pronta; voce non disponibile", "error");
      }
    };

    synthesis.speak(utterance);
  }

  function configureRecognition() {
    if (!SpeechRecognition) {
      elements.help.textContent = "Il riconoscimento vocale non è supportato da questo browser. Puoi usare la chat testuale.";
      elements.mic.disabled = true;
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = config.locale || "it-IT";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (synthesis) synthesis.cancel();
      setListening(true);
      setStatus("In ascolto", "busy");
    };

    recognition.onresult = event => {
      let transcript = "";
      let finalTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
        if (event.results[index].isFinal) finalTranscript += event.results[index][0].transcript;
      }
      elements.help.textContent = finalTranscript
        ? `Hai detto: “${finalTranscript.trim()}”`
        : `Ascolto: “${transcript.trim()}”`;

      if (finalTranscript.trim()) {
        sendVoiceMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = event => {
      setListening(false);
      const messages = {
        "not-allowed": "Permesso microfono negato. Abilitalo nelle impostazioni del browser.",
        "audio-capture": "Nessun microfono disponibile.",
        "no-speech": "Non ho rilevato alcuna voce. Riprova.",
        network: "Il servizio di riconoscimento vocale non è raggiungibile."
      };
      elements.help.textContent = messages[event.error] || `Errore del riconoscimento vocale: ${event.error}.`;
      setStatus("Pronto", "ready");
    };

    recognition.onend = () => {
      setListening(false);
      if (connected && elements.statusText.textContent === "In ascolto") {
        setStatus("Pronto", "ready");
      }
    };
  }

  function sendVoiceMessage(text) {
    if (!connected || !store) {
      elements.help.textContent = "L'assistente non è ancora connesso.";
      return;
    }

    setStatus("Elaborazione", "busy");
    store.dispatch({
      type: "WEB_CHAT/SEND_MESSAGE",
      payload: { text, method: "speech" }
    });
  }

  function createStore() {
    return window.WebChat.createStore({}, ({ dispatch }) => next => action => {
      if (action.type === "DIRECT_LINE/CONNECT_FULFILLED") {
        connected = true;
        elements.mic.disabled = !recognition;
        setStatus("Pronto", "ready");
        dispatch({
          type: "DIRECT_LINE/POST_ACTIVITY",
          meta: { method: "keyboard" },
          payload: {
            activity: {
              type: "event",
              name: "startConversation",
              channelData: { postBack: true }
            }
          }
        });
      }

      if (action.type === "WEB_CHAT/SEND_MESSAGE") {
        setStatus("Elaborazione", "busy");
      }

      if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
        const activity = action.payload && action.payload.activity;
        if (activity && activity.from && activity.from.role === "bot" && activity.type === "message") {
          setStatus("Pronto", "ready");
          const activityKey = activity.id || `${activity.timestamp || ""}:${activity.text || ""}`;
          if (activity.text && !spokenActivityIds.has(activityKey)) {
            spokenActivityIds.add(activityKey);
            speak(activity.text);
          }
        }
      }

      if (action.type === "DIRECT_LINE/CONNECT_REJECTED") {
        connected = false;
        elements.mic.disabled = true;
        showError("Connessione a Copilot Studio non riuscita. Controlla il Token endpoint in config.js e ripubblica l'agente.");
      }

      return next(action);
    });
  }

  function directLineDomain(channelUrl) {
    const normalized = channelUrl.endsWith("/") ? channelUrl : `${channelUrl}/`;
    return normalized.includes("v3/directline") ? normalized.replace(/\/$/, "") : `${normalized}v3/directline`;
  }

  async function connectToCopilot() {
    if (!window.WebChat) {
      throw new Error("La libreria Microsoft Bot Framework Web Chat non è stata caricata.");
    }

    const tokenEndpoint = config.tokenEndpoint;
    if (!tokenEndpoint || tokenEndpoint.includes("INCOLLA_QUI")) {
      throw new Error("Apri config.js e inserisci il Token endpoint disponibile in Copilot Studio > Channels > Web app.");
    }

    let endpointUrl;
    try {
      endpointUrl = new URL(tokenEndpoint);
    } catch {
      throw new Error("Il Token endpoint configurato in config.js non è un URL valido.");
    }

    const marker = "/powervirtualagents";
    const markerIndex = tokenEndpoint.indexOf(marker);
    const apiVersion = endpointUrl.searchParams.get("api-version");
    if (markerIndex < 0 || !apiVersion) {
      throw new Error("Il Token endpoint non ha il formato previsto per Copilot Studio.");
    }

    const environmentEndpoint = tokenEndpoint.slice(0, markerIndex);
    const settingsUrl = `${environmentEndpoint}/powervirtualagents/regionalchannelsettings?api-version=${encodeURIComponent(apiVersion)}`;

    const [tokenResponse, settingsResponse] = await Promise.all([
      fetch(tokenEndpoint, { cache: "no-store" }),
      fetch(settingsUrl, { cache: "no-store" })
    ]);

    if (!tokenResponse.ok) throw new Error(`Copilot Studio ha rifiutato il token (${tokenResponse.status}).`);
    if (!settingsResponse.ok) throw new Error(`Configurazione regionale non disponibile (${settingsResponse.status}).`);

    const conversationInfo = await tokenResponse.json();
    const regionalSettings = await settingsResponse.json();
    const channelUrl = regionalSettings.channelUrlsById && regionalSettings.channelUrlsById.directline;

    if (!conversationInfo.token || !channelUrl) {
      throw new Error("La risposta di Copilot Studio non contiene token o URL Direct Line.");
    }

    store = createStore();
    const userID = window.crypto && crypto.randomUUID
      ? `web-${crypto.randomUUID()}`
      : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    window.WebChat.renderWebChat({
      directLine: window.WebChat.createDirectLine({
        token: conversationInfo.token,
        domain: directLineDomain(channelUrl)
      }),
      store,
      userID,
      username: config.userName || "Utente",
      locale: config.locale || "it-IT",
      styleOptions: {
        accent: "#4b4fcf",
        backgroundColor: "#f8faff",
        botAvatarInitials: "AI",
        bubbleBackground: "#eef1f8",
        bubbleBorderRadius: 14,
        bubbleFromUserBackground: "#4b4fcf",
        bubbleFromUserTextColor: "#ffffff",
        bubbleFromUserBorderRadius: 14,
        bubbleMaxWidth: 560,
        hideUploadButton: true,
        sendBoxBackground: "#ffffff",
        sendBoxPlaceholder: "Scrivi oppure premi Parla…",
        suggestedActionLayout: "flow"
      }
    }, elements.webchat);
  }

  elements.mic.addEventListener("click", () => {
    if (!recognition || !connected) return;
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        elements.help.textContent = `Impossibile avviare il microfono: ${error.message}`;
      }
    }
  });

  elements.stop.addEventListener("click", () => {
    if (synthesis) synthesis.cancel();
    elements.stop.disabled = true;
    setStatus(connected ? "Pronto" : "Connessione…", connected ? "ready" : "busy");
  });

  elements.outputToggle.addEventListener("change", () => {
    if (!elements.outputToggle.checked && synthesis) {
      synthesis.cancel();
      elements.stop.disabled = true;
    }
  });

  window.addEventListener("beforeunload", () => {
    if (recognition && listening) recognition.abort();
    if (synthesis) synthesis.cancel();
  });

  configureRecognition();
  connectToCopilot().catch(error => {
    console.error(error);
    showError(error.message);
  });
})();
