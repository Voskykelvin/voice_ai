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
  geminiUserTranscript: '',
  geminiAssistantTranscript: '',
  visualizerContext: null,
  visualizerSource: null,
  visualizerAnalyser: null,
  visualizerData: null,
  visualizerFrame: null,
  speechTimeout: null,
};

const els = {
  userId: document.getElementById('userId'),
  provider: document.getElementById('provider'),
  startButton: document.getElementById('startButton'),
  stopButton: document.getElementById('stopButton'),
  status: document.getElementById('connectionStatus'),
  providerStatus: document.getElementById('providerStatus'),
  transcript: document.getElementById('transcript'),
  remoteAudio: document.getElementById('remoteAudio'),
  memoryList: document.getElementById('memoryList'),
  debugPanel: document.getElementById('debugPanel'),
  forgetText: document.getElementById('forgetText'),
  forgetButton: document.getElementById('forgetButton'),
  refreshMemoryButton: document.getElementById('refreshMemoryButton'),
  clearDebugButton: document.getElementById('clearDebugButton'),
  stageState: document.getElementById('stageState'),
  waveformBars: document.querySelectorAll('.waveform span'),
};

function normalizeUserId(value) {
  return String(value || '').trim() || 'local-user';
}

els.userId.value = normalizeUserId(localStorage.getItem('mira:userId'));

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

  if (!els.stageState) return;

  const labels = {
    idle: 'Standby',
    connecting: 'Opening channel',
    live: 'Voice link live',
    saving: 'Saving memory',
    error: 'Signal fault',
  };
  els.stageState.textContent = labels[visualMode];
}

function setStatus(text, mode = 'idle') {
  const statusMode = normalizeStatusMode(text, mode);
  els.status.textContent = text;
  els.status.className = `status ${statusMode}`;
  setVisualMode(statusMode);
}

function pulseSpeaking(duration = 1600) {
  document.body.classList.add('is-speaking');
  window.clearTimeout(state.speechTimeout);
  state.speechTimeout = window.setTimeout(() => {
    document.body.classList.remove('is-speaking');
  }, duration);
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
  if (data.realtimeProvider && els.provider.querySelector(`option[value="${data.realtimeProvider}"]`)) {
    els.provider.value = data.realtimeProvider;
    els.providerStatus.textContent = data.realtimeProvider;
  }
}

function getUserId() {
  const userId = normalizeUserId(els.userId.value);
  els.userId.value = userId;
  localStorage.setItem('mira:userId', userId);
  return userId;
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

async function handleRealtimeEvent(event) {
  logDebug(event);

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
  state.processor = state.audioContext.createScriptProcessor(4096, 1, 1);

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
  logDebug(event);

  if (event.setupComplete) {
    setStatus('Live', 'live');
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
    els.startButton.disabled = true;
    els.provider.disabled = true;
    els.userId.disabled = true;
    els.providerStatus.textContent = 'gemini';
    state.provider = 'gemini';

    state.audioContext = new AudioContext();
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await startVoiceMeter(state.localStream);

    const session = await api('/api/realtime/gemini/session', {
      method: 'POST',
      body: JSON.stringify({
        userId: getUserId(),
      }),
    });

    state.sessionId = session.sessionId;
    state.ws = new WebSocket(session.wsUrl);

    state.ws.addEventListener('open', async () => {
      state.ws.send(JSON.stringify(session.setup));
      setupGeminiMicCapture();
      els.stopButton.disabled = false;
      await refreshMemories();
    });

    state.ws.addEventListener('message', (message) => {
      try {
        handleGeminiEvent(JSON.parse(message.data)).catch((err) => logDebug(err.message));
      } catch (err) {
        logDebug(err.message);
      }
    });

    state.ws.addEventListener('error', () => {
      addTurn('error', 'Gemini Live connection failed.');
      setStatus('Error', 'error');
    });
  } catch (err) {
    addTurn('error', err.message);
    setStatus('Error', 'error');
    await stopVoice(false);
  }
}

async function startOpenAIVoice() {
  try {
    setStatus('Connecting');
    els.startButton.disabled = true;
    els.provider.disabled = true;
    els.userId.disabled = true;
    els.providerStatus.textContent = els.provider.value;
    state.provider = 'openai';

    state.pc = new RTCPeerConnection();
    state.pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        body: JSON.stringify({ userId: getUserId() }),
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
  state.provider = null;
  state.sentTurns.clear();
  state.geminiUserTranscript = '';
  state.geminiAssistantTranscript = '';
  els.startButton.disabled = false;
  els.provider.disabled = false;
  els.userId.disabled = false;
  setStatus('Idle');
}

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
    item.innerHTML = `
      <div class="memoryMeta">${escapeHtml(memory.category)} | importance ${memory.importance}${memory.isSensitive ? ' | sensitive' : ''}</div>
      <div class="memoryText">${escapeHtml(memory.content)}</div>
      <button type="button" data-id="${memory.id}">Delete</button>
    `;
    item.querySelector('button').addEventListener('click', async () => {
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

els.startButton.addEventListener('click', startVoice);
els.stopButton.addEventListener('click', () => stopVoice(true));
els.refreshMemoryButton.addEventListener('click', refreshMemories);
els.forgetButton.addEventListener('click', forgetText);
els.clearDebugButton.addEventListener('click', () => {
  els.debugPanel.textContent = '';
});

ensureVisualizerLoop();
loadHealth().catch((err) => logDebug(err.message));
refreshMemories().catch((err) => logDebug(err.message));
