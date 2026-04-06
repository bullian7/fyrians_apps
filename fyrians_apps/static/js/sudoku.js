const SIZE = 9;
const BOX = 3;

const DIFFICULTY_CLUES = {
    easy: 40,
    medium: 32,
    hard: 26
};

let currentDifficulty = 'easy';
let solutionBoard = [];
let puzzleBoard = [];
let userBoard = [];
let notesBoard = [];
let selectedCell = null;
let notesMode = false;

const boardEl = document.getElementById('sudoku-board');
const statusTextEl = document.getElementById('status-text');
const mistakeTextEl = document.getElementById('mistake-text');
const notesToggleEl = document.getElementById('notes-toggle');
const newGameBtnEl = document.getElementById('new-game-btn');
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

function coordsFromIndex(index) {
    return [Math.floor(index / SIZE), index % SIZE];
}

function getHighlightedValue() {
    if (!selectedCell) return null;
    const selectedValue = userBoard[selectedCell.row][selectedCell.col];
    return selectedValue !== 0 ? selectedValue : null;
}

function renderCell(row, col, el, highlightValue) {
    el.classList.remove('given', 'selected', 'peer', 'conflict', 'same-value');

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

function renderBoard() {
    const highlightValue = getHighlightedValue();
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
        const [row, col] = coordsFromIndex(index);
        renderCell(row, col, cell, highlightValue);
    });

    const conflicts = getConflictCount();
    mistakeTextEl.textContent = `Conflicts: ${conflicts}`;
    updateKeypadState();

    if (isSolved()) {
        statusTextEl.textContent = 'Congrats! Puzzle complete. Start a new one whenever you are ready.';
        if (newGameBtnEl) {
            newGameBtnEl.textContent = 'Start New Puzzle';
        }
    }
}

function updateKeypadState() {
    const counts = Array(10).fill(0);
    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            const value = userBoard[row][col];
            if (value >= 1 && value <= 9) counts[value] += 1;
        }
    }

    document.querySelectorAll('.key-btn[data-value]').forEach((btn) => {
        const value = Number(btn.dataset.value);
        if (value < 1 || value > 9) return;

        const done = counts[value] >= 9;
        btn.classList.toggle('done', done);
    });
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
                selectedCell = { row, col };
                renderBoard();
            });

            boardEl.appendChild(cell);
        }
    }
}

function toggleNote(value) {
    if (!selectedCell) return;
    const { row, col } = selectedCell;
    if (puzzleBoard[row][col] !== 0) return;

    const notes = notesBoard[row][col];
    if (notes.has(value)) notes.delete(value);
    else notes.add(value);
}

function setCellValue(value) {
    if (!selectedCell) return;

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

function getConflictCount() {
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
    for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
            if (userBoard[row][col] !== solutionBoard[row][col]) return false;
        }
    }
    return true;
}

function toggleNotesMode() {
    notesMode = !notesMode;
    notesToggleEl.classList.toggle('active', notesMode);
    notesToggleEl.setAttribute('aria-pressed', notesMode ? 'true' : 'false');
    notesToggleEl.textContent = `Notes: ${notesMode ? 'On' : 'Off'}`;
    statusTextEl.textContent = notesMode ? 'Notes mode enabled' : 'Notes mode disabled';
}

function clearEntries() {
    userBoard = deepCopy(puzzleBoard);
    notesBoard = emptyNotesBoard();
    statusTextEl.textContent = 'Your entries were cleared';
    renderBoard();
}

async function newGame() {
    statusTextEl.textContent = 'Generating puzzle...';
    if (newGameBtnEl) {
        newGameBtnEl.textContent = 'New Puzzle';
    }

    try {
        const clues = DIFFICULTY_CLUES[currentDifficulty];
        const generated = await requestPuzzle(clues);
        puzzleBoard = generated.puzzle;
        solutionBoard = generated.solution;
        userBoard = deepCopy(puzzleBoard);
        notesBoard = emptyNotesBoard();
        selectedCell = null;

        statusTextEl.textContent = `${currentDifficulty[0].toUpperCase()}${currentDifficulty.slice(1)} puzzle ready`;
        renderBoard();
    } catch (err) {
        statusTextEl.textContent = `Generation failed: ${err.message}`;
    }
}

function handleKeydown(event) {
    if (event.key.toLowerCase() === 'n') {
        toggleNotesMode();
        return;
    }

    if (!selectedCell) return;

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
        btn.addEventListener('click', () => {
            document.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            currentDifficulty = btn.dataset.difficulty;
            newGame();
        });
    });

    document.getElementById('new-game-btn').addEventListener('click', newGame);
    document.getElementById('clear-board-btn').addEventListener('click', clearEntries);
    notesToggleEl.addEventListener('click', toggleNotesMode);

    document.querySelectorAll('.key-btn').forEach((btn) => {
        btn.addEventListener('click', () => setCellValue(Number(btn.dataset.value)));
    });

    document.addEventListener('keydown', handleKeydown);
}

buildBoard();
bindEvents();
newGame();
