const STORAGE_KEY = 'fyrians_flashcards_v1';

const appEl = document.getElementById('flashcards-app');
if (!appEl) {
    throw new Error('Missing flashcards root element.');
}

const page = appEl.dataset.page || 'decks';
const routeDeckId = appEl.dataset.deckId || '';
const homeUrl = appEl.dataset.homeUrl || '/flashcards';
const deckUrlTemplate = appEl.dataset.deckUrlTemplate || '/flashcards/decks/__DECK_ID__';

const newDeckNameInput = document.getElementById('new-deck-name');
const createDeckBtn = document.getElementById('create-deck-btn');
const decksListEl = document.getElementById('decks-list');

const deckSelect = document.getElementById('deck-select');
const deleteDeckBtn = document.getElementById('delete-deck-btn');
const deckTitleEl = document.getElementById('deck-title');

const statusEl = document.getElementById('flashcards-status');
const studyCardEl = document.getElementById('study-card');
const studyCardSideEl = document.getElementById('study-card-side');
const studyCardAudioEl = document.getElementById('study-card-audio');
const studyCardMetaEl = document.getElementById('study-card-meta');
const prevCardBtn = document.getElementById('prev-card-btn');
const nextCardBtn = document.getElementById('next-card-btn');
const cardCounterEl = document.getElementById('card-counter');
const shuffleBtn = document.getElementById('shuffle-btn');
const editCardBtn = document.getElementById('edit-card-btn');
const deleteCardBtn = document.getElementById('delete-card-btn');

const addNewCardBtn = document.getElementById('add-new-card-btn');
const newCardEditor = document.getElementById('new-card-editor');
const newCardEditorTitle = document.getElementById('new-card-editor-title');
const newCardFront = document.getElementById('new-card-front');
const newCardBack = document.getElementById('new-card-back');
const recordFrontAudioBtn = document.getElementById('record-front-audio-btn');
const clearFrontAudioBtn = document.getElementById('clear-front-audio-btn');
const frontAudioPreview = document.getElementById('new-card-front-audio-preview');
const recordBackAudioBtn = document.getElementById('record-back-audio-btn');
const clearBackAudioBtn = document.getElementById('clear-back-audio-btn');
const backAudioPreview = document.getElementById('new-card-back-audio-preview');
const saveNewCardBtn = document.getElementById('save-new-card-btn');
const cancelNewCardBtn = document.getElementById('cancel-new-card-btn');
const audioRecordModal = document.getElementById('audio-record-modal');
const audioRecordTitle = document.getElementById('audio-record-title');
const audioRecordStatus = document.getElementById('audio-record-status');
const audioRecordWaveform = document.getElementById('audio-record-waveform');
const audioRecordPlayback = document.getElementById('audio-record-playback');
const audioRecordStartBtn = document.getElementById('audio-record-start-btn');
const audioRecordStopBtn = document.getElementById('audio-record-stop-btn');
const audioRecordUseBtn = document.getElementById('audio-record-use-btn');
const audioRecordCancelBtn = document.getElementById('audio-record-cancel-btn');

let editorMode = 'add';
let editingCardId = null;
let workingAudio = { front: '', back: '' };
let activeRecorder = null;
let activeRecorderSide = null;
let activeRecorderStream = null;
let activeRecorderChunks = [];
let discardActiveRecording = false;
let waveformAudioContext = null;
let waveformAnalyser = null;
let waveformSource = null;
let waveformFrame = 0;
let captureProcessor = null;
let captureSilenceGain = null;
let captureBuffers = [];
let captureSampleRate = 44100;
let captureHasSignal = false;
let lastCaptureLevelUpdate = 0;
let modalRecordingSide = null;
let modalRecordedAudio = '';
let lastRenderedAudioKey = '';

let state = loadState();

function defaultState() {
    return { decks: [], currentDeckId: null, currentCardIndex: 0, showingBack: false };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.decks)) return defaultState();

        return {
            decks: parsed.decks.map((deck) => ({
                id: String(deck.id),
                name: String(deck.name || 'Untitled Deck'),
                cards: Array.isArray(deck.cards)
                    ? deck.cards
                        .map((card) => ({
                            id: String(card.id),
                            front: String(card.front || '').trim(),
                            back: String(card.back || '').trim(),
                            frontAudio: typeof card.frontAudio === 'string' ? card.frontAudio : '',
                            backAudio: typeof card.backAudio === 'string' ? card.backAudio : ''
                        }))
                        .filter((card) => card.front && card.back)
                    : []
            })),
            currentDeckId: parsed.currentDeckId ? String(parsed.currentDeckId) : null,
            currentCardIndex: Number.isInteger(parsed.currentCardIndex) ? parsed.currentCardIndex : 0,
            showingBack: !!parsed.showingBack
        };
    } catch {
        return defaultState();
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function withEmbed(path) {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === '1' ? `${path}?embed=1` : path;
}

function deckUrlFor(deckId) {
    return withEmbed(deckUrlTemplate.replace('__DECK_ID__', encodeURIComponent(deckId)));
}

function homeUrlWithEmbed() {
    return withEmbed(homeUrl);
}

function findDeck(deckId) {
    return state.decks.find((deck) => deck.id === deckId) || null;
}

function currentDeck() {
    return findDeck(state.currentDeckId);
}

function currentCard() {
    const deck = currentDeck();
    if (!deck || !deck.cards.length) return null;
    return deck.cards[state.currentCardIndex] || null;
}

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

function ensureCurrentDeck(preferredDeckId) {
    if (!state.decks.length) {
        state.currentDeckId = null;
        state.currentCardIndex = 0;
        state.showingBack = false;
        return;
    }

    if (preferredDeckId && findDeck(preferredDeckId)) {
        state.currentDeckId = preferredDeckId;
    }

    if (!state.currentDeckId || !findDeck(state.currentDeckId)) {
        state.currentDeckId = state.decks[0].id;
    }

    const deck = currentDeck();
    if (!deck || !deck.cards.length) {
        state.currentCardIndex = 0;
        state.showingBack = false;
        return;
    }

    if (state.currentCardIndex < 0 || state.currentCardIndex >= deck.cards.length) {
        state.currentCardIndex = 0;
    }
}

function showNewCardEditor(show) {
    if (!newCardEditor) return;
    newCardEditor.classList.toggle('hidden', !show);
    if (show && newCardFront) {
        newCardFront.focus();
    }
    if (!show) {
        closeAudioRecordModal();
        resetEditorState();
    }
}

function resetEditorState() {
    editorMode = 'add';
    editingCardId = null;
    if (newCardEditorTitle) newCardEditorTitle.textContent = 'Add New Card';
    if (saveNewCardBtn) saveNewCardBtn.textContent = 'Save Card';
    if (newCardFront) newCardFront.value = '';
    if (newCardBack) newCardBack.value = '';
    workingAudio = { front: '', back: '' };
    refreshAudioPreviews();
}

function refreshAudioPreviews() {
    if (frontAudioPreview) {
        frontAudioPreview.src = workingAudio.front || '';
        frontAudioPreview.classList.toggle('hidden', !workingAudio.front);
    }
    if (backAudioPreview) {
        backAudioPreview.src = workingAudio.back || '';
        backAudioPreview.classList.toggle('hidden', !workingAudio.back);
    }
}

function stopRecorderAndReleaseStream(discard = false) {
    if (discard) discardActiveRecording = true;
    if (activeRecorder && activeRecorder.state !== 'inactive') {
        activeRecorder.stop();
        return;
    }
    if (activeRecorderStream) {
        activeRecorderStream.getTracks().forEach((track) => track.stop());
    }
    activeRecorder = null;
    activeRecorderSide = null;
    activeRecorderStream = null;
    activeRecorderChunks = [];
    discardActiveRecording = false;
    stopWaveform();
    refreshRecordButtons();
}

function stopWaveform() {
    if (waveformFrame) {
        cancelAnimationFrame(waveformFrame);
        waveformFrame = 0;
    }
    if (waveformSource) {
        waveformSource.disconnect();
        waveformSource = null;
    }
    if (waveformAnalyser) {
        waveformAnalyser.disconnect();
        waveformAnalyser = null;
    }
    if (captureProcessor) {
        captureProcessor.disconnect();
        captureProcessor.onaudioprocess = null;
        captureProcessor = null;
    }
    if (captureSilenceGain) {
        captureSilenceGain.disconnect();
        captureSilenceGain = null;
    }
    if (waveformAudioContext) {
        waveformAudioContext.close();
        waveformAudioContext = null;
    }
    drawWaveformIdle();
}

function mergeFloatBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    buffers.forEach((buffer) => {
        merged.set(buffer, offset);
        offset += buffer.length;
    });
    return merged;
}

function writeWavString(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
    }
}

function encodeMonoWav(buffers, sampleRate) {
    const samples = mergeFloatBuffers(buffers);
    const bytesPerSample = 2;
    const dataLength = samples.length * bytesPerSample;
    const wavBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(wavBuffer);

    writeWavString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeWavString(view, 8, 'WAVE');
    writeWavString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeWavString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let sampleOffset = 44;
    for (let i = 0; i < samples.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(sampleOffset, intSample, true);
        sampleOffset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

function cleanupRecordingState() {
    captureBuffers = [];
    captureSampleRate = 44100;
    captureHasSignal = false;
    lastCaptureLevelUpdate = 0;
    activeRecorder = null;
    activeRecorderSide = null;
    activeRecorderChunks = [];
    discardActiveRecording = false;
}

function finalizeAudioCapture() {
    const shouldDiscard = discardActiveRecording;
    const buffers = captureBuffers.slice();
    const sampleRate = captureSampleRate;
    const hadSignal = captureHasSignal;

    if (activeRecorderStream) {
        activeRecorderStream.getTracks().forEach((track) => track.stop());
    }
    activeRecorderStream = null;
    stopWaveform();
    cleanupRecordingState();
    refreshRecordButtons();

    if (shouldDiscard) return;

    if (!buffers.length) {
        const message = 'No audio frames were captured. Chrome mic stream appears empty.';
        setStatus(message);
        if (audioRecordStatus) audioRecordStatus.textContent = message;
        if (window.FyrianPopup && typeof window.FyrianPopup.alert === 'function') {
            window.FyrianPopup.alert(message, { title: 'Recording Error' });
        }
        return;
    }

    if (!hadSignal) {
        const message = 'Mic stream was captured, but signal stayed silent. Check Chrome input device.';
        setStatus(message);
        if (audioRecordStatus) audioRecordStatus.textContent = message;
        if (window.FyrianPopup && typeof window.FyrianPopup.alert === 'function') {
            window.FyrianPopup.alert(message, { title: 'No Input Signal' });
        }
        return;
    }

    const wavBlob = encodeMonoWav(buffers, sampleRate);
    if (!wavBlob.size) {
        const message = 'Recording produced an empty file. Check microphone settings and try again.';
        setStatus(message);
        if (audioRecordStatus) audioRecordStatus.textContent = message;
        return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
        modalRecordedAudio = typeof reader.result === 'string' ? reader.result : '';
        if (audioRecordPlayback && modalRecordedAudio) {
            audioRecordPlayback.src = modalRecordedAudio;
            audioRecordPlayback.classList.remove('hidden');
        }
        if (audioRecordStatus) {
            audioRecordStatus.textContent = hadSignal
                ? 'Recording ready. Review it, then use recording.'
                : 'Recording ready, but input looked silent. Review before using.';
        }
        refreshRecordButtons();
    };
    reader.readAsDataURL(wavBlob);
}

function prepareWaveformCanvas() {
    if (!audioRecordWaveform) return;
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(320, Math.floor(audioRecordWaveform.clientWidth * ratio));
    const height = Math.max(100, Math.floor(audioRecordWaveform.clientHeight * ratio));
    if (audioRecordWaveform.width !== width) {
        audioRecordWaveform.width = width;
    }
    if (audioRecordWaveform.height !== height) {
        audioRecordWaveform.height = height;
    }
}

function drawWaveformIdle() {
    if (!audioRecordWaveform) return;
    prepareWaveformCanvas();
    const ctx = audioRecordWaveform.getContext('2d');
    if (!ctx) return;
    const width = audioRecordWaveform.width;
    const height = audioRecordWaveform.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 16, 25, 0.82)';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(115, 185, 235, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.stroke();
}

function startWaveform(stream) {
    if (!audioRecordWaveform) return;
    stopWaveform();
    prepareWaveformCanvas();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        drawWaveformIdle();
        return;
    }

    waveformAudioContext = new AudioContextClass();
    if (waveformAudioContext.state === 'suspended') {
        waveformAudioContext.resume().catch(() => {});
    }
    waveformAnalyser = waveformAudioContext.createAnalyser();
    waveformAnalyser.fftSize = 1024;
    waveformAnalyser.smoothingTimeConstant = 0.8;
    waveformSource = waveformAudioContext.createMediaStreamSource(stream);
    waveformSource.connect(waveformAnalyser);

    const buffer = new Uint8Array(waveformAnalyser.fftSize);
    const ctx = audioRecordWaveform.getContext('2d');
    if (!ctx) return;
    const width = audioRecordWaveform.width;
    const height = audioRecordWaveform.height;

    const draw = () => {
        if (!waveformAnalyser) return;
        waveformAnalyser.getByteTimeDomainData(buffer);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(10, 16, 25, 0.82)';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = 'rgba(64, 128, 181, 0.26)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i += 1) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(115, 185, 235, 0.92)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < buffer.length; i += 1) {
            const x = (i / (buffer.length - 1)) * width;
            const y = (buffer[i] / 255) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        waveformFrame = requestAnimationFrame(draw);
    };

    draw();
}

function refreshRecordButtons() {
    const isRecording = !!(activeRecorder && activeRecorder.state === 'recording');
    const hasModalAudio = !!modalRecordedAudio;

    if (audioRecordStartBtn) audioRecordStartBtn.disabled = isRecording;
    if (audioRecordStopBtn) audioRecordStopBtn.disabled = !isRecording;
    if (audioRecordUseBtn) audioRecordUseBtn.disabled = isRecording || !hasModalAudio;

    if (recordFrontAudioBtn) {
        const recordingFront = isRecording && activeRecorderSide === 'front';
        recordFrontAudioBtn.textContent = recordingFront ? 'Recording Front...' : 'Record Front Audio';
        recordFrontAudioBtn.classList.toggle('is-recording', recordingFront);
    }

    if (recordBackAudioBtn) {
        const recordingBack = isRecording && activeRecorderSide === 'back';
        recordBackAudioBtn.textContent = recordingBack ? 'Recording Back...' : 'Record Back Audio';
        recordBackAudioBtn.classList.toggle('is-recording', recordingBack);
    }
}

function openAudioRecordModal(side) {
    if (!audioRecordModal) return;
    if (!newCardEditor || newCardEditor.classList.contains('hidden')) return;

    modalRecordingSide = side;
    modalRecordedAudio = '';

    if (audioRecordTitle) {
        audioRecordTitle.textContent = side === 'front' ? 'Record Front Audio' : 'Record Back Audio';
    }
    if (audioRecordStatus) {
        audioRecordStatus.textContent = `Ready to record ${side} audio.`;
    }
    if (audioRecordPlayback) {
        audioRecordPlayback.src = '';
        audioRecordPlayback.classList.add('hidden');
    }

    drawWaveformIdle();
    audioRecordModal.classList.remove('hidden');
    audioRecordModal.setAttribute('aria-hidden', 'false');
    refreshRecordButtons();
    if (audioRecordStartBtn) audioRecordStartBtn.focus();
}

function closeAudioRecordModal() {
    if (!audioRecordModal) return;
    stopRecorderAndReleaseStream(true);
    modalRecordingSide = null;
    modalRecordedAudio = '';
    if (audioRecordPlayback) {
        audioRecordPlayback.src = '';
        audioRecordPlayback.classList.add('hidden');
    }
    audioRecordModal.classList.add('hidden');
    audioRecordModal.setAttribute('aria-hidden', 'true');
}

async function startModalRecording() {
    if (!modalRecordingSide) return;
    if (activeRecorder && activeRecorder.state === 'recording') {
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('Audio recording is not supported in this browser.');
        if (audioRecordStatus) audioRecordStatus.textContent = 'Audio recording is not supported in this browser.';
        return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
        setStatus('Web Audio is not supported in this browser.');
        if (audioRecordStatus) audioRecordStatus.textContent = 'Web Audio is not supported in this browser.';
        return;
    }

    modalRecordedAudio = '';
    if (audioRecordPlayback) {
        audioRecordPlayback.src = '';
        audioRecordPlayback.classList.add('hidden');
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1,
                sampleRate: { ideal: 48000 }
            }
        });
        activeRecorderStream = stream;
        activeRecorderSide = modalRecordingSide;
        discardActiveRecording = false;
        captureBuffers = [];
        captureHasSignal = false;
        startWaveform(stream);

        if (!waveformAudioContext || !waveformSource) {
            throw new Error('Unable to initialize audio context');
        }
        if (waveformAudioContext.state === 'suspended') {
            await waveformAudioContext.resume();
        }
        if (waveformAudioContext.state !== 'running') {
            throw new Error('Audio context is not running');
        }

        captureSampleRate = waveformAudioContext.sampleRate || 44100;
        captureProcessor = waveformAudioContext.createScriptProcessor(4096, 1, 1);
        captureSilenceGain = waveformAudioContext.createGain();
        captureSilenceGain.gain.value = 0;
        captureProcessor.onaudioprocess = (event) => {
            if (!activeRecorder || activeRecorder.state !== 'recording') return;
            const channel = event.inputBuffer.getChannelData(0);
            const copy = new Float32Array(channel.length);
            copy.set(channel);
            captureBuffers.push(copy);

            let energy = 0;
            let peak = 0;
            for (let i = 0; i < channel.length; i += 1) {
                const value = channel[i];
                const absValue = Math.abs(value);
                energy += value * value;
                if (absValue > peak) peak = absValue;
            }
            const rms = Math.sqrt(energy / channel.length);
            if (peak > 0.01 || rms > 0.004) captureHasSignal = true;

            const now = performance.now();
            if (audioRecordStatus && now - lastCaptureLevelUpdate > 220) {
                const level = Math.min(100, Math.round(peak * 150));
                audioRecordStatus.textContent = `Recording... input level ${level}%`;
                lastCaptureLevelUpdate = now;
            }
        };
        waveformSource.connect(captureProcessor);
        captureProcessor.connect(captureSilenceGain);
        captureSilenceGain.connect(waveformAudioContext.destination);

        const track = stream.getAudioTracks()[0];
        if (track) {
            track.onmute = () => {
                if (audioRecordStatus) audioRecordStatus.textContent = 'Microphone muted by browser/device.';
            };
            track.onunmute = () => {
                if (audioRecordStatus) audioRecordStatus.textContent = 'Recording... microphone active.';
            };
        }

        activeRecorder = {
            state: 'recording',
            stop() {
                if (this.state !== 'recording') return;
                this.state = 'inactive';
                finalizeAudioCapture();
            }
        };

        refreshRecordButtons();
        if (audioRecordStatus) audioRecordStatus.textContent = 'Recording... speak now.';
    } catch {
        const message = 'Could not start recording. Allow microphone access and try again.';
        setStatus(message);
        if (audioRecordStatus) audioRecordStatus.textContent = message;
        if (window.FyrianPopup && typeof window.FyrianPopup.alert === 'function') {
            window.FyrianPopup.alert(message, { title: 'Recording Error' });
        }
        stopRecorderAndReleaseStream();
    }
}

function stopModalRecording() {
    if (!activeRecorder || activeRecorder.state !== 'recording') {
        return;
    }
    stopRecorderAndReleaseStream();
}

function useModalRecording() {
    if (!modalRecordingSide || !modalRecordedAudio) return;
    if (modalRecordingSide === 'front') {
        workingAudio.front = modalRecordedAudio;
    } else {
        workingAudio.back = modalRecordedAudio;
    }
    refreshAudioPreviews();
    setStatus(`${modalRecordingSide === 'front' ? 'Front' : 'Back'} audio attached.`);
    closeAudioRecordModal();
}

function clearEditorAudio(side) {
    if (side === 'front') {
        workingAudio.front = '';
    } else {
        workingAudio.back = '';
    }
    refreshAudioPreviews();
}

function renderStudySideAudio(card, showingBack) {
    if (!studyCardAudioEl || !card) return;

    const side = showingBack ? 'back' : 'front';
    const sideAudio = showingBack ? card.backAudio : card.frontAudio;
    if (!sideAudio) {
        studyCardAudioEl.innerHTML = '';
        studyCardAudioEl.classList.add('hidden');
        lastRenderedAudioKey = '';
        return;
    }

    const audioKey = `${card.id}:${side}`;
    const audio = document.createElement('audio');
    audio.src = sideAudio;
    audio.preload = 'metadata';
    audio.className = 'study-card-audio-player';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'tool-btn study-card-audio-btn';
    playBtn.textContent = 'Play Audio';

    const setPlayText = () => {
        playBtn.textContent = audio.paused ? 'Play Audio' : 'Pause Audio';
    };
    audio.addEventListener('play', setPlayText);
    audio.addEventListener('pause', setPlayText);
    audio.addEventListener('ended', setPlayText);

    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play().catch(() => {
                setStatus('Could not play audio. Check output device/volume.');
            });
        } else {
            audio.pause();
        }
    });

    studyCardAudioEl.innerHTML = '';
    studyCardAudioEl.appendChild(playBtn);
    studyCardAudioEl.appendChild(audio);
    studyCardAudioEl.classList.remove('hidden');
    setPlayText();

    if (lastRenderedAudioKey !== audioKey) {
        lastRenderedAudioKey = audioKey;
        audio.play().then(setPlayText).catch(() => {
            setPlayText();
        });
    }
}

async function deleteDeckById(deckId) {
    const deck = findDeck(deckId);
    if (!deck) return;

    const confirmed = await window.FyrianPopup.confirm(
        `Delete deck "${deck.name}" and all its cards?`,
        { title: 'Delete Deck', danger: true, okText: 'Delete' }
    );
    if (!confirmed) return;

    state.decks = state.decks.filter((entry) => entry.id !== deckId);
    state.currentCardIndex = 0;
    state.showingBack = false;
    ensureCurrentDeck(null);
    persistState();

    if (page !== 'decks') {
        if (state.currentDeckId) {
            window.location.href = deckUrlFor(state.currentDeckId);
            return;
        }
        window.location.href = homeUrlWithEmbed();
        return;
    }

    refreshUI();
}

function renderDeckSelect() {
    if (!deckSelect) return;
    deckSelect.innerHTML = '';

    if (!state.decks.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No decks yet';
        deckSelect.appendChild(option);
        deckSelect.disabled = true;
        if (deleteDeckBtn) deleteDeckBtn.disabled = true;
        return;
    }

    state.decks.forEach((deck) => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = deck.name;
        option.selected = deck.id === state.currentDeckId;
        deckSelect.appendChild(option);
    });

    deckSelect.disabled = false;
    if (deleteDeckBtn) deleteDeckBtn.disabled = false;
}

function renderDecksPage() {
    if (!decksListEl) return;
    decksListEl.innerHTML = '';

    if (!state.decks.length) {
        const empty = document.createElement('li');
        empty.className = 'deck-row empty';
        empty.textContent = 'No decks yet. Create one above.';
        decksListEl.appendChild(empty);
        setStatus('Create a deck to get started.');
        return;
    }

    setStatus('Choose a deck to open.');
    state.decks.forEach((deck) => {
        const li = document.createElement('li');
        li.className = 'deck-row';

        const info = document.createElement('div');
        info.className = 'deck-info';
        info.innerHTML = `<div class="deck-name">${deck.name}</div><div class="deck-meta">${deck.cards.length} card${deck.cards.length === 1 ? '' : 's'}</div>`;

        const actions = document.createElement('div');
        actions.className = 'deck-actions';
        actions.innerHTML = `
            <a class="primary-btn nav-btn" href="${deckUrlFor(deck.id)}">Open Deck</a>
            <button class="tool-btn danger" type="button" data-action="delete-deck" data-deck-id="${deck.id}">Delete</button>
        `;

        li.appendChild(info);
        li.appendChild(actions);
        decksListEl.appendChild(li);
    });
}

function renderDeckPage() {
    if (!studyCardEl || !studyCardSideEl || !studyCardMetaEl || !cardCounterEl || !prevCardBtn || !nextCardBtn) {
        return;
    }

    const deck = currentDeck();

    if (!deck) {
        if (deckTitleEl) deckTitleEl.textContent = 'Deck Not Found';
        studyCardEl.classList.add('empty');
        studyCardEl.classList.remove('is-back');
        studyCardSideEl.textContent = 'Deck not found. Return to all decks and choose one.';
        if (studyCardAudioEl) {
            studyCardAudioEl.innerHTML = '';
            studyCardAudioEl.classList.add('hidden');
        }
        studyCardMetaEl.textContent = 'Front';
        cardCounterEl.textContent = '0 / 0';
        prevCardBtn.disabled = true;
        nextCardBtn.disabled = true;
        if (shuffleBtn) shuffleBtn.disabled = true;
        if (addNewCardBtn) addNewCardBtn.disabled = true;
        if (editCardBtn) editCardBtn.disabled = true;
        if (deleteCardBtn) deleteCardBtn.disabled = true;
        setStatus('That deck does not exist on this browser.');
        showNewCardEditor(false);
        return;
    }

    if (deckTitleEl) deckTitleEl.textContent = deck.name;

    const card = currentCard();
    const count = deck.cards.length;

    if (!card) {
        studyCardEl.classList.add('empty');
        studyCardEl.classList.remove('is-back');
        studyCardSideEl.textContent = 'No cards in this deck yet. Add one below.';
        studyCardMetaEl.textContent = 'Front';
        cardCounterEl.textContent = `0 / ${count}`;
        prevCardBtn.disabled = true;
        nextCardBtn.disabled = true;
        if (shuffleBtn) shuffleBtn.disabled = true;
        if (addNewCardBtn) addNewCardBtn.disabled = false;
        if (editCardBtn) editCardBtn.disabled = true;
        if (deleteCardBtn) deleteCardBtn.disabled = true;
        if (studyCardAudioEl) {
            studyCardAudioEl.innerHTML = '';
            studyCardAudioEl.classList.add('hidden');
        }
        lastRenderedAudioKey = '';
        setStatus(`${deck.name}: add your first card.`);
        return;
    }

    studyCardEl.classList.remove('empty');
    studyCardEl.classList.toggle('is-back', state.showingBack);
    studyCardSideEl.textContent = state.showingBack ? card.back : card.front;
    studyCardMetaEl.textContent = state.showingBack ? 'Back' : 'Front';
    cardCounterEl.textContent = `${state.currentCardIndex + 1} / ${count}`;
    prevCardBtn.disabled = count <= 1;
    nextCardBtn.disabled = count <= 1;
    if (shuffleBtn) shuffleBtn.disabled = count <= 1;
    if (addNewCardBtn) addNewCardBtn.disabled = false;
    if (editCardBtn) editCardBtn.disabled = false;
    if (deleteCardBtn) deleteCardBtn.disabled = false;
    renderStudySideAudio(card, state.showingBack);
    setStatus(`${deck.name}: tap card to flip, arrows to move.`);
}

function refreshUI() {
    renderDeckSelect();
    if (page === 'decks') renderDecksPage();
    if (page === 'deck') renderDeckPage();
}

function createDeck() {
    if (!newDeckNameInput) return;
    const name = newDeckNameInput.value.trim();
    if (!name) {
        setStatus('Enter a deck name first.');
        return;
    }

    const deck = { id: uid('deck'), name, cards: [] };
    state.decks.unshift(deck);
    state.currentDeckId = deck.id;
    state.currentCardIndex = 0;
    state.showingBack = false;
    persistState();
    window.location.href = deckUrlFor(deck.id);
}

function addNewCard() {
    const deck = currentDeck();
    if (!deck || !newCardFront || !newCardBack) {
        setStatus('Choose a valid deck first.');
        return;
    }

    const front = newCardFront.value.trim();
    const back = newCardBack.value.trim();
    if (!front || !back) {
        setStatus('Both front and back are required.');
        return;
    }

    if (editorMode === 'edit' && editingCardId) {
        const idx = deck.cards.findIndex((entry) => entry.id === editingCardId);
        if (idx === -1) {
            setStatus('Card not found.');
            return;
        }
        deck.cards[idx] = {
            ...deck.cards[idx],
            front,
            back,
            frontAudio: workingAudio.front || '',
            backAudio: workingAudio.back || ''
        };
        state.currentCardIndex = idx;
    } else {
        deck.cards.push({
            id: uid('card'),
            front,
            back,
            frontAudio: workingAudio.front || '',
            backAudio: workingAudio.back || ''
        });
        state.currentCardIndex = deck.cards.length - 1;
    }

    state.showingBack = false;
    persistState();
    showNewCardEditor(false);
    refreshUI();
}

function openNewCardEditorForAdd() {
    resetEditorState();
    showNewCardEditor(true);
}

function editCurrentCard() {
    const card = currentCard();
    if (!card || !newCardFront || !newCardBack) return;
    editorMode = 'edit';
    editingCardId = card.id;
    if (newCardEditorTitle) newCardEditorTitle.textContent = 'Edit Card';
    if (saveNewCardBtn) saveNewCardBtn.textContent = 'Update Card';
    newCardFront.value = card.front;
    newCardBack.value = card.back;
    workingAudio = {
        front: card.frontAudio || '',
        back: card.backAudio || ''
    };
    refreshAudioPreviews();
    showNewCardEditor(true);
}

async function deleteCurrentCard() {
    const deck = currentDeck();
    const card = currentCard();
    if (!deck || !card) return;

    const confirmed = await window.FyrianPopup.confirm(
        'Delete this card?',
        { title: 'Delete Card', danger: true, okText: 'Delete' }
    );
    if (!confirmed) return;

    deck.cards = deck.cards.filter((entry) => entry.id !== card.id);
    if (!deck.cards.length) {
        state.currentCardIndex = 0;
    } else if (state.currentCardIndex >= deck.cards.length) {
        state.currentCardIndex = deck.cards.length - 1;
    }
    state.showingBack = false;
    persistState();
    refreshUI();
}

function flipCard() {
    if (!currentCard()) return;
    state.showingBack = !state.showingBack;
    persistState();
    renderDeckPage();
}

function pageCard(direction) {
    const deck = currentDeck();
    if (!deck || deck.cards.length <= 1) return;
    const count = deck.cards.length;
    state.currentCardIndex = (state.currentCardIndex + direction + count) % count;
    state.showingBack = false;
    persistState();
    renderDeckPage();
}

function shuffleDeck() {
    const deck = currentDeck();
    if (!deck || deck.cards.length <= 1) return;

    for (let i = deck.cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
    }

    state.currentCardIndex = 0;
    state.showingBack = false;
    persistState();
    renderDeckPage();
    setStatus(`${deck.name}: shuffled.`);
}

function bindEvents() {
    if (createDeckBtn) createDeckBtn.addEventListener('click', createDeck);
    if (newDeckNameInput) {
        newDeckNameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createDeck();
            }
        });
    }

    if (decksListEl) {
        decksListEl.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.dataset.action === 'delete-deck') {
                deleteDeckById(target.dataset.deckId || '');
            }
        });
    }

    if (deckSelect) {
        deckSelect.addEventListener('change', () => {
            const nextId = deckSelect.value;
            if (!nextId) return;
            state.currentDeckId = nextId;
            state.currentCardIndex = 0;
            state.showingBack = false;
            persistState();

            if (page === 'decks') {
                refreshUI();
                return;
            }

            window.location.href = deckUrlFor(nextId);
        });
    }

    if (deleteDeckBtn) {
        deleteDeckBtn.addEventListener('click', () => {
            if (!state.currentDeckId) return;
            deleteDeckById(state.currentDeckId);
        });
    }

    if (studyCardEl) {
        studyCardEl.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('audio, .audio-control, .audio-preview, #study-card-audio')) {
                return;
            }
            flipCard();
        });
        studyCardEl.addEventListener('keydown', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest('#study-card-audio')) {
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                flipCard();
            }
        });
    }

    if (prevCardBtn) prevCardBtn.addEventListener('click', () => pageCard(-1));
    if (nextCardBtn) nextCardBtn.addEventListener('click', () => pageCard(1));
    if (shuffleBtn) shuffleBtn.addEventListener('click', shuffleDeck);

    if (addNewCardBtn) addNewCardBtn.addEventListener('click', openNewCardEditorForAdd);
    if (editCardBtn) editCardBtn.addEventListener('click', editCurrentCard);
    if (deleteCardBtn) deleteCardBtn.addEventListener('click', deleteCurrentCard);
    if (cancelNewCardBtn) cancelNewCardBtn.addEventListener('click', () => showNewCardEditor(false));
    if (saveNewCardBtn) saveNewCardBtn.addEventListener('click', addNewCard);
    if (recordFrontAudioBtn) recordFrontAudioBtn.addEventListener('click', () => openAudioRecordModal('front'));
    if (recordBackAudioBtn) recordBackAudioBtn.addEventListener('click', () => openAudioRecordModal('back'));
    if (clearFrontAudioBtn) clearFrontAudioBtn.addEventListener('click', () => clearEditorAudio('front'));
    if (clearBackAudioBtn) clearBackAudioBtn.addEventListener('click', () => clearEditorAudio('back'));
    if (audioRecordStartBtn) audioRecordStartBtn.addEventListener('click', startModalRecording);
    if (audioRecordStopBtn) audioRecordStopBtn.addEventListener('click', stopModalRecording);
    if (audioRecordUseBtn) audioRecordUseBtn.addEventListener('click', useModalRecording);
    if (audioRecordCancelBtn) audioRecordCancelBtn.addEventListener('click', closeAudioRecordModal);
    if (audioRecordModal) {
        audioRecordModal.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.dataset.audioRecordClose === '1') {
                closeAudioRecordModal();
            }
        });
    }

    if (newCardFront) {
        newCardFront.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (newCardBack) newCardBack.focus();
            }
        });
    }

    if (newCardBack) {
        newCardBack.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                addNewCard();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (audioRecordModal && !audioRecordModal.classList.contains('hidden')) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeAudioRecordModal();
            }
            return;
        }
        if (page !== 'deck') return;
        const target = event.target;
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
            return;
        }
        if (event.key === 'ArrowLeft') pageCard(-1);
        if (event.key === 'ArrowRight') pageCard(1);
        if (event.key.toLowerCase() === 'f') flipCard();
    });
}

ensureCurrentDeck(routeDeckId || null);
resetEditorState();
refreshRecordButtons();
persistState();
bindEvents();
refreshUI();
