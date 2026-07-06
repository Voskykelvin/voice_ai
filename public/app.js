const state = {
  pc: null,
  dc: null,
  localStream: null,
  sessionId: null,
  sentTurns: new Set(),
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
};

els.userId.value = localStorage.getItem('mira:userId') || 'local-user';

function setStatus(text, mode = 'idle') {
  els.status.textContent = text;
  els.status.className = `status ${mode}`;
}

function addTurn(role, text) {
  const node = document.createElement('div');
  node.className = `turn ${role}`;
  node.innerHTML = `<span class="role">${role}</span>${escapeHtml(text)}`;
  els.transcript.appendChild(node);
  els.transcript.scrollTop = els.transcript.scrollHeight;
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

function getUserId() {
  const userId = els.userId.value.trim();
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

async function startVoice() {
  try {
    setStatus('Connecting');
    els.startButton.disabled = true;
    els.provider.disabled = true;
    els.userId.disabled = true;
    els.providerStatus.textContent = els.provider.value;

    state.pc = new RTCPeerConnection();
    state.pc.ontrack = (event) => {
      els.remoteAudio.srcObject = event.streams[0];
    };

    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

async function stopVoice(endSession = true) {
  els.stopButton.disabled = true;

  if (state.dc) state.dc.close();
  if (state.pc) state.pc.close();
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
  }

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
  state.localStream = null;
  state.sessionId = null;
  state.sentTurns.clear();
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

refreshMemories().catch((err) => logDebug(err.message));
