-- EasyLingo Database Schema
-- SQLite database for desktop language learning app

-- Language modules (e.g., German, Japanese, English)
CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    flag TEXT, -- emoji flag
    created_at INTEGER DEFAULT (unixepoch())
);

-- Learning entries (words, phrases, sentences)
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    type TEXT CHECK(type IN ('word', 'phrase', 'sentence')),
    content TEXT NOT NULL, -- the actual word/phrase/sentence
    translation TEXT, -- translation
    explanation TEXT, -- explanation/markdown
    example TEXT, -- example sentence
    created_at INTEGER DEFAULT (unixepoch()),
    
    -- SRS (Spaced Repetition System) fields
    interval INTEGER DEFAULT 0, -- review interval in days
    ease_factor REAL DEFAULT 2.5, -- SM-2 ease factor
    repetitions INTEGER DEFAULT 0, -- consecutive successful reviews
    next_review INTEGER, -- next review timestamp
    last_review INTEGER, -- last review timestamp
    
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

-- Study logs for statistics
CREATE TABLE IF NOT EXISTS study_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT,
    action TEXT CHECK(action IN ('review', 'test')),
    quality INTEGER CHECK(quality >= 0 AND quality <= 5), -- SM-2 quality (0-5)
    duration INTEGER, -- time spent in seconds
    created_at INTEGER DEFAULT (unixepoch()),
    
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE SET NULL
);

-- User settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_entries_module ON entries(module_id);
CREATE INDEX IF NOT EXISTS idx_entries_next_review ON entries(next_review);
CREATE INDEX IF NOT EXISTS idx_study_logs_entry ON study_logs(entry_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_created ON study_logs(created_at);

-- Insert default modules (German, Japanese, English)
INSERT OR IGNORE INTO modules (id, name, flag) VALUES 
    ('german', '德语', '🇩🇪'),
    ('japanese', '日语', '🇯🇵'),
    ('english', '英语', '🇬🇧');

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('daily_limit', '20'),
    ('max_tokens', '8000');
