const SIZE = 9;
const BOX = 3;

const DIFFICULTY_CLUES = {
    easy: 40,
    medium: 32,
    hard: 26
};

const STATS_KEY = 'sudoku_stats_v1';

let currentDifficulty = 'easy';
let solutionBoard = emptyBoard();
let puzzleBoard = emptyBoard();
let userBoard = emptyBoard();
let notesBoard = emptyNotesBoard();
let selectedCell = null;
let notesMode = false;
let puzzleActive = false;
let puzzleSolved = false;
let isGenerating = false;
let timerStartMs = 0;
let timerIntervalId = null;
let elapsedSeconds = 0;
let lastCompletionSnapshot = null;

const boardEl = document.getElementById('sudoku-board');
const statusTextEl = document.getElementById('status-text');
const mistakeTextEl = document.getElementById('mistake-text');
const timerTextEl = document.getElementById('timer-text');
const notesToggleEl = document.getElementById('notes-toggle');
const newGameBtnEl = document.getElementById('new-game-btn');
const clearBoardBtnEl = document.getElementById('clear-board-btn');
const completionEl = document.getElementById('sudoku-complete');
const completeTitleEl = document.getElementById('sudoku-complete-title');
const completeMessageEl = document.getElementById('sudoku-complete-message');
const completeStatsEl = document.getElementById('sudoku-complete-stats');
const playAgainBtnEl = document.getElementById('sudoku-play-again-btn');
const shareBtnEl = document.getElementById('sudoku-share-btn');
const sudokuStatsToggleEl = document.getElementById('sudoku-stats-toggle');
const sudokuStatsPanelEl = document.getElementById('sudoku-stats-panel');
const sudokuStatsContentEl = document.getElementById('sudoku-stats-content');

const sudokuWorker = typeof Worker !== 'undefined' ? new Worker('/static/js/sudoku-worker.js') : null;
const pendingWorkerJobs = new Map();
let workerJobId = 0;

const deepCopy = (board) => board.map((row) => [...row]);

function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function emptyNotesBoard() {
    return Array.from({ length: SIZE }, () =>
        Array.from({ length: SIZE }, () => new Set())
    );
}

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function renderSudokuStats(payload) {
    const overall = payload.overall || {};
    const games = Number(overall.games || 0);
    const solved = Number(overall.solved || 0);
    const solveRate = games > 0 ? Math.round((solved / games) * 100) : 0;

    const lines = [
        `<div><strong>Games:</strong> ${games}</div>`,
        `<div><strong>Solved:</strong> ${solved} (${solveRate}%)</div>`,
        `<div><strong>Avg solve:</strong> ${overall.avg_solve_seconds ? formatTime(overall.avg_solve_seconds) : '--:--'}</div>`,
        `<div><strong>Best solve:</strong> ${overall.best_solve_seconds ? formatTime(overall.best_solve_seconds) : '--:--'}</div>`,
        '<div class="stats-heading">By Difficulty</div>'
    ];

    (payload.by_difficulty || []).forEach((row) => {
        const rowGames = Number(row.games || 0);
        const rowSolved = Number(row.solved || 0);
        const rowRate = rowGames > 0 ? Math.round((rowSolved / rowGames) * 100) : 0;
        lines.push(`<div>${row.difficulty}: ${rowSolved}/${rowGames} solved (${rowRate}%) · avg ${row.avg_solve_seconds ? formatTime(row.avg_solve_seconds) : '--:--'}</div>`);
    });

    lines.push('<div class="stats-heading">Recent</div>');
    (payload.recent || []).slice(0, 6).forEach((row) => {
        lines.push(`<div>${row.difficulty} · ${row.solved ? 'Solved' : 'Abandoned'} · ${formatTime(row.solve_seconds || 0)} · conflicts ${row.conflicts}</div>`);
    });

    sudokuStatsContentEl.innerHTML = lines.join('');
}

async function loadSudokuStats() {
    sudokuStatsContentEl.innerHTML = '<div>Loading stats...</div>';
    try {
        const response = await fetch('/api/sudoku/stats');
        const payload = await response.json();
        if (!response.ok) {
            sudokuStatsContentEl.innerHTML = `<div>${payload.error || 'Could not load stats.'}</div><div>Sign in via Account to track your results.</div>`;
            return;
        }
        renderSudokuStats(payload);
    } catch (_err) {
        sudokuStatsContentEl.innerHTML = '<div>Could not load stats right now.</div>';
    }
}

function getStats() {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) {
        return {
            played: 0,
            solved: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalSolveSeconds: 0,
            bestSolveSeconds: 0
        };
    }

    try {
        const parsed = JSON.parse(raw);
        return {
            played: Number(parsed.played) || 0,
            solved: Number(parsed.solved) || 0,
            currentStreak: Number(parsed.currentStreak) || 0,
            bestStreak: Number(parsed.bestStreak) || 0,
            totalSolveSeconds: Number(parsed.totalSolveSeconds) || 0,
            bestSolveSeconds: Number(parsed.bestSolveSeconds) || 0
        };
    } catch {
        return {
            played: 0,
            solved: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalSolveSeconds: 0,
            bestSolveSeconds: 0
        };
    }
}

function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function recordAttempt(solved, solveSeconds = 0) {
    const stats = getStats();
    stats.played += 1;

    if (solved) {
        stats.solved += 1;
        stats.currentStreak += 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        stats.totalSolveSeconds += solveSeconds;
        if (stats.bestSolveSeconds === 0 || solveSeconds < stats.bestSolveSeconds) {
            stats.bestSolveSeconds = solveSeconds;
        }
    } else {
        stats.currentStreak = 0;
    }

    saveStats(stats);
    void recordSudokuRun({
        difficulty: currentDifficulty,
        solved: !!solved,
        solve_seconds: Number(solveSeconds) || 0,
        conflicts: getConflictCount()
    });
    return stats;
}

async function recordSudokuRun(payload) {
    try {
        await fetch('/api/sudoku/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (_err) {
        // ignore network/auth issues here
    }
}

function shuffle(values) {
    const arr = [...values];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function isValidPlacement(board, row, col, value) {
    for (let i = 0; i < SIZE; i += 1) {
        if (board[row][i] === value && i !== col) return false;
        if (board[i][col] === value && i !== row) return false;
    }

    const boxRow = Math.floor(row / BOX) * BOX;
    const boxCol = Math.floor(col / BOX) * BOX;
    for (let r = boxRow; r < boxRow + BOX; r += 1) {
        for (let c = boxCol; c < boxCol + BOX; c += 1) {
            if (board[r][c] === value && (r !== row || c !== col)) return false;
        }
    }
    return true;
}

function findEmpty(board) {
    for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
            if (board[r][c] === 0) return [r, c];
        }
    }
    return null;
}

function fillBoard(board) {
    const next = findEmpty(board);
    if (!next) return true;

    const [row, col] = next;
    for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
        if (!isValidPlacement(board, row, col, value)) continue;
        board[row][col] = value;
        if (fillBoard(board)) return true;
        board[row][col] = 0;
    }
    return false;
}

function countSolutions(board, limit = 2) {
    const next = findEmpty(board);
    if (!next) return 1;

    const [row, col] = next;
    let count = 0;

    for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        if (!isValidPlacement(board, row, col, value)) continue;
        board[row][col] = value;
        count += countSolutions(board, limit);
        board[row][col] = 0;
        if (count >= limit) return count;
    }
    return count;
}

function generatePuzzle(cluesTarget) {
    const full = emptyBoard();
    fillBoard(full);

    const puzzle = deepCopy(full);
    const positions = shuffle(Array.from({ length: SIZE * SIZE }, (_, idx) => idx));
    let clues = SIZE * SIZE;

    for (const pos of positions) {
        if (clues <= cluesTarget) break;
        const row = Math.floor(pos / SIZE);
        const col = pos % SIZE;
        const saved = puzzle[row][col];
        puzzle[row][col] = 0;

        const test = deepCopy(puzzle);
        if (countSolutions(test, 2) !== 1) {
            puzzle[row][col] = saved;
        } else {
            clues -= 1;
        }
    }

    return { puzzle, solution: full };
}

function requestPuzzle(cluesTarget) {
    if (!sudokuWorker) {
        return Promise.resolve(generatePuzzle(cluesTarget));
    }

    return new Promise((resolve, reject) => {
        const id = ++workerJobId;
        pendingWorkerJobs.set(id, { resolve, reject });
        sudokuWorker.postMessage({ id, cluesTarget });
    });
}

if (sudokuWorker) {
    sudokuWorker.addEventListener('message', (event) => {
        const { id, puzzle, solution, error } = event.data || {};
        const job = pendingWorkerJobs.get(id);
        if (!job) return;
        pendingWorkerJobs.delete(id);

        if (error) {
            job.reject(new Error(error));
            return;
        }

        job.resolve({ puzzle, solution });
    });
}

function startTimer() {
    stopTimer();
    timerStartMs = Date.now();
    elapsedSeconds = 0;
    timerTextEl.textContent = 'Time: 00:00';

    timerIntervalId = window.setInterval(() => {
        elapsedSeconds = Math.floor((Date.now() - timerStartMs) / 1000);
        timerTextEl.textContent = `Time: ${formatTime(elapsedSeconds)}`;
    }, 1000);
}

function stopTimer() {
    if (timerIntervalId) {
        window.clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
}

function setButtonsEnabled(enabled) {
    document.querySelectorAll('.key-btn').forEach((btn) => {
        btn.disabled = !enabled;
    });
    notesToggleEl.disabled = !enabled;
    clearBoardBtnEl.disabled = !enabled;
}

function coordsFromIndex(index) {
    return [Math.floor(index / SIZE), index % SIZE];
}

function getHighlightedValue() {
    if (!selectedCell) return null;
    const selectedValue = userBoard[selectedCell.row][selectedCell.col];
    return selectedValue !== 0 ? selectedValue : null;
}

function renderCell(row, col, el, highlightValue) {
    el.classList.remove('given', 'selected', 'peer', 'conflict', 'same-value', 'idle');

    if (!puzzleActive) {
        el.textContent = '';
        el.classList.add('idle');
        return;
    }

    const given = puzzleBoard[row][col] !== 0;
    const value = userBoard[row][col];
    const notes = notesBoard[row][col];

    if (given) el.classList.add('given');

    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
        el.classList.add('selected');
    } else if (selectedCell) {
        const sameRow = selectedCell.row === row;
        const sameCol = selectedCell.col === col;
        const sameBox =
            Math.floor(selectedCell.row / BOX) === Math.floor(row / BOX) &&
            Math.floor(selectedCell.col / BOX) === Math.floor(col / BOX);
        if (sameRow || sameCol || sameBox) el.classList.add('peer');
    }

    el.innerHTML = '';

    if (value !== 0) {
        el.textContent = String(value);
        if (highlightValue !== null && value === highlightValue) {
            el.classList.add('same-value');
        }
        if (!isValidPlacement(userBoard, row, col, value)) {
            el.classList.add('conflict');
        }
        return;
    }

    if (notes.size) {
        const notesGrid = document.createElement('div');
        notesGrid.className = 'notes-grid';

        for (let valueNum = 1; valueNum <= 9; valueNum += 1) {
            const noteEl = document.createElement('div');
            noteEl.className = 'note';
            noteEl.textContent = notes.has(valueNum) ? String(valueNum) : '';
            if (highlightValue !== null && valueNum === highlightValue && notes.has(valueNum)) {
                noteEl.classList.add('match');
            }
            notesGrid.appendChild(noteEl);
        }

        el.appendChild(notesGrid);
    }
}

function getConflictCount() {
    if (!puzzleActive) return 0;

    let conflicts = 0;
    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            const value = userBoard[row][col];
            if (value !== 0 && !isValidPlacement(userBoard, row, col, value)) {
                conflicts += 1;
            }
        }
    }
    return conflicts;
}

function isSolved() {
    if (!puzzleActive || puzzleSolved) return false;

    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            if (userBoard[row][col] !== solutionBoard[row][col]) return false;
        }
    }
    return true;
}

function updateKeypadState() {
    const buttons = document.querySelectorAll('.key-btn[data-value]');

    if (!puzzleActive) {
        buttons.forEach((btn) => btn.classList.remove('done'));
        return;
    }

    const counts = Array(10).fill(0);
    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            const value = userBoard[row][col];
            if (value >= 1 && value <= 9) counts[value] += 1;
        }
    }

    buttons.forEach((btn) => {
        const value = Number(btn.dataset.value);
        if (value < 1 || value > 9) return;

        const done = counts[value] >= 9;
        btn.classList.toggle('done', done);
    });
}

function showCompletion(stats, solveSeconds, conflicts) {
    const solveRate = stats.played > 0 ? Math.round((stats.solved / stats.played) * 100) : 0;
    const avgSolve = stats.solved > 0 ? Math.round(stats.totalSolveSeconds / stats.solved) : 0;

    completeTitleEl.textContent = solveSeconds <= 300 ? 'Lightning Solve' : 'Puzzle Complete';
    completeMessageEl.textContent = `Solved ${currentDifficulty} puzzle in ${formatTime(solveSeconds)}.`;

    const statItems = [
        { label: 'Time', value: formatTime(solveSeconds) },
        { label: 'Difficulty', value: `${currentDifficulty[0].toUpperCase()}${currentDifficulty.slice(1)}` },
        { label: 'Conflicts', value: String(conflicts) },
        { label: 'Solve Rate', value: `${solveRate}%` },
        { label: 'Streak', value: String(stats.currentStreak) },
        { label: 'Best Streak', value: String(stats.bestStreak) },
        { label: 'Avg Solve', value: formatTime(avgSolve) },
        { label: 'Best Time', value: stats.bestSolveSeconds > 0 ? formatTime(stats.bestSolveSeconds) : '--:--' }
    ];

    completeStatsEl.innerHTML = '';
    statItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'sudoku-stat';
        card.innerHTML = `<span class="label">${item.label}</span><span class="value">${item.value}</span>`;
        completeStatsEl.appendChild(card);
    });

    lastCompletionSnapshot = {
        difficulty: currentDifficulty,
        solveSeconds,
        conflicts
    };

    completionEl.classList.remove('hidden');
}

function finalizeSolve() {
    puzzleSolved = true;
    stopTimer();
    elapsedSeconds = Math.floor((Date.now() - timerStartMs) / 1000);

    const conflicts = getConflictCount();
    const stats = recordAttempt(true, elapsedSeconds);
    statusTextEl.textContent = 'Solved. Generate another puzzle when ready.';
    mistakeTextEl.textContent = `Conflicts: ${conflicts}`;
    timerTextEl.textContent = `Time: ${formatTime(elapsedSeconds)}`;

    setButtonsEnabled(false);
    newGameBtnEl.textContent = 'Generate Puzzle';
    showCompletion(stats, elapsedSeconds, conflicts);
}

function renderBoard() {
    const highlightValue = getHighlightedValue();
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
        const [row, col] = coordsFromIndex(index);
        renderCell(row, col, cell, highlightValue);
    });

    if (!puzzleActive) {
        mistakeTextEl.textContent = 'Conflicts: -';
        timerTextEl.textContent = 'Time: 00:00';
        updateKeypadState();
        return;
    }

    const conflicts = getConflictCount();
    mistakeTextEl.textContent = `Conflicts: ${conflicts}`;
    updateKeypadState();

    if (isSolved()) {
        finalizeSolve();
    }
}

function buildBoard() {
    boardEl.innerHTML = '';

    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.setAttribute('aria-label', `row ${row + 1}, column ${col + 1}`);

            if ((row + 1) % 3 === 0 && row !== SIZE - 1) {
                cell.classList.add('group-bottom');
            }

            cell.addEventListener('click', () => {
                if (!puzzleActive || puzzleSolved) return;
                selectedCell = { row, col };
                renderBoard();
            });

            boardEl.appendChild(cell);
        }
    }
}

function toggleNote(value) {
    if (!selectedCell || !puzzleActive || puzzleSolved) return;

    const { row, col } = selectedCell;
    if (puzzleBoard[row][col] !== 0) return;

    const notes = notesBoard[row][col];
    if (notes.has(value)) notes.delete(value);
    else notes.add(value);
}

function setCellValue(value) {
    if (!selectedCell || !puzzleActive || puzzleSolved) return;

    const { row, col } = selectedCell;
    if (puzzleBoard[row][col] !== 0) return;

    if (value === 0) {
        userBoard[row][col] = 0;
        notesBoard[row][col].clear();
        statusTextEl.textContent = 'Entry removed';
        renderBoard();
        return;
    }

    if (notesMode) {
        toggleNote(value);
        statusTextEl.textContent = `Pencil mark ${value} ${notesBoard[row][col].has(value) ? 'added' : 'removed'}`;
    } else {
        userBoard[row][col] = value;
        notesBoard[row][col].clear();
        statusTextEl.textContent = `Placed ${value}`;
    }

    renderBoard();
}

function toggleNotesMode() {
    if (!puzzleActive || puzzleSolved) return;

    notesMode = !notesMode;
    notesToggleEl.classList.toggle('active', notesMode);
    notesToggleEl.setAttribute('aria-pressed', notesMode ? 'true' : 'false');
    notesToggleEl.textContent = `Notes: ${notesMode ? 'On' : 'Off'}`;
    statusTextEl.textContent = notesMode ? 'Notes mode enabled' : 'Notes mode disabled';
}

function clearEntries() {
    if (!puzzleActive || puzzleSolved) return;

    userBoard = deepCopy(puzzleBoard);
    notesBoard = emptyNotesBoard();
    statusTextEl.textContent = 'Your entries were cleared';
    renderBoard();
}

function recordAbandonIfNeeded() {
    if (puzzleActive && !puzzleSolved) {
        recordAttempt(false, 0);
    }
}

async function generatePuzzleStart() {
    if (isGenerating) return;

    isGenerating = true;
    completionEl.classList.add('hidden');

    statusTextEl.textContent = 'Generating puzzle...';
    selectedCell = null;
    notesMode = false;
    notesToggleEl.classList.remove('active');
    notesToggleEl.setAttribute('aria-pressed', 'false');
    notesToggleEl.textContent = 'Notes: Off';
    setButtonsEnabled(false);

    try {
        const clues = DIFFICULTY_CLUES[currentDifficulty];
        const generated = await requestPuzzle(clues);

        puzzleBoard = generated.puzzle;
        solutionBoard = generated.solution;
        userBoard = deepCopy(puzzleBoard);
        notesBoard = emptyNotesBoard();

        puzzleActive = true;
        puzzleSolved = false;
        startTimer();

        statusTextEl.textContent = `${currentDifficulty[0].toUpperCase()}${currentDifficulty.slice(1)} puzzle ready`;
        newGameBtnEl.textContent = 'Generate Puzzle';
        setButtonsEnabled(true);
        renderBoard();
    } catch (err) {
        statusTextEl.textContent = `Generation failed: ${err.message}`;
        puzzleActive = false;
        puzzleSolved = false;
        setButtonsEnabled(false);
        renderBoard();
    } finally {
        isGenerating = false;
    }
}

function maybeGeneratePuzzle(force = false) {
    if (!force && puzzleActive && !puzzleSolved) {
        const confirmed = window.confirm('Generate a new puzzle and abandon the current run?');
        if (!confirmed) return;
    }

    recordAbandonIfNeeded();
    stopTimer();
    generatePuzzleStart();
}

function handleDifficultyClick(btn) {
    const nextDifficulty = btn.dataset.difficulty;
    if (!nextDifficulty || nextDifficulty === currentDifficulty) return;

    const previousDifficulty = currentDifficulty;

    if (puzzleActive && !puzzleSolved) {
        const confirmed = window.confirm('Switch difficulty and generate a new puzzle now?');
        if (!confirmed) return;

        currentDifficulty = nextDifficulty;
        setDifficultyUI();
        recordAbandonIfNeeded();
        stopTimer();
        generatePuzzleStart();
        return;
    }

    currentDifficulty = nextDifficulty;
    setDifficultyUI();

    if (!puzzleActive) {
        statusTextEl.textContent = `Difficulty set to ${currentDifficulty}. Click Generate Puzzle.`;
    } else if (puzzleSolved) {
        statusTextEl.textContent = `Difficulty set to ${currentDifficulty}. Generate when ready.`;
    }

    if (!currentDifficulty) {
        currentDifficulty = previousDifficulty;
        setDifficultyUI();
    }
}

function setDifficultyUI() {
    document.querySelectorAll('.diff-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.difficulty === currentDifficulty);
    });
}

function buildShareText() {
    if (!lastCompletionSnapshot) return 'Sudoku Lab';

    const difficulty = `${lastCompletionSnapshot.difficulty[0].toUpperCase()}${lastCompletionSnapshot.difficulty.slice(1)}`;
    return [
        'Sudoku Lab Result',
        `Difficulty: ${difficulty}`,
        `Time: ${formatTime(lastCompletionSnapshot.solveSeconds)}`,
        `Conflicts: ${lastCompletionSnapshot.conflicts}`
    ].join('\n');
}

async function copyResult() {
    const text = buildShareText();
    try {
        await navigator.clipboard.writeText(text);
        statusTextEl.textContent = 'Result copied to clipboard.';
    } catch {
        statusTextEl.textContent = 'Clipboard unavailable. Result logged in console.';
        console.log(text);
    }
}

function handleKeydown(event) {
    if (event.key.toLowerCase() === 'n') {
        toggleNotesMode();
        return;
    }

    if (!selectedCell || !puzzleActive || puzzleSolved) return;

    if (/^[1-9]$/.test(event.key)) {
        setCellValue(Number(event.key));
        return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') {
        setCellValue(0);
        return;
    }

    const { row, col } = selectedCell;
    if (event.key === 'ArrowUp' && row > 0) selectedCell = { row: row - 1, col };
    if (event.key === 'ArrowDown' && row < SIZE - 1) selectedCell = { row: row + 1, col };
    if (event.key === 'ArrowLeft' && col > 0) selectedCell = { row, col: col - 1 };
    if (event.key === 'ArrowRight' && col < SIZE - 1) selectedCell = { row, col: col + 1 };
    renderBoard();
}

function bindEvents() {
    document.querySelectorAll('.diff-btn').forEach((btn) => {
        btn.addEventListener('click', () => handleDifficultyClick(btn));
    });

    newGameBtnEl.addEventListener('click', () => maybeGeneratePuzzle(false));
    clearBoardBtnEl.addEventListener('click', clearEntries);
    notesToggleEl.addEventListener('click', toggleNotesMode);

    document.querySelectorAll('.key-btn').forEach((btn) => {
        btn.addEventListener('click', () => setCellValue(Number(btn.dataset.value)));
    });

    playAgainBtnEl.addEventListener('click', () => {
        completionEl.classList.add('hidden');
        maybeGeneratePuzzle(true);
    });
    shareBtnEl.addEventListener('click', copyResult);
    sudokuStatsToggleEl.addEventListener('click', async () => {
        const opening = sudokuStatsPanelEl.classList.contains('hidden');
        sudokuStatsPanelEl.classList.toggle('hidden');
        sudokuStatsToggleEl.classList.toggle('active', opening);
        if (opening) {
            await loadSudokuStats();
        }
    });

    document.addEventListener('keydown', handleKeydown);
}

buildBoard();
bindEvents();
setDifficultyUI();
setButtonsEnabled(false);
renderBoard();
