const zoneBtn = document.getElementById('reaction-zone');
const mainText = document.getElementById('reaction-main-text');
const subText = document.getElementById('reaction-sub-text');
const lastMsEl = document.getElementById('reaction-last-ms');
const bestMsEl = document.getElementById('reaction-best-ms');
const statsToggle = document.getElementById('reaction-stats-toggle');
const statsPanel = document.getElementById('reaction-stats-panel');
const statsContent = document.getElementById('reaction-stats-content');
const successSoundSelect = document.getElementById('success-sound-select');
const failSoundSelect = document.getElementById('fail-sound-select');

const REACTION_SOUND_SETTINGS_KEY = 'fyrians_reaction_sound_settings_v1';
const GLOBAL_AUDIO_VOLUME_KEY = 'fyrians_global_audio_volume_v1';
const SOUND_FILES = {
    bubbles: '/static/sounds/bubbles.mp3',
    drop: '/static/sounds/drop.mp3',
    yuh: '/static/sounds/yuh.mp3',
    yuh2: '/static/sounds/yuh2.mp3',
    dissapointment: '/static/sounds/dissapointment.mp3',
    failure: '/static/sounds/failure.mp3'
};
const REACTION_FAIL_MS_THRESHOLD = 250;
const PRE_GREEN_SOUND_LEAD_MS = 25;
const SUCCESS_SOUND_POOL = ['bubbles', 'drop', 'yuh', 'yuh2'];
const FAIL_SOUND_POOL = ['dissapointment', 'failure'];
const soundCache = {};

let state = 'idle';
let readyAt = 0;
let flipTimer = null;
let preFlipSoundTimer = null;
let sessionBestMs = null;

function loadSoundSettings() {
    try {
        const raw = localStorage.getItem(REACTION_SOUND_SETTINGS_KEY);
        if (!raw) return { success: 'bubbles', fail: 'none' };
        const parsed = JSON.parse(raw);
        const success = ['bubbles', 'drop', 'yuh', 'yuh2', 'random', 'none'].includes(parsed.success) ? parsed.success : 'bubbles';
        const fail = ['none', 'random', 'dissapointment', 'failure'].includes(parsed.fail) ? parsed.fail : 'none';
        return { success, fail };
    } catch {
        return { success: 'bubbles', fail: 'none' };
    }
}

function saveSoundSettings() {
    localStorage.setItem(REACTION_SOUND_SETTINGS_KEY, JSON.stringify({
        success: successSoundSelect.value,
        fail: failSoundSelect.value
    }));
}

function globalVolumeValue() {
    try {
        const raw = localStorage.getItem(GLOBAL_AUDIO_VOLUME_KEY);
        const v = Math.max(0, Math.min(100, Number(raw)));
        return (Number.isFinite(v) ? v : 70) / 100;
    } catch {
        return 0.7;
    }
}

function pickRandomFrom(pool) {
    if (!Array.isArray(pool) || !pool.length) return 'none';
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
}

function resolveSoundChoice(kind) {
    if (kind === 'success') {
        const value = successSoundSelect.value;
        if (value === 'random') return pickRandomFrom(SUCCESS_SOUND_POOL);
        return value;
    }
    const value = failSoundSelect.value;
    if (value === 'random') return pickRandomFrom(FAIL_SOUND_POOL);
    return value;
}

function getAudio(name) {
    if (!SOUND_FILES[name]) return null;
    if (!soundCache[name]) {
        soundCache[name] = new Audio(SOUND_FILES[name]);
        soundCache[name].preload = 'auto';
    }
    return soundCache[name];
}

function playSound(name) {
    if (!name || name === 'none') return;
    const audio = getAudio(name);
    if (!audio) return;
    try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = globalVolumeValue();
        void audio.play();
    } catch (_err) {
        // ignore autoplay / unavailable audio issues
    }
}

function setZoneColor(className) {
    zoneBtn.classList.remove('blue-state', 'green-state', 'red-state');
    zoneBtn.classList.add(className);
}

function setIdle() {
    state = 'idle';
    readyAt = 0;
    if (preFlipSoundTimer) {
        clearTimeout(preFlipSoundTimer);
        preFlipSoundTimer = null;
    }
    if (flipTimer) {
        clearTimeout(flipTimer);
        flipTimer = null;
    }
    setZoneColor('blue-state');
    mainText.textContent = 'Click To Start';
    subText.textContent = 'Click this panel to begin. It stays blue first, then flips green after a random 2-4 seconds.';
}

function setWaiting() {
    state = 'waiting';
    setZoneColor('blue-state');
    mainText.textContent = 'Wait...';
    subText.textContent = 'Do not click yet. Wait for green.';

    const delayMs = 2000 + Math.floor(Math.random() * 2001);
    const chosenReadySound = resolveSoundChoice('success');
    if (chosenReadySound !== 'none') {
        preFlipSoundTimer = setTimeout(() => {
            playSound(chosenReadySound);
        }, Math.max(0, delayMs - PRE_GREEN_SOUND_LEAD_MS));
    }
    flipTimer = setTimeout(() => {
        state = 'ready';
        readyAt = performance.now();
        setZoneColor('green-state');
        mainText.textContent = 'CLICK OR PRESS SPACE';
        subText.textContent = 'Now!';
    }, delayMs);
}

function setResult(reactionMs) {
    state = 'result';
    setZoneColor('blue-state');
    mainText.textContent = `${reactionMs} ms`;
    subText.textContent = 'Nice reaction. Click the panel to run again.';
    lastMsEl.textContent = `${reactionMs} ms`;

    if (sessionBestMs === null || reactionMs < sessionBestMs) {
        sessionBestMs = reactionMs;
        bestMsEl.textContent = `${sessionBestMs} ms`;
    }
}

function setFalseStart() {
    state = 'result';
    if (flipTimer) {
        clearTimeout(flipTimer);
        flipTimer = null;
    }
    if (preFlipSoundTimer) {
        clearTimeout(preFlipSoundTimer);
        preFlipSoundTimer = null;
    }
    setZoneColor('red-state');
    mainText.textContent = 'Too Soon';
    subText.textContent = 'Wait for green next time. Click the panel to retry.';
    lastMsEl.textContent = 'False start';
    playSound(resolveSoundChoice('fail'));
}

function fmt(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return n.toFixed(digits);
}

function inputLabel(method) {
    return method === 'space' ? 'Space' : 'Click';
}

function renderReactionStats(payload) {
    const lines = [];
    const overall = payload.overall || {};
    lines.push(`<div><strong>Attempts:</strong> ${overall.attempts || 0}</div>`);
    lines.push(`<div><strong>Valid tests:</strong> ${overall.valid_tests || 0}</div>`);
    lines.push(`<div><strong>False starts:</strong> ${overall.false_starts || 0}</div>`);
    lines.push(`<div><strong>Average:</strong> ${fmt(overall.avg_ms, 2)} ms</div>`);
    lines.push(`<div><strong>Best:</strong> ${overall.best_ms || '--'} ms</div>`);

    lines.push('<div class="stats-heading">By Input</div>');
    (payload.by_input || []).forEach((row) => {
        lines.push(
            `<div>${inputLabel(row.input_method)}: ${fmt(row.avg_ms, 2)} ms avg · ${row.best_ms || '--'} ms best (${row.attempts} attempts, ${row.false_starts} false starts)</div>`
        );
    });

    lines.push('<div class="stats-heading">Recent</div>');
    (payload.recent || []).slice(0, 8).forEach((row) => {
        const msg = Number(row.false_start)
            ? `${inputLabel(row.input_method)} · false start`
            : `${inputLabel(row.input_method)} · ${row.reaction_ms} ms`;
        lines.push(`<div>${msg}</div>`);
    });

    statsContent.innerHTML = lines.join('');
}

async function loadReactionStats() {
    statsContent.innerHTML = '<div>Loading stats...</div>';
    try {
        const response = await fetch('/api/reaction/stats');
        const payload = await response.json();
        if (!response.ok) {
            statsContent.innerHTML = `<div>${payload.error || 'Could not load stats.'}</div><div>Sign in via Account to track your reaction tests.</div>`;
            return;
        }
        renderReactionStats(payload);
    } catch (_err) {
        statsContent.innerHTML = '<div>Could not load stats right now.</div>';
    }
}

async function recordReactionAttempt(payload) {
    try {
        await fetch('/api/reaction/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (_err) {
        // ignore auth/network issues in-game
    }
}

function handleAction(method) {
    if (state === 'idle' || state === 'result') {
        setWaiting();
        return;
    }

    if (state === 'waiting') {
        setFalseStart();
        void recordReactionAttempt({
            false_start: true,
            input_method: method
        });
        return;
    }

    if (state === 'ready') {
        const reactionMs = Math.max(1, Math.round(performance.now() - readyAt));
        setResult(reactionMs);
        if (reactionMs > REACTION_FAIL_MS_THRESHOLD) {
            playSound(resolveSoundChoice('fail'));
        }
        void recordReactionAttempt({
            reaction_ms: reactionMs,
            false_start: false,
            input_method: method
        });
    }
}

zoneBtn.addEventListener('click', () => {
    handleAction('click');
});

window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    event.preventDefault();
    if (event.repeat) return;
    handleAction('space');
});

statsToggle.addEventListener('click', async () => {
    const opening = statsPanel.classList.contains('hidden');
    statsPanel.classList.toggle('hidden');
    statsToggle.classList.toggle('active', opening);
    if (opening) {
        await loadReactionStats();
    }
});

successSoundSelect.addEventListener('change', saveSoundSettings);
failSoundSelect.addEventListener('change', saveSoundSettings);

const settings = loadSoundSettings();
successSoundSelect.value = settings.success;
failSoundSelect.value = settings.fail;

setIdle();
