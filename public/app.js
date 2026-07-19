const state = {
  pc: null,
  dc: null,
  ws: null,
  localStream: null,
  audioContext: null,
  micSource: null,
  processor: null,
  playbackTime: 0,
  playbackSources: [],
  sessionId: null,
  provider: null,
  sentTurns: new Set(),
  handledFunctionCalls: new Set(),
  geminiUserTranscript: '',
  geminiAssistantTranscript: '',
  visualizerContext: null,
  visualizerSource: null,
  visualizerAnalyser: null,
  visualizerData: null,
  visualizerFrame: null,
  speechTimeout: null,
  geminiSetupTimer: null,
  stopping: false,
  reconnectTimer: null,
  reconnectAttempts: 0,
  reconnectCount: 0,
  sessionStartedAt: 0,
  connectionLatencyMs: null,
  geminiResumeHandle: null,
};

const MIC_CONSTRAINTS = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

const els = {
  displayName: document.getElementById('displayName'),
  location: document.getElementById('location'),
  userId: document.getElementById('userId'),
  provider: document.getElementById('provider'),
  sessionMode: document.getElementById('sessionMode'),
  startButton: document.getElementById('startButton'),
  stopButton: document.getElementById('stopButton'),
  status: document.getElementById('connectionStatus'),
  providerStatus: document.getElementById('providerStatus'),
  transcript: document.getElementById('transcript'),
  remoteAudio: document.getElementById('remoteAudio'),
  memoryList: document.getElementById('memoryList'),
  knowledgeFileInput: document.getElementById('knowledgeFileInput'),
  knowledgeList: document.getElementById('knowledgeList'),
  refreshKnowledgeButton: document.getElementById('refreshKnowledgeButton'),
  debugPanel: document.getElementById('debugPanel'),
  debugDrawer: document.getElementById('debugDrawer'),
  toggleDebugButton: document.getElementById('toggleDebugButton'),
  forgetText: document.getElementById('forgetText'),
  forgetButton: document.getElementById('forgetButton'),
  refreshMemoryButton: document.getElementById('refreshMemoryButton'),
  clearDebugButton: document.getElementById('clearDebugButton'),
  stageState: document.getElementById('stageState'),
  stageHint: document.getElementById('stageHint'),
  timeGreeting: document.getElementById('timeGreeting'),
  preferenceStatus: document.getElementById('preferenceStatus'),
  waveformBars: document.querySelectorAll('.waveform span'),
};

function normalizeUserId(value) {
  return String(value || '').trim() || 'local-user';
}

els.userId.value = normalizeUserId(localStorage.getItem('mira:userId'));
els.displayName.value = String(localStorage.getItem('mira:displayName') || '').trim();
els.location.value = String(localStorage.getItem('mira:location') || '').trim();
els.sessionMode.value = localStorage.getItem('mira:sessionMode') || 'companion';
els.provider.value = localStorage.getItem('mira:provider') || els.provider.value;
document.body.dataset.mode = els.sessionMode.value;

let preferenceStatusTimer = null;
function showPreferencesSaved(message = 'Saved for your next conversation.') {
  if (!els.preferenceStatus) return;
  els.preferenceStatus.textContent = message;
  window.clearTimeout(preferenceStatusTimer);
  preferenceStatusTimer = window.setTimeout(() => {
    els.preferenceStatus.textContent = 'Changes save automatically.';
  }, 2200);
}

function setSessionControlsDisabled(disabled) {
  els.startButton.disabled = disabled;
  els.provider.disabled = disabled;
  els.userId.disabled = disabled;
  els.displayName.disabled = disabled;
  els.location.disabled = disabled;
  els.sessionMode.disabled = disabled;
}

function setTimeGreeting() {
  if (!els.timeGreeting) return;
  const hour = new Date().getHours();
  const moment = hour < 5 ? 'A quiet late-night space' : hour < 12 ? 'Good morning' : hour < 17 ? 'A moment for you' : hour < 22 ? 'Good evening' : 'A quiet late-night space';
  els.timeGreeting.textContent = moment;
}

function normalizeStatusMode(text, mode) {
  if (mode && mode !== 'idle') return mode;

  const lowered = String(text || '').toLowerCase();
  if (lowered.includes('connect')) return 'connecting';
  if (lowered.includes('sav')) return 'saving';
  if (lowered.includes('error')) return 'error';
  if (lowered.includes('live')) return 'live';
  return mode || 'idle';
}

function setVisualMode(mode) {
  const visualMode = ['connecting', 'live', 'saving', 'error'].includes(mode) ? mode : 'idle';
  document.body.classList.remove('is-idle', 'is-connecting', 'is-live', 'is-saving', 'is-error');
  document.body.classList.add(`is-${visualMode}`);
  document.body.classList.toggle('is-listening', visualMode === 'live');

  if (!els.stageState) return;

  const labels = {
    idle: 'What’s on your mind?',
    connecting: 'Mira is joining…',
    live: 'I’m listening.',
    saving: 'Keeping this moment…',
    error: 'We lost the thread.',
  };
  els.stageState.textContent = labels[visualMode];
  if (els.stageHint) {
    els.stageHint.textContent = {
      idle: 'No agenda. Start wherever you are.',
      connecting: 'Opening a private voice channel.',
      live: 'Speak naturally — you can pause or interrupt anytime.',
      saving: 'Saving the pieces you asked Mira to remember.',
      error: 'Try reconnecting when you’re ready.',
    }[visualMode];
  }
}

function setStatus(text, mode = 'idle') {
  const statusMode = normalizeStatusMode(text, mode);
  els.status.textContent = text;
  els.status.className = `status ${statusMode}`;
  setVisualMode(statusMode);
}

function clearReconnectTimer() {
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
}

function scheduleReconnect(reason) {
  if (state.stopping || !state.sessionId || state.reconnectTimer || state.reconnectAttempts >= 2) return;
  state.reconnectAttempts += 1;
  state.reconnectCount += 1;
  setStatus('Reconnecting', 'connecting');
  logDebug(`Voice connection interrupted (${reason}). Reconnect attempt ${state.reconnectAttempts}.`);
  state.reconnectTimer = window.setTimeout(async () => {
    state.reconnectTimer = null;
    await stopVoice(false);
    await startVoice();
  }, 1200 * state.reconnectAttempts);
}

function pulseSpeaking(duration = 1600) {
  document.body.classList.add('is-speaking');
  window.clearTimeout(state.speechTimeout);
  state.speechTimeout = window.setTimeout(() => {
    document.body.classList.remove('is-speaking');
  }, duration);
}

function getSessionMode() {
  const mode = els.sessionMode.value || 'companion';
  localStorage.setItem('mira:sessionMode', mode);
  document.body.dataset.mode = mode;
  return mode;
}

function clearGeminiSetupTimer() {
  window.clearTimeout(state.geminiSetupTimer);
  state.geminiSetupTimer = null;
}

function startGeminiSetupTimer() {
  clearGeminiSetupTimer();
  state.geminiSetupTimer = window.setTimeout(() => {
    if (state.provider !== 'gemini' || state.stopping) return;
    addTurn('error', 'Gemini Live opened a socket but did not finish setup. Check Live API access, model availability, and browser console close details.');
    setStatus('Error', 'error');
    if (state.ws) state.ws.close();
    stopVoice(false).catch((err) => logDebug(err.message));
  }, 15000);
}

function formatCloseEvent(event) {
  const reason = event.reason ? `: ${event.reason}` : '';
  return `Gemini Live connection closed before setup completed. Code ${event.code}${reason}`;
}

function addTurn(role, text) {
  const node = document.createElement('div');
  node.className = `turn ${role}`;
  node.innerHTML = `<span class="role">${role}</span>${escapeHtml(text)}`;
  els.transcript.appendChild(node);
  els.transcript.scrollTop = els.transcript.scrollHeight;

  if (role === 'assistant') {
    pulseSpeaking(2200);
  } else if (role === 'user') {
    pulseSpeaking(900);
  }
}

function logDebug(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  els.debugPanel.textContent = `${text}\n\n${els.debugPanel.textContent}`.slice(0, 12000);
}

function shouldLogGeminiEvent(event) {
  if (!event || typeof event !== 'object') return true;
  if (event.error || event.goAway) return true;
  if (event.setupComplete) return true;
  if (event.serverContent?.interrupted) return true;
  return false;
}

function logGeminiEvent(event) {
  if (!shouldLogGeminiEvent(event)) return;
  logDebug(event);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function parseSocketJson(data) {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }

  if (data instanceof Blob) {
    return JSON.parse(await data.text());
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data));
  }

  if (ArrayBuffer.isView(data)) {
    return JSON.parse(new TextDecoder().decode(data));
  }

  throw new Error(`Unsupported WebSocket message type: ${Object.prototype.toString.call(data)}`);
}

function downsampleBuffer(input, inputRate, outputRate) {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let total = 0;
    for (let j = start; j < end; j += 1) total += input[j];
    output[i] = total / Math.max(1, end - start);
  }

  return output;
}

function float32ToPcm16(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

function renderWaveform(level, data) {
  const bars = Array.from(els.waveformBars || []);
  if (!bars.length) return;

  const time = performance.now() / 1000;
  const live = document.body.classList.contains('is-live') || document.body.classList.contains('is-speaking');
  const energy = live ? Math.max(level, 0.18) : Math.max(level, 0.05);
  document.documentElement.style.setProperty('--voice-level', energy.toFixed(3));

  bars.forEach((bar, index) => {
    const sample = data?.length ? data[(index * 9) % data.length] / 255 : 0;
    const drift = (Math.sin(time * (1.7 + index * 0.08) + index * 0.9) + 1) / 2;
    const height = 0.28 + Math.min(2.8, energy * 2.5 + sample * 1.9 + drift * (live ? 0.52 : 0.18));
    bar.style.transform = `scaleY(${height.toFixed(3)})`;
    bar.style.opacity = String(Math.min(1, 0.38 + energy + sample + drift * 0.22));
  });
}

function animateVisualizer() {
  let level = 0;
  let data = null;

  if (state.visualizerAnalyser && state.visualizerData) {
    state.visualizerAnalyser.getByteFrequencyData(state.visualizerData);
    data = state.visualizerData;
    let total = 0;
    for (const value of data) total += value;
    level = Math.min(1, (total / data.length / 255) * 2.8);
  }

  renderWaveform(level, data);
  state.visualizerFrame = window.requestAnimationFrame(animateVisualizer);
}

function ensureVisualizerLoop() {
  if (!state.visualizerFrame) {
    state.visualizerFrame = window.requestAnimationFrame(animateVisualizer);
  }
}

async function stopVoiceMeter() {
  if (state.visualizerSource) {
    try {
      state.visualizerSource.disconnect();
    } catch (_err) {
      // Already-disconnected audio nodes are harmless.
    }
  }

  if (state.visualizerContext && state.visualizerContext.state !== 'closed') {
    await state.visualizerContext.close();
  }

  state.visualizerContext = null;
  state.visualizerSource = null;
  state.visualizerAnalyser = null;
  state.visualizerData = null;
}

async function startVoiceMeter(stream) {
  await stopVoiceMeter();

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor || !stream) return;

    state.visualizerContext = new AudioContextCtor();
    state.visualizerSource = state.visualizerContext.createMediaStreamSource(stream);
    state.visualizerAnalyser = state.visualizerContext.createAnalyser();
    state.visualizerAnalyser.fftSize = 256;
    state.visualizerAnalyser.smoothingTimeConstant = 0.78;
    state.visualizerData = new Uint8Array(state.visualizerAnalyser.frequencyBinCount);
    state.visualizerSource.connect(state.visualizerAnalyser);
    ensureVisualizerLoop();
  } catch (err) {
    logDebug(`Visualizer unavailable: ${err.message}`);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

async function loadHealth() {
  const data = await api('/api/health');
  const savedProvider = localStorage.getItem('mira:provider');
  if (!savedProvider && data.realtimeProvider && els.provider.querySelector(`option[value="${data.realtimeProvider}"]`)) {
    els.provider.value = data.realtimeProvider;
  }
  els.providerStatus.textContent = els.provider.value;
}

function getUserId() {
  const userId = normalizeUserId(els.userId.value);
  els.userId.value = userId;
  localStorage.setItem('mira:userId', userId);
  return userId;
}

function getUserProfile() {
  const displayName = String(els.displayName.value || '').trim();
  const location = String(els.location.value || '').trim();
  els.displayName.value = displayName;
  els.location.value = location;
  if (displayName) {
    localStorage.setItem('mira:displayName', displayName);
  } else {
    localStorage.removeItem('mira:displayName');
  }
  if (location) {
    localStorage.setItem('mira:location', location);
  } else {
    localStorage.removeItem('mira:location');
  }

  return {
    displayName,
    location,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionMode: getSessionMode(),
  };
}

async function saveTurn(role, content, event) {
  const clean = String(content || '').trim();
  if (!clean || !state.sessionId) return;

  const eventId = event.event_id || event.item_id || event.response?.id || `${role}:${clean}`;
  const key = `${role}:${eventId}:${clean}`;
  if (state.sentTurns.has(key)) return;
  state.sentTurns.add(key);

  addTurn(role, clean);

  await api('/api/conversation/events', {
    method: 'POST',
    body: JSON.stringify({
      userId: getUserId(),
      sessionId: state.sessionId,
      events: [{
        role,
        content: clean,
        provider: els.provider.value,
        model: event.response?.model,
        providerEventId: eventId,
        providerEventType: event.type,
        usage: event.response?.usage,
        metadata: { rawType: event.type },
      }],
    }),
  });
}

function extractResponseTexts(event) {
  const texts = [];
  for (const item of event.response?.output || []) {
    for (const content of item.content || []) {
      if (content.transcript) texts.push(content.transcript);
      if (content.text) texts.push(content.text);
    }
  }
  return texts;
}

function sendRealtimeEvent(event) {
  if (!state.dc || state.dc.readyState !== 'open') return false;
  state.dc.send(JSON.stringify(event));
  return true;
}

function getFunctionCalls(event) {
  return (event.response?.output || []).filter((item) => item.type === 'function_call');
}

function parseFunctionArguments(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_err) {
    return {};
  }
}

async function runRealtimeFunctionCall(functionCall) {
  if (!functionCall?.call_id || state.handledFunctionCalls.has(functionCall.call_id)) return;
  state.handledFunctionCalls.add(functionCall.call_id);

  let output;
  try {
    if (functionCall.name !== 'web_research') {
      throw new Error(`Unsupported function: ${functionCall.name}`);
    }

    const args = parseFunctionArguments(functionCall.arguments);
    setStatus('Searching the web', 'live');
    output = await api('/api/tools/web-research', {
      method: 'POST',
      body: JSON.stringify({ query: args.query }),
    });
  } catch (err) {
    output = { error: err.message || 'The web research tool failed.' };
  }

  const sent = sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: functionCall.call_id,
      output: JSON.stringify(output),
    },
  });

  if (sent) sendRealtimeEvent({ type: 'response.create' });
}

async function handleRealtimeEvent(event) {
  logDebug(event);

  if (event.type === 'input_audio_buffer.speech_started') {
    setStatus('Listening', 'live');
    document.body.classList.remove('is-speaking');
  }
  if (event.type === 'input_audio_buffer.speech_stopped') setStatus('Thinking', 'live');
  if (event.type === 'response.created') setStatus('Responding', 'live');
  if (event.type === 'response.output_audio.delta') {
    setStatus('Mira is speaking', 'live');
    pulseSpeaking(700);
  }

  if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
    await saveTurn('assistant', event.transcript, event);
  }

  if (event.type === 'response.output_text.done' && event.text) {
    await saveTurn('assistant', event.text, event);
  }

  if (
    (event.type === 'conversation.item.input_audio_transcription.completed' ||
      event.type === 'conversation.item.input_audio_transcription.done') &&
    event.transcript
  ) {
    await saveTurn('user', event.transcript, event);
  }

  if (event.type === 'conversation.item.done' && event.item?.role === 'user') {
    for (const content of event.item.content || []) {
      if (content.transcript || content.text) {
        await saveTurn('user', content.transcript || content.text, event);
      }
    }
  }

  if (event.type === 'response.done') {
    const functionCalls = getFunctionCalls(event);
    if (functionCalls.length) {
      await Promise.all(functionCalls.map(runRealtimeFunctionCall));
    }

    for (const text of extractResponseTexts(event)) {
      await saveTurn('assistant', text, event);
    }

    if (event.response?.usage) {
      await api('/api/conversation/events', {
        method: 'POST',
        body: JSON.stringify({
          userId: getUserId(),
          sessionId: state.sessionId,
          events: [{
            provider: els.provider.value,
            model: event.response.model,
            providerEventType: event.type,
            usage: event.response.usage,
          }],
        }),
      });
    }
  }
}

function setupGeminiMicCapture() {
  const sampleRate = state.audioContext.sampleRate;
  state.micSource = state.audioContext.createMediaStreamSource(state.localStream);
  state.processor = state.audioContext.createScriptProcessor(2048, 1, 1);

  state.processor.onaudioprocess = (event) => {
    const output = event.outputBuffer.getChannelData(0);
    output.fill(0);

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleBuffer(input, sampleRate, 16000);
    const pcm = float32ToPcm16(downsampled);

    state.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: arrayBufferToBase64(pcm),
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    }));
  };

  state.micSource.connect(state.processor);
  state.processor.connect(state.audioContext.destination);
}

function playGeminiAudio(base64Audio, sampleRate = 24000) {
  if (!base64Audio || !state.audioContext) return;

  const pcm = new Int16Array(base64ToArrayBuffer(base64Audio));
  const float32 = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    float32[i] = pcm[i] / 0x8000;
  }

  const buffer = state.audioContext.createBuffer(1, float32.length, sampleRate);
  buffer.copyToChannel(float32, 0);

  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioContext.destination);

  const startAt = Math.max(state.audioContext.currentTime, state.playbackTime);
  source.start(startAt);
  state.playbackTime = startAt + buffer.duration;
  state.playbackSources.push(source);
  source.onended = () => {
    state.playbackSources = state.playbackSources.filter((item) => item !== source);
  };
}

function stopGeminiPlayback() {
  for (const source of state.playbackSources) {
    try {
      source.stop();
    } catch (_err) {
      // Sources that already ended can be ignored.
    }
  }
  state.playbackSources = [];
  if (state.audioContext) state.playbackTime = state.audioContext.currentTime;
}

async function flushGeminiTranscripts(event) {
  const userText = state.geminiUserTranscript.trim();
  const assistantText = state.geminiAssistantTranscript.trim();
  state.geminiUserTranscript = '';
  state.geminiAssistantTranscript = '';

  if (userText) await saveTurn('user', userText, event);
  if (assistantText) await saveTurn('assistant', assistantText, event);
}

async function handleGeminiEvent(event) {
  logGeminiEvent(event);

  if (event.setupComplete) {
    clearGeminiSetupTimer();
    state.connectionLatencyMs = Math.round(performance.now() - state.sessionStartedAt);
    setStatus('Live', 'live');
    if (!state.processor && state.localStream && state.audioContext) {
      setupGeminiMicCapture();
      els.stopButton.disabled = false;
      await refreshMemories();
    }
  }

  const resumption = event.sessionResumptionUpdate || event.session_resumption_update;
  if (resumption?.resumable && (resumption.newHandle || resumption.new_handle)) {
    state.geminiResumeHandle = resumption.newHandle || resumption.new_handle;
  }

  if (event.goAway) {
    logDebug(`Gemini requested a connection handoff with ${event.goAway.timeLeft || 'limited time'} remaining.`);
    scheduleReconnect('Gemini connection handoff');
  }

  const serverContent = event.serverContent || {};
  const inputText = serverContent.inputTranscription?.text || serverContent.input_transcription?.text;
  const outputText = serverContent.outputTranscription?.text || serverContent.output_transcription?.text;

  if (inputText) state.geminiUserTranscript += inputText;
  if (outputText) state.geminiAssistantTranscript += outputText;

  for (const part of serverContent.modelTurn?.parts || []) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data && String(inlineData.mimeType || inlineData.mime_type || '').startsWith('audio/')) {
      playGeminiAudio(inlineData.data);
      pulseSpeaking(900);
    }
  }

  if (serverContent.interrupted) {
    stopGeminiPlayback();
  }

  if (serverContent.turnComplete || serverContent.generationComplete) {
    await flushGeminiTranscripts(event);
  }

  if (event.usageMetadata && state.sessionId) {
    await api('/api/conversation/events', {
      method: 'POST',
      body: JSON.stringify({
        userId: getUserId(),
        sessionId: state.sessionId,
        events: [{
          provider: 'gemini',
          model: event.model,
          providerEventType: 'usageMetadata',
          usage: event.usageMetadata,
        }],
      }),
    });
  }
}

async function startGeminiVoice() {
  try {
    setStatus('Connecting');
    setSessionControlsDisabled(true);
    els.providerStatus.textContent = 'gemini';
    state.provider = 'gemini';

    state.sessionStartedAt = performance.now();
    state.audioContext = new AudioContext({ latencyHint: 'interactive' });
    state.localStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    await startVoiceMeter(state.localStream);

    const session = await api('/api/realtime/gemini/session', {
      method: 'POST',
      body: JSON.stringify({
        userId: getUserId(),
        ...getUserProfile(),
        resumeHandle: state.geminiResumeHandle,
      }),
    });

    state.sessionId = session.sessionId;
    state.ws = new WebSocket(session.wsUrl);

    state.ws.addEventListener('open', async () => {
      state.ws.send(JSON.stringify(session.setup));
      els.stopButton.disabled = false;
      startGeminiSetupTimer();
    });

    state.ws.addEventListener('message', (message) => {
      try {
        parseSocketJson(message.data)
          .then((event) => handleGeminiEvent(event))
          .catch((err) => logDebug(err.message));
      } catch (err) {
        logDebug(err.message);
      }
    });

    state.ws.addEventListener('error', () => {
      if (state.reconnectTimer) return;
      clearGeminiSetupTimer();
      addTurn('error', 'Gemini Live connection failed.');
      setStatus('Error', 'error');
      stopVoice(false).catch((err) => logDebug(err.message));
    });

    state.ws.addEventListener('close', (event) => {
      clearGeminiSetupTimer();
      if (state.stopping || !state.sessionId) return;
      if (state.reconnectTimer) return;
      if (!document.body.classList.contains('is-live')) {
        addTurn('error', formatCloseEvent(event));
        setStatus('Error', 'error');
        stopVoice(false).catch((err) => logDebug(err.message));
      } else {
        scheduleReconnect(`Gemini socket closed with code ${event.code}`);
      }
    });
  } catch (err) {
    clearGeminiSetupTimer();
    addTurn('error', err.message);
    setStatus('Error', 'error');
    await stopVoice(false);
  }
}

async function startOpenAIVoice() {
  try {
    setStatus('Connecting');
    setSessionControlsDisabled(true);
    els.providerStatus.textContent = els.provider.value;
    state.provider = 'openai';

    state.pc = new RTCPeerConnection();
    const activePc = state.pc;
    state.sessionStartedAt = performance.now();
    state.pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
    };

    state.pc.addEventListener('connectionstatechange', () => {
      if (state.pc !== activePc || state.stopping) return;
      if (activePc.connectionState === 'connected') {
        state.connectionLatencyMs = Math.round(performance.now() - state.sessionStartedAt);
        state.reconnectAttempts = 0;
        logDebug(`Voice connected in ${state.connectionLatencyMs}ms.`);
      } else if (activePc.connectionState === 'failed') {
        scheduleReconnect('WebRTC failed');
      }
    });

    state.localStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    await startVoiceMeter(state.localStream);
    state.localStream.getTracks().forEach((track) => state.pc.addTrack(track, state.localStream));

    state.dc = state.pc.createDataChannel('oai-events');
    state.dc.addEventListener('open', () => setStatus('Live', 'live'));
    state.dc.addEventListener('message', (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data)).catch((err) => logDebug(err.message));
      } catch (err) {
        logDebug(err.message);
      }
    });

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);

    const session = await api('/api/realtime/session', {
      method: 'POST',
      body: JSON.stringify({
        userId: getUserId(),
        ...getUserProfile(),
        provider: els.provider.value,
        sdpOffer: offer.sdp,
      }),
    });

    state.sessionId = session.sessionId;
    await state.pc.setRemoteDescription({ type: 'answer', sdp: session.sdpAnswer });
    els.stopButton.disabled = false;
    await refreshMemories();
  } catch (err) {
    addTurn('error', err.message);
    setStatus('Error', 'error');
    await stopVoice(false);
  }
}

async function startVoice() {
  if (els.provider.value === 'gemini') {
    await startGeminiVoice();
    return;
  }

  await startOpenAIVoice();
}

async function stopVoice(endSession = true) {
  state.stopping = true;
  clearReconnectTimer();
  clearGeminiSetupTimer();
  els.stopButton.disabled = true;

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    state.ws.close();
  } else if (state.ws) {
    state.ws.close();
  }

  if (state.dc) state.dc.close();
  if (state.pc) state.pc.close();
  if (state.processor) state.processor.disconnect();
  if (state.micSource) state.micSource.disconnect();
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
  }
  await stopVoiceMeter();
  stopGeminiPlayback();

  if (endSession && state.sessionId) {
    try {
      setStatus('Saving');
      await api(`/api/conversation/${state.sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify({
          userId: getUserId(),
          metrics: {
            connectionLatencyMs: state.connectionLatencyMs,
            reconnectAttempts: state.reconnectCount,
          },
        }),
      });
      await refreshMemories();
    } catch (err) {
      addTurn('error', err.message);
    }
  }

  state.pc = null;
  state.dc = null;
  state.ws = null;
  state.processor = null;
  state.micSource = null;
  state.localStream = null;
  if (state.audioContext && state.audioContext.state !== 'closed') {
    await state.audioContext.close();
  }
  state.audioContext = null;
  state.sessionId = null;
  state.handledFunctionCalls.clear();
  state.connectionLatencyMs = null;
  state.provider = null;
  state.sentTurns.clear();
  state.geminiUserTranscript = '';
  state.geminiAssistantTranscript = '';
  state.stopping = false;
  if (endSession) state.reconnectAttempts = 0;
  if (endSession) state.reconnectCount = 0;
  if (endSession) state.geminiResumeHandle = null;
  setSessionControlsDisabled(false);
  if (els.status.textContent !== 'Error') {
    setStatus('Idle');
  }
}

window.addEventListener('offline', () => {
  if (state.sessionId) setStatus('Waiting for network', 'connecting');
});

window.addEventListener('online', () => {
  if (state.sessionId) scheduleReconnect('network restored');
});

async function refreshMemories() {
  const data = await api(`/api/memory?userId=${encodeURIComponent(getUserId())}`);
  els.memoryList.innerHTML = '';

  if (!data.memories.length) {
    els.memoryList.innerHTML = '<div class="memoryItem"><div class="memoryText">No memories yet.</div></div>';
    return;
  }

  for (const memory of data.memories) {
    const item = document.createElement('div');
    item.className = 'memoryItem';
    const expiry = memory.expiresAt ? ` · until ${new Date(memory.expiresAt).toLocaleDateString()}` : '';
    const reinforced = memory.reinforcementCount > 1 ? ` · noticed ${memory.reinforcementCount}×` : '';
    item.innerHTML = `
      <div class="memoryMeta">${escapeHtml(memory.category)} · ${escapeHtml(memory.lifespan || 'durable')}${expiry}${reinforced}${memory.isSensitive ? ' · sensitive' : ''}</div>
      <div class="memoryText">${escapeHtml(memory.content)}</div>
      <details class="memoryReason"><summary>Why is this here?</summary><p>${escapeHtml(memory.reason || 'Useful for continuity in future conversations.')}</p></details>
      <div class="memoryActions"><button type="button" data-action="edit">Correct</button> <button type="button" data-action="lifespan">${memory.lifespan === 'temporary' ? 'Keep' : 'Make temporary'}</button> <button type="button" data-action="delete">Forget</button></div>
    `;
    item.querySelector('[data-action="edit"]').addEventListener('click', async () => {
      const content = window.prompt('Correct what Mira should remember:', memory.content);
      if (content === null || !content.trim() || content.trim() === memory.content) return;
      await api(`/api/memory/${memory.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: getUserId(), content: content.trim() }),
      });
      await refreshMemories();
    });
    item.querySelector('[data-action="lifespan"]').addEventListener('click', async () => {
      await api(`/api/memory/${memory.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          userId: getUserId(),
          lifespan: memory.lifespan === 'temporary' ? 'durable' : 'temporary',
          expiresInDays: 7,
        }),
      });
      await refreshMemories();
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await api(`/api/memory/${memory.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: getUserId() }),
      });
      await refreshMemories();
    });
    els.memoryList.appendChild(item);
  }
}

async function forgetText() {
  const text = els.forgetText.value.trim();
  if (!text) return;

  await api('/api/memory/forget', {
    method: 'POST',
    body: JSON.stringify({ userId: getUserId(), text }),
  });
  els.forgetText.value = '';
  await refreshMemories();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('Could not read file.')));
    reader.readAsDataURL(file);
  });
}

function renderKnowledgeAssets(assets) {
  if (!els.knowledgeList) return;
  els.knowledgeList.innerHTML = '';

  if (!assets.length) {
    els.knowledgeList.innerHTML = '<div class="knowledgeItem"><div class="knowledgeText">No uploads yet.</div></div>';
    return;
  }

  for (const asset of assets) {
    const item = document.createElement('div');
    item.className = 'knowledgeItem';
    const preview = String(asset.content || '');
    item.innerHTML = `
      <div class="knowledgeMeta">${escapeHtml(asset.kind)} · ${escapeHtml(asset.mimeType || 'text')}</div>
      <div class="knowledgeTitle">${escapeHtml(asset.name)}</div>
      <div class="knowledgeText">${escapeHtml(preview.slice(0, 220))}${preview.length > 220 ? '…' : ''}</div>
      <button type="button" data-action="delete">Remove</button>
    `;
    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await api(`/api/knowledge/${asset.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId: getUserId() }),
      });
      await refreshKnowledge();
    });
    els.knowledgeList.appendChild(item);
  }
}

async function refreshKnowledge() {
  if (!els.knowledgeList) return;
  const data = await api(`/api/knowledge?userId=${encodeURIComponent(getUserId())}`);
  renderKnowledgeAssets(data.assets || []);
}

async function uploadKnowledgeFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  setStatus('Reading uploads', 'connecting');
  try {
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const payload = {
        userId: getUserId(),
        name: file.name,
        kind: isImage ? 'photo' : 'document',
        mimeType: file.type || 'text/plain',
      };

      if (isImage) {
        payload.imageDataUrl = await fileToDataUrl(file);
      } else {
        payload.textContent = await file.text();
      }

      await api('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    showPreferencesSaved(`${files.length} upload${files.length === 1 ? '' : 's'} added to Mira.`);
    await refreshKnowledge();
    setStatus('Idle');
  } catch (err) {
    addTurn('error', err.message);
    setStatus('Error', 'error');
  } finally {
    event.target.value = '';
  }
}

els.startButton.addEventListener('click', startVoice);
els.stopButton.addEventListener('click', () => stopVoice(true));
els.refreshMemoryButton.addEventListener('click', refreshMemories);
els.forgetButton.addEventListener('click', forgetText);
if (els.knowledgeFileInput) els.knowledgeFileInput.addEventListener('change', uploadKnowledgeFiles);
if (els.refreshKnowledgeButton) els.refreshKnowledgeButton.addEventListener('click', refreshKnowledge);
els.clearDebugButton.addEventListener('click', () => {
  els.debugPanel.textContent = '';
});
els.sessionMode.addEventListener('change', getSessionMode);
els.sessionMode.addEventListener('change', () => showPreferencesSaved('Conversation mood saved.'));
els.provider.addEventListener('change', () => {
  localStorage.setItem('mira:provider', els.provider.value);
  els.providerStatus.textContent = els.provider.value;
  showPreferencesSaved('Voice engine saved.');
});
els.displayName.addEventListener('input', () => {
  const value = els.displayName.value.trim();
  if (value) localStorage.setItem('mira:displayName', value);
  else localStorage.removeItem('mira:displayName');
  showPreferencesSaved();
});
els.location.addEventListener('input', () => {
  const value = els.location.value.trim();
  if (value) localStorage.setItem('mira:location', value);
  else localStorage.removeItem('mira:location');
  showPreferencesSaved();
});
els.toggleDebugButton.addEventListener('click', () => {
  const isOpen = els.debugDrawer.classList.toggle('is-open');
  els.toggleDebugButton.setAttribute('aria-expanded', String(isOpen));
});

ensureVisualizerLoop();
setTimeGreeting();
loadHealth().catch((err) => logDebug(err.message));
refreshMemories().catch((err) => logDebug(err.message));
refreshKnowledge().catch((err) => logDebug(err.message));
