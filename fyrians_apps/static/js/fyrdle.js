const WORD_LENGTH = 5;

const STORAGE = {
    mode: 'fyrdle_mode',
    maxGuesses: 'fyrdle_max_guesses',
    hardMode: 'fyrdle_hard_mode',
    colorblind: 'fyrdle_colorblind',
    stats: 'fyrdle_stats_v1'
};

const STATUS_WEIGHT = {
    absent: 1,
    present: 2,
    correct: 3
};

const rootEl = document.getElementById('fyrdle-root');
const gridEl = document.getElementById('fyrdle-grid');
const keyboardEl = document.getElementById('fyrdle-keyboard');
const statusEl = document.getElementById('fyrdle-status');
const substatusEl = document.getElementById('fyrdle-substatus');
const completionEl = document.getElementById('fyrdle-complete');
const completeTitleEl = document.getElementById('complete-title');
const completeMessageEl = document.getElementById('complete-message');
const completeStatsEl = document.getElementById('complete-stats');

const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
const guessButtons = Array.from(document.querySelectorAll('[data-max-guesses]'));
const hardModeToggle = document.getElementById('hard-mode-toggle');
const colorblindToggle = document.getElementById('colorblind-toggle');
const newGameBtn = document.getElementById('new-fyrdle-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const shareBtn = document.getElementById('share-btn');

const settings = {
    mode: localStorage.getItem(STORAGE.mode) || 'random',
    maxGuesses: Number(localStorage.getItem(STORAGE.maxGuesses) || '6') === 8 ? 8 : 6,
    hardMode: localStorage.getItem(STORAGE.hardMode) === '1',
    colorblind: localStorage.getItem(STORAGE.colorblind) === '1'
};

let words = [];
let wordSet = new Set();
let validGuessSet = new Set();
let solution = '';
let currentGuess = '';
let currentRow = 0;
let guesses = [];
let feedbackRows = [];
let keyboardStatus = {};
let knownPositions = Array(WORD_LENGTH).fill('');
let requiredCounts = {};
let gameComplete = false;
let isWin = false;
let dailyKey = '';
let gameStartedAt = Date.now();

function setStatus(primary, secondary = '') {
    statusEl.textContent = primary;
    substatusEl.textContent = secondary;
}

function getStats() {
    const raw = localStorage.getItem(STORAGE.stats);
    if (!raw) {
        return {
            played: 0,
            won: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalGuessesForWins: 0
        };
    }

    try {
        const parsed = JSON.parse(raw);
        return {
            played: Number(parsed.played) || 0,
            won: Number(parsed.won) || 0,
            currentStreak: Number(parsed.currentStreak) || 0,
            bestStreak: Number(parsed.bestStreak) || 0,
            totalGuessesForWins: Number(parsed.totalGuessesForWins) || 0
        };
    } catch {
        return {
            played: 0,
            won: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalGuessesForWins: 0
        };
    }
}

function saveStats(stats) {
    localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
}

function persistSettings() {
    localStorage.setItem(STORAGE.mode, settings.mode);
    localStorage.setItem(STORAGE.maxGuesses, String(settings.maxGuesses));
    localStorage.setItem(STORAGE.hardMode, settings.hardMode ? '1' : '0');
    localStorage.setItem(STORAGE.colorblind, settings.colorblind ? '1' : '0');
}

function updateOptionUI() {
    modeButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === settings.mode);
    });
    guessButtons.forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.maxGuesses) === settings.maxGuesses);
    });
    hardModeToggle.checked = settings.hardMode;
    colorblindToggle.checked = settings.colorblind;
    rootEl.classList.toggle('colorblind', settings.colorblind);
}

function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0);
}

function pickDailyWord() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const index = hashString(`fyrdle-${key}`) % words.length;
    dailyKey = key;
    return words[index];
}

function pickRandomWord() {
    const index = Math.floor(Math.random() * words.length);
    dailyKey = '';
    return words[index];
}

function buildGrid() {
    gridEl.innerHTML = '';

    for (let row = 0; row < settings.maxGuesses; row += 1) {
        const rowEl = document.createElement('div');
        rowEl.className = 'fyrdle-row';
        rowEl.dataset.row = String(row);

        for (let col = 0; col < WORD_LENGTH; col += 1) {
            const tile = document.createElement('div');
            tile.className = 'fyrdle-tile';
            tile.dataset.row = String(row);
            tile.dataset.col = String(col);
            rowEl.appendChild(tile);
        }

        gridEl.appendChild(rowEl);
    }
}

function buildKeyboard() {
    keyboardEl.innerHTML = '';

    const rows = [
        { cls: 'row-a', keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'] },
        { cls: 'row-b', keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'] },
        { cls: 'row-c', keys: ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'] }
    ];

    rows.forEach((row) => {
        const rowEl = document.createElement('div');
        rowEl.className = `kb-row ${row.cls}`;

        row.keys.forEach((key) => {
            const keyBtn = document.createElement('button');
            keyBtn.type = 'button';
            keyBtn.className = 'kb-key';
            keyBtn.dataset.key = key;

            if (key === 'enter') {
                keyBtn.textContent = 'Enter';
            } else if (key === 'backspace') {
                keyBtn.textContent = '⌫';
            } else {
                keyBtn.textContent = key.toUpperCase();
            }

            rowEl.appendChild(keyBtn);
        });

        keyboardEl.appendChild(rowEl);
    });
}

function renderBoard() {
    for (let row = 0; row < settings.maxGuesses; row += 1) {
        const rowGuess = row < currentRow ? guesses[row] : row === currentRow ? currentGuess : '';
        const rowFeedback = feedbackRows[row] || null;

        for (let col = 0; col < WORD_LENGTH; col += 1) {
            const tile = gridEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (!tile) continue;

            const letter = rowGuess[col] || '';
            tile.textContent = letter;
            tile.classList.remove('filled', 'correct', 'present', 'absent');

            if (letter) {
                tile.classList.add('filled');
            }

            if (rowFeedback && rowFeedback[col]) {
                tile.classList.add(rowFeedback[col]);
            }
        }
    }
}

function animateCurrentTilePop() {
    const col = currentGuess.length - 1;
    if (col < 0) return;

    const tile = gridEl.querySelector(`[data-row="${currentRow}"][data-col="${col}"]`);
    if (!tile) return;

    tile.classList.add('pop');
    window.setTimeout(() => tile.classList.remove('pop'), 140);
}

function setKeyStatus(letter, status) {
    const existing = keyboardStatus[letter];
    if (!existing || STATUS_WEIGHT[status] > STATUS_WEIGHT[existing]) {
        keyboardStatus[letter] = status;
    }
}

function renderKeyboard() {
    keyboardEl.querySelectorAll('.kb-key').forEach((btn) => {
        const key = btn.dataset.key;
        if (!key || key.length !== 1) return;

        btn.classList.remove('correct', 'present', 'absent');
        if (keyboardStatus[key]) {
            btn.classList.add(keyboardStatus[key]);
        }
    });
}

function evaluateGuess(guess, answer) {
    const result = Array(WORD_LENGTH).fill('absent');
    const counts = {};

    for (let i = 0; i < WORD_LENGTH; i += 1) {
        const letter = answer[i];
        counts[letter] = (counts[letter] || 0) + 1;
    }

    for (let i = 0; i < WORD_LENGTH; i += 1) {
        if (guess[i] === answer[i]) {
            result[i] = 'correct';
            counts[guess[i]] -= 1;
        }
    }

    for (let i = 0; i < WORD_LENGTH; i += 1) {
        if (result[i] === 'correct') continue;
        const letter = guess[i];
        if ((counts[letter] || 0) > 0) {
            result[i] = 'present';
            counts[letter] -= 1;
        }
    }

    return result;
}

function updateHardModeConstraints(guess, result) {
    const rowMustCounts = {};

    for (let i = 0; i < WORD_LENGTH; i += 1) {
        const letter = guess[i];
        const status = result[i];

        if (status === 'correct') {
            knownPositions[i] = letter;
            rowMustCounts[letter] = (rowMustCounts[letter] || 0) + 1;
        } else if (status === 'present') {
            rowMustCounts[letter] = (rowMustCounts[letter] || 0) + 1;
        }
    }

    Object.entries(rowMustCounts).forEach(([letter, count]) => {
        requiredCounts[letter] = Math.max(requiredCounts[letter] || 0, count);
    });
}

function validateHardMode(nextGuess) {
    for (let i = 0; i < WORD_LENGTH; i += 1) {
        const fixed = knownPositions[i];
        if (fixed && nextGuess[i] !== fixed) {
            return `Hard mode: keep ${fixed.toUpperCase()} in position ${i + 1}.`;
        }
    }

    for (const [letter, count] of Object.entries(requiredCounts)) {
        const presentCount = nextGuess.split('').filter((c) => c === letter).length;
        if (presentCount < count) {
            return `Hard mode: include ${letter.toUpperCase()} (${count}x).`;
        }
    }

    return '';
}

function openCompletionPanel(win, usedRows) {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - gameStartedAt) / 1000));
    const stats = getStats();
    stats.played += 1;

    if (win) {
        stats.won += 1;
        stats.currentStreak += 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        stats.totalGuessesForWins += usedRows;
    } else {
        stats.currentStreak = 0;
    }

    saveStats(stats);

    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    const avgGuesses = stats.won > 0 ? (stats.totalGuessesForWins / stats.won).toFixed(2) : '--';

    if (win) {
        completeTitleEl.textContent = usedRows <= 3 ? 'Legendary Solve' : 'Fyrdle Cleared';
        completeMessageEl.textContent = `You solved it in ${usedRows}/${settings.maxGuesses} with ${elapsedSeconds}s on the clock.`;
    } else {
        completeTitleEl.textContent = 'Round Complete';
        completeMessageEl.textContent = `Answer: ${solution.toUpperCase()} · regroup and run it back.`;
    }

    const statItems = [
        { label: 'Games', value: String(stats.played) },
        { label: 'Win Rate', value: `${winRate}%` },
        { label: 'Streak', value: String(stats.currentStreak) },
        { label: 'Best Streak', value: String(stats.bestStreak) },
        { label: 'Avg Guesses', value: String(avgGuesses) },
        { label: 'Mode', value: settings.mode === 'daily' ? 'Daily' : 'Random' }
    ];

    completeStatsEl.innerHTML = '';
    statItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'complete-stat';
        card.innerHTML = `<span class="label">${item.label}</span><span class="value">${item.value}</span>`;
        completeStatsEl.appendChild(card);
    });

    completionEl.classList.remove('hidden');
}

function buildShareText() {
    const emojiMap = settings.colorblind
        ? { correct: '🟦', present: '🟧', absent: '⬛' }
        : { correct: '🟩', present: '🟨', absent: '⬛' };

    const playedRows = feedbackRows.slice(0, currentRow).filter(Boolean);
    const lines = playedRows.map((row) => row.map((status) => emojiMap[status]).join(''));
    const score = isWin ? `${currentRow}/${settings.maxGuesses}` : `X/${settings.maxGuesses}`;
    const modeTag = settings.mode === 'daily' ? `Daily ${dailyKey}` : 'Random';

    return [`Fyrdle ${modeTag} ${score}`, ...lines].join('\n');
}

async function copyResult() {
    const text = buildShareText();

    try {
        await navigator.clipboard.writeText(text);
        setStatus('Result copied to clipboard.', substatusEl.textContent);
    } catch {
        setStatus('Clipboard blocked. Here is your result in console.', substatusEl.textContent);
        console.log(text);
    }
}

function submitGuess() {
    if (gameComplete) return;

    if (currentGuess.length !== WORD_LENGTH) {
        setStatus('Need five letters before Enter.', '');
        return;
    }

    if (!validGuessSet.has(currentGuess)) {
        setStatus('Not a valid word.', 'Try another five-letter guess.');
        return;
    }

    if (settings.hardMode && currentRow > 0) {
        const hardError = validateHardMode(currentGuess);
        if (hardError) {
            setStatus(hardError, '');
            return;
        }
    }

    const result = evaluateGuess(currentGuess, solution);
    guesses[currentRow] = currentGuess;
    feedbackRows[currentRow] = result;

    for (let i = 0; i < WORD_LENGTH; i += 1) {
        setKeyStatus(currentGuess[i], result[i]);
    }

    updateHardModeConstraints(currentGuess, result);

    if (currentGuess === solution) {
        gameComplete = true;
        isWin = true;
        currentRow += 1;
        renderBoard();
        renderKeyboard();
        setStatus('Perfect read. Fyrdle solved.', settings.mode === 'daily' ? `Daily puzzle: ${dailyKey}` : 'Random puzzle complete');
        openCompletionPanel(true, currentRow);
        return;
    }

    currentRow += 1;
    currentGuess = '';

    if (currentRow >= settings.maxGuesses) {
        gameComplete = true;
        isWin = false;
        renderBoard();
        renderKeyboard();
        setStatus(`No more tries. Answer: ${solution.toUpperCase()}`, 'Tap New Fyrdle to keep the streak alive.');
        openCompletionPanel(false, settings.maxGuesses);
        return;
    }

    renderBoard();
    renderKeyboard();
    setStatus(`Attempt ${currentRow + 1}/${settings.maxGuesses}`, settings.hardMode ? 'Hard mode rules active' : '');
}

function addLetter(letter) {
    if (gameComplete) return;
    if (currentGuess.length >= WORD_LENGTH) return;

    currentGuess += letter;
    renderBoard();
    animateCurrentTilePop();
}

function removeLetter() {
    if (gameComplete) return;
    if (!currentGuess.length) return;

    currentGuess = currentGuess.slice(0, -1);
    renderBoard();
}

function confirmNewGameIfNeeded() {
    if (gameComplete) return true;
    if (currentRow === 0 && currentGuess.length === 0) return true;
    return window.confirm('Start a new Fyrdle and clear the current board?');
}

function resetStateForNewGame() {
    currentGuess = '';
    currentRow = 0;
    guesses = Array(settings.maxGuesses).fill('');
    feedbackRows = Array(settings.maxGuesses).fill(null);
    keyboardStatus = {};
    knownPositions = Array(WORD_LENGTH).fill('');
    requiredCounts = {};
    gameComplete = false;
    isWin = false;
    gameStartedAt = Date.now();
    completionEl.classList.add('hidden');
}

function startNewGame() {
    if (!words.length) return;

    resetStateForNewGame();
    solution = settings.mode === 'daily' ? pickDailyWord() : pickRandomWord();

    buildGrid();
    renderBoard();
    renderKeyboard();

    const modeText = settings.mode === 'daily' ? `Daily puzzle: ${dailyKey}` : 'Random puzzle';
    const hardText = settings.hardMode ? 'Hard mode on' : 'Hard mode off';
    setStatus(`Attempt 1/${settings.maxGuesses}`, `${modeText} · ${hardText}`);
}

function handleKeyInput(key) {
    if (/^[a-z]$/i.test(key)) {
        addLetter(key.toLowerCase());
        return;
    }

    if (key === 'Backspace') {
        removeLetter();
        return;
    }

    if (key === 'Enter') {
        submitGuess();
    }
}

function attachEvents() {
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) return;

        if (/^[a-z]$/i.test(event.key) || event.key === 'Backspace' || event.key === 'Enter') {
            event.preventDefault();
            handleKeyInput(event.key);
        }
    });

    keyboardEl.addEventListener('click', (event) => {
        const button = event.target.closest('.kb-key');
        if (!button) return;

        const key = button.dataset.key;
        if (!key) return;

        if (key === 'backspace') {
            handleKeyInput('Backspace');
        } else if (key === 'enter') {
            handleKeyInput('Enter');
        } else {
            handleKeyInput(key);
        }
    });

    modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.mode === settings.mode) return;
            if (!confirmNewGameIfNeeded()) return;

            settings.mode = btn.dataset.mode;
            persistSettings();
            updateOptionUI();
            startNewGame();
        });
    });

    guessButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextGuesses = Number(btn.dataset.maxGuesses);
            if (nextGuesses === settings.maxGuesses) return;
            if (!confirmNewGameIfNeeded()) return;

            settings.maxGuesses = nextGuesses === 8 ? 8 : 6;
            persistSettings();
            updateOptionUI();
            startNewGame();
        });
    });

    hardModeToggle.addEventListener('change', () => {
        if (hardModeToggle.checked === settings.hardMode) return;
        if (!confirmNewGameIfNeeded()) {
            hardModeToggle.checked = settings.hardMode;
            return;
        }

        settings.hardMode = hardModeToggle.checked;
        persistSettings();
        updateOptionUI();
        startNewGame();
    });

    colorblindToggle.addEventListener('change', () => {
        settings.colorblind = colorblindToggle.checked;
        persistSettings();
        updateOptionUI();
    });

    newGameBtn.addEventListener('click', () => {
        if (!confirmNewGameIfNeeded()) return;
        startNewGame();
    });

    playAgainBtn.addEventListener('click', startNewGame);
    shareBtn.addEventListener('click', copyResult);
}

async function init() {
    updateOptionUI();
    buildKeyboard();
    attachEvents();

    try {
        const response = await fetch('/api/fyrdle/words');
        if (!response.ok) throw new Error('Word endpoint failed');

        const payload = await response.json();
        words = Array.isArray(payload.words) ? payload.words.filter((word) => /^[a-z]{5}$/.test(word)) : [];
        const validWords = Array.isArray(payload.valid_words)
            ? payload.valid_words.filter((word) => /^[a-z]{5}$/.test(word))
            : [];
        wordSet = new Set(words);
        validGuessSet = new Set(validWords.length ? validWords : words);

        if (!words.length) {
            throw new Error('No valid words loaded');
        }

        startNewGame();
    } catch (error) {
        setStatus('Could not load word list.', 'Add wordle.txt with one five-letter word per line.');
        console.error(error);
    }
}

init();
