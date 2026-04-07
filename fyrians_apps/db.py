import sqlite3
from pathlib import Path

from flask import current_app, g, session


def _db_path():
    configured = current_app.config.get('DATABASE')
    if configured:
        return configured
    app_root = Path(current_app.root_path)
    return str(app_root / 'fyrians_apps.db')


def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(_db_path())
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_error=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            passcode_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS fyrdle_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            won INTEGER NOT NULL,
            guesses_used INTEGER NOT NULL,
            max_guesses INTEGER NOT NULL,
            mode TEXT NOT NULL,
            hard_mode INTEGER NOT NULL,
            elapsed_seconds INTEGER NOT NULL,
            solution TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_fyrdle_games_user_time ON fyrdle_games(user_id, played_at DESC);

        CREATE TABLE IF NOT EXISTS typing_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            mode TEXT NOT NULL,
            time_limit INTEGER NOT NULL,
            punctuation INTEGER NOT NULL,
            raw_wpm REAL NOT NULL,
            net_wpm REAL NOT NULL,
            accuracy REAL NOT NULL,
            correct_words INTEGER NOT NULL,
            incorrect_words INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_typing_tests_user_time ON typing_tests(user_id, played_at DESC);

        CREATE TABLE IF NOT EXISTS sudoku_games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            difficulty TEXT NOT NULL,
            solved INTEGER NOT NULL,
            solve_seconds INTEGER NOT NULL,
            conflicts INTEGER NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_sudoku_games_user_time ON sudoku_games(user_id, played_at DESC);

        CREATE TABLE IF NOT EXISTS schedule_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            label TEXT,
            num_students INTEGER NOT NULL,
            payload_json TEXT NOT NULL,
            result_json TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_schedule_runs_user_time ON schedule_runs(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reaction_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reaction_ms INTEGER,
            false_start INTEGER NOT NULL DEFAULT 0,
            input_method TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reaction_tests_user_time ON reaction_tests(user_id, played_at DESC);

        CREATE TABLE IF NOT EXISTS quote_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_quote_folders_user_time ON quote_folders(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            folder_id INTEGER NOT NULL,
            said_by TEXT NOT NULL,
            quote_text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(folder_id) REFERENCES quote_folders(id)
        );
        CREATE INDEX IF NOT EXISTS idx_quotes_folder_time ON quotes(folder_id, created_at DESC);
        """
    )
    db.commit()


def load_current_user():
    user_id = session.get('user_id')
    if not user_id:
        g.current_user = None
        return

    row = get_db().execute(
        'SELECT id, username, created_at FROM users WHERE id = ?',
        (user_id,),
    ).fetchone()
    g.current_user = dict(row) if row else None
    if row is None:
        session.pop('user_id', None)


def init_app(app):
    app.teardown_appcontext(close_db)
    app.before_request(load_current_user)

    with app.app_context():
        init_db()
