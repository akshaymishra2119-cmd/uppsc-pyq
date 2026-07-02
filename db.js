// ── PostgreSQL connection + table setup ──────────────────────
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.internal')
    ? false
    : { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        phone         TEXT,
        registered_on TIMESTAMPTZ DEFAULT NOW(),
        trial_expires_on TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
        subscription_paid_till TIMESTAMPTZ,
        status        TEXT DEFAULT 'trial',
      reset_otp         VARCHAR(6),
      reset_otp_expires TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS progress (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
        q_id         TEXT NOT NULL,
        subject      TEXT,
        year         TEXT,
        result       TEXT,
        time_taken   INTEGER DEFAULT 0,
        attempted_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mock_history (
        id                 SERIAL PRIMARY KEY,
        user_id            INTEGER REFERENCES users(id) ON DELETE CASCADE,
        taken_at           TIMESTAMPTZ DEFAULT NOW(),
        score              INTEGER,
        total              INTEGER,
        time_taken         INTEGER,
        subject_breakdown  JSONB,
        settings           JSONB
      );

      CREATE INDEX IF NOT EXISTS idx_progress_user    ON progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_progress_q_id    ON progress(q_id);
      CREATE INDEX IF NOT EXISTS idx_mock_user        ON mock_history(user_id);
    `);
    // Add OTP columns if not yet present (safe on existing DB)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp VARCHAR(6)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMPTZ`);
    // Add exam_date for countdown
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_date DATE`);
    // Add mode to progress for bifurcation (practice / quiz / mock)
    await client.query(`ALTER TABLE progress ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'practice'`);
    // Add quiz_id to progress for daily quiz grouping
    await client.query(`ALTER TABLE progress ADD COLUMN IF NOT EXISTS quiz_id TEXT`);
    // News items table (persistent, survives deploys)
    await client.query(`
      CREATE TABLE IF NOT EXISTS news_items (
        id         SERIAL PRIMARY KEY,
        type       TEXT NOT NULL,
        headline   TEXT NOT NULL,
        detail     TEXT,
        date       TEXT,
        category   TEXT,
        relevance  TEXT,
        source     TEXT,
        tags       TEXT,
        link       TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_news_type ON news_items(type)`);
    console.log('✅ Database tables ready');
  } catch (e) {
    console.error('❌ DB init error:', e.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
