let timeLimit = 30;
let timeLeft = 30;
let timerInterval = null;
let isPlaying = false;
let usePunctuation = false;
let wordMode = 'normal';
let currentWordIndex = 0;
let currentLetterIndex = 0;
let rawKeystrokes = 0;

const wordsContainer = document.getElementById('words');
const cursor = document.getElementById('cursor');
const timerDisplay = document.getElementById('timer');
const resultsDiv = document.getElementById('results');
const testArea = document.querySelector('.test-area');
const typingStatsToggle = document.getElementById('typing-stats-toggle');
const typingStatsPanel = document.getElementById('typing-stats-panel');
const typingStatsContent = document.getElementById('typing-stats-content');

document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        timeLimit = parseInt(e.target.dataset.time);
        resetTest();
    });
});

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        wordMode = e.target.dataset.mode;
        resetTest();
    });
});

document.getElementById('punct-toggle').addEventListener('click', (e) => {
    usePunctuation = !usePunctuation;
    e.target.innerText = usePunctuation ? 'On' : 'Off';
    e.target.classList.toggle('active', usePunctuation);
    resetTest();
});

document.getElementById('restart-btn').addEventListener('click', resetTest);

function fmt(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return n.toFixed(digits);
}

function modeLabel(mode) {
    return mode === 'difficult' ? 'Difficult' : 'Normal';
}

function punctuationLabel(value) {
    return Number(value) ? 'On' : 'Off';
}

function renderTypingStats(payload) {
    const lines = [];
    const overall = payload.overall || {};
    lines.push(`<div><strong>Tests:</strong> ${overall.tests || 0}</div>`);
    lines.push(`<div><strong>Avg net WPM:</strong> ${fmt(overall.avg_net_wpm, 2)}</div>`);
    lines.push(`<div><strong>Avg raw WPM:</strong> ${fmt(overall.avg_raw_wpm, 2)}</div>`);
    lines.push(`<div><strong>Avg accuracy:</strong> ${fmt(overall.avg_accuracy, 2)}%</div>`);
    lines.push(`<div><strong>Best net WPM:</strong> ${fmt(overall.best_net_wpm, 2)}</div>`);

    lines.push('<div class="stats-heading">By Time</div>');
    (payload.by_time || []).forEach((row) => {
        lines.push(`<div>${row.time_limit}s: ${fmt(row.avg_net_wpm, 2)} net · ${fmt(row.avg_accuracy, 1)}% acc (${row.tests} tests)</div>`);
    });

    lines.push('<div class="stats-heading">Best Time</div>');
    (payload.best_by_time || []).forEach((row) => {
        lines.push(`<div>${row.time_limit}s: ${fmt(row.best_net_wpm, 2)} best net WPM</div>`);
    });

    lines.push('<div class="stats-heading">By Difficulty</div>');
    (payload.by_mode || []).forEach((row) => {
        lines.push(`<div>${modeLabel(row.mode)}: ${fmt(row.avg_net_wpm, 2)} net · ${fmt(row.avg_accuracy, 1)}% acc (${row.tests} tests)</div>`);
    });

    lines.push('<div class="stats-heading">By Punctuation</div>');
    (payload.by_punctuation || []).forEach((row) => {
        lines.push(`<div>Punctuation ${punctuationLabel(row.punctuation)}: ${fmt(row.avg_net_wpm, 2)} net · ${fmt(row.avg_accuracy, 1)}% acc (${row.tests} tests)</div>`);
    });

    lines.push('<div class="stats-heading">Difficulty + Punctuation + Time</div>');
    (payload.by_combo || []).forEach((row) => {
        lines.push(`<div>${modeLabel(row.mode)} · Punctuation ${punctuationLabel(row.punctuation)} · ${row.time_limit}s: ${fmt(row.avg_net_wpm, 2)} net (${row.tests})</div>`);
    });

    typingStatsContent.innerHTML = lines.join('');
}

async function loadTypingStats() {
    typingStatsContent.innerHTML = '<div>Loading stats...</div>';
    try {
        const response = await fetch('/api/typing/stats');
        const payload = await response.json();
        if (!response.ok) {
            typingStatsContent.innerHTML = `<div>${payload.error || 'Could not load stats.'}</div><div>Sign in via Account to track your results.</div>`;
            return;
        }
        renderTypingStats(payload);
    } catch (_err) {
        typingStatsContent.innerHTML = '<div>Could not load stats right now.</div>';
    }
}

typingStatsToggle.addEventListener('click', async () => {
    const opening = typingStatsPanel.classList.contains('hidden');
    typingStatsPanel.classList.toggle('hidden');
    typingStatsToggle.classList.toggle('active', opening);
    if (opening) {
        await loadTypingStats();
    }
});

async function fetchWords(append = false) {
    try {
        const response = await fetch(`/api/words?mode=${encodeURIComponent(wordMode)}`);
        let words = await response.json();
        if (usePunctuation) {
            words = words.map(w => {
                let word = w;
                const randWrap = Math.random();
                if (randWrap > 0.95) word = `"${word}"`;
                else if (randWrap > 0.90) word = `(${word})`;
                else if (randWrap > 0.85) word = `'${word}'`;
                if (Math.random() > 0.7) word = word.charAt(0).toUpperCase() + word.slice(1);
                const randEnd = Math.random();
                if (randEnd > 0.90) word += '.';
                else if (randEnd > 0.80) word += ',';
                else if (randEnd > 0.75) word += '?';
                else if (randEnd > 0.70) word += '!';
                else if (randEnd > 0.65) word += ';';
                else if (randEnd > 0.60) word += ':';
                return word;
            });
        }
        renderWords(words, append);
    } catch (error) {
        if (!append) wordsContainer.innerHTML = "<div class='error'>Failed to load words. Check connection.</div>";
    }
}

function renderWords(words, append = false) {
    if (!append) {
        wordsContainer.innerHTML = '';
        currentWordIndex = 0;
        currentLetterIndex = 0;
        wordsContainer.style.transform = `translateY(0px)`;
    }
    words.forEach((word) => {
        const wordEl = document.createElement('div');
        wordEl.classList.add('word');
        word.split('').forEach((char) => {
            const charEl = document.createElement('span');
            charEl.classList.add('letter');
            charEl.innerText = char;
            wordEl.appendChild(charEl);
        });
        wordsContainer.appendChild(wordEl);
    });
    if (!append) updateCursor();
}

function updateCursor() {
    const activeWord = wordsContainer.children[currentWordIndex];
    if (!activeWord) return;
    let activeLetter = activeWord.children[currentLetterIndex];
    let isEndOfWord = false;
    if (!activeLetter) {
        activeLetter = activeWord.children[activeWord.children.length - 1];
        isEndOfWord = true;
    }
    const containerRect = wordsContainer.parentElement.getBoundingClientRect();
    const letterRect = activeLetter.getBoundingClientRect();
    let cursorLeft = letterRect.left - containerRect.left;
    if (isEndOfWord) cursorLeft += letterRect.width; 

    const firstWord = wordsContainer.children[0];
    const wordTop = activeWord.offsetTop;
    const lineHeight = firstWord.offsetHeight;
    const scrollAmount = Math.max(0, wordTop - lineHeight);
    wordsContainer.style.transform = `translateY(-${scrollAmount}px)`;
    cursor.style.left = `${cursorLeft -4}px`;
    cursor.style.top = `${(wordTop - scrollAmount) + 14}px`;
}

window.addEventListener('keydown', (e) => {
    // Prevent spacebar from activating the focused restart button.
    if (!resultsDiv.classList.contains('hidden') && e.key === ' ') {
        e.preventDefault();
        return;
    }

    // Only intercept if we are actively viewing the typing area
    if (testArea.classList.contains('hidden')) return;

    if (wordsContainer.children.length === 0 || timerInterval === -1) return; 
    if (e.key.length !== 1 && e.key !== 'Backspace') return; 
    if (e.key === ' ') e.preventDefault(); 

    if (!isPlaying && e.key.length === 1) startTimer();

    const words = wordsContainer.children;
    const activeWord = words[currentWordIndex];
    const letters = activeWord.children;

    if (e.key === 'Backspace') {
        if (currentLetterIndex > 0) {
            currentLetterIndex--;
            letters[currentLetterIndex].classList.remove('correct', 'incorrect');
        } else if (currentWordIndex > 0) {
            currentWordIndex--;
            const prevWord = words[currentWordIndex];
            let lastTyped = prevWord.children.length;
            while(lastTyped > 0 && !prevWord.children[lastTyped-1].classList.contains('correct') && !prevWord.children[lastTyped-1].classList.contains('incorrect')) {
                lastTyped--;
            }
            currentLetterIndex = lastTyped;
        }
    } else if (e.key === ' ') {
        if (currentLetterIndex > 0) { 
            rawKeystrokes++; 
            currentWordIndex++;
            currentLetterIndex = 0;
            if (currentWordIndex > words.length - 30) fetchWords(true); 
        }
    } else {
        if (currentLetterIndex < letters.length) {
            rawKeystrokes++; 
            const expectedChar = letters[currentLetterIndex].innerText;
            if (e.key === expectedChar) letters[currentLetterIndex].classList.add('correct');
            else letters[currentLetterIndex].classList.add('incorrect');
            currentLetterIndex++;
        }
    }
    updateCursor();
});

async function recordTypingTest(payload) {
    try {
        await fetch('/api/typing/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (_err) {
        // ignore network/auth issues here
    }
}

function startTimer() {
    isPlaying = true;
    timeLeft = timeLimit;
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = timeLeft;
        if (timeLeft <= 0) endTest();
    }, 1000);
}

function endTest() {
    clearInterval(timerInterval);
    timerInterval = -1; 
    isPlaying = false;
    let finalCorrectChars = 0, correctWordsCount = 0, incorrectWordsCount = 0;
    const words = wordsContainer.children;

    for (let i = 0; i <= currentWordIndex; i++) {
        const letters = words[i].children;
        let wordHasError = false, wordTypedLength = 0;
        for (let j = 0; j < letters.length; j++) {
            if (letters[j].classList.contains('correct')) { finalCorrectChars++; wordTypedLength++; }
            else if (letters[j].classList.contains('incorrect')) { wordHasError = true; wordTypedLength++; }
        }
        if (i < currentWordIndex) {
            if (wordHasError || wordTypedLength < letters.length) incorrectWordsCount++;
            else correctWordsCount++;
        } else {
            if (wordTypedLength > 0 && wordTypedLength === letters.length && !wordHasError) correctWordsCount++;
            else if (wordTypedLength > 0) incorrectWordsCount++;
        }
    }

    const timeInMinutes = timeLimit / 60;
    const rawWPM = (rawKeystrokes / 5) / timeInMinutes;
    const netWPM = ((finalCorrectChars + currentWordIndex) / 5) / timeInMinutes;
    const accuracy = rawKeystrokes > 0 ? ((finalCorrectChars + currentWordIndex) / rawKeystrokes) * 100 : 0;

    testArea.classList.add('hidden');
    resultsDiv.classList.remove('hidden');
    document.getElementById('net-wpm').innerText = Math.round(Math.max(0, netWPM));
    document.getElementById('raw-wpm').innerText = Math.round(Math.max(0, rawWPM));
    document.getElementById('accuracy').innerText = Math.round(accuracy) + '%';
    document.getElementById('correct-words').innerText = correctWordsCount;
    document.getElementById('incorrect-words').innerText = incorrectWordsCount;
    void recordTypingTest({
        mode: wordMode,
        time_limit: timeLimit,
        punctuation: usePunctuation,
        raw_wpm: Math.round(Math.max(0, rawWPM) * 100) / 100,
        net_wpm: Math.round(Math.max(0, netWPM) * 100) / 100,
        accuracy: Math.round(accuracy * 100) / 100,
        correct_words: correctWordsCount,
        incorrect_words: incorrectWordsCount
    });
}

function resetTest() {
    clearInterval(timerInterval);
    isPlaying = false; timerInterval = null; timeLeft = timeLimit;
    timerDisplay.innerText = timeLeft; rawKeystrokes = 0; 
    testArea.classList.remove('hidden');
    resultsDiv.classList.add('hidden');
    fetchWords(); 
}

fetchWords();
