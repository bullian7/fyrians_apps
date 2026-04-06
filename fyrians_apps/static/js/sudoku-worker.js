const SIZE = 9;
const BOX = 3;

function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function deepCopy(board) {
    return board.map((row) => [...row]);
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

self.addEventListener('message', (event) => {
    const { id, cluesTarget } = event.data || {};

    try {
        const data = generatePuzzle(cluesTarget);
        self.postMessage({ id, puzzle: data.puzzle, solution: data.solution });
    } catch (error) {
        self.postMessage({ id, error: error.message || 'Worker generation failed' });
    }
});
