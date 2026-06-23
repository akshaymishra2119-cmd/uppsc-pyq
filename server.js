// ============================================================
// UPPSC STUDY PORTAL — Local Dev Server
// Mirrors all Apps Script backend functions as Express routes.
// Run: node server.js  →  http://localhost:3000
// ============================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const PORT   = process.env.PORT || 3000;
const DB     = path.join(__dirname, 'db.json');

app.use(express.json({ strict: false }));

// ── DB HELPERS ────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB)) {
    const init = { questions: [], currentAffairs: [], progress: [], leaderboard: [] };
    fs.writeFileSync(DB, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

function formatDate(d) {
  if (!d) return '';
  const date   = new Date(d);
  if (isNaN(date)) return String(d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// ── SERVE HTML WITH INJECTED MOCK ─────────────────────────────
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  // Inject mock before any other scripts
  html = html.replace(/<head>/i, '<head>\n  <script src="/google-mock.js"></script>');
  res.send(html);
});

app.get('/google-mock.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'google-script-mock.js'));
});

// ── API: getQuestions ─────────────────────────────────────────
app.post('/api/getQuestions', (req, res) => {
  const filters = req.body || {};
  const db      = loadDB();
  let rows      = [...db.questions];

  if (filters.subject    && filters.subject    !== 'all') rows = rows.filter(r => r.subject    === filters.subject);
  if (filters.year       && filters.year       !== 'all') rows = rows.filter(r => String(r.year) === String(filters.year));
  if (filters.difficulty && filters.difficulty !== 'all') rows = rows.filter(r => r.difficulty === filters.difficulty);
  if (filters.zone       && filters.zone       !== 'all') rows = rows.filter(r => r.zone       === filters.zone);
  if (filters.repeating) rows = rows.filter(r => String(r.repeatsIn || '').includes(','));

  if (filters.shuffle) {
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
  }

  rows = rows.slice(0, filters.limit || 150);
  res.json(rows);
});

// ── API: getCurrentAffairs ────────────────────────────────────
app.post('/api/getCurrentAffairs', (req, res) => {
  const filters = req.body || {};
  const db      = loadDB();
  let rows      = [...db.currentAffairs].reverse();

  if (filters.category && filters.category !== 'all')
    rows = rows.filter(r => r.category === filters.category);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(r =>
      String(r.headline).toLowerCase().includes(q) ||
      String(r.detail).toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

// ── API: addCurrentAffair ─────────────────────────────────────
app.post('/api/addCurrentAffair', (req, res) => {
  const db = loadDB();
  db.currentAffairs.push({ ...req.body, date: formatDate(req.body.date || new Date()) });
  saveDB(db);
  res.json({ success: true });
});

// ── API: saveProgress ─────────────────────────────────────────
app.post('/api/saveProgress', (req, res) => {
  const db = loadDB();
  db.progress.push({ ...req.body, date: new Date().toISOString() });
  _syncLeaderboard(db, req.body.userName);
  saveDB(db);
  res.json({ success: true });
});

// ── API: saveBulkProgress ─────────────────────────────────────
app.post('/api/saveBulkProgress', (req, res) => {
  const db      = loadDB();
  const entries = Array.isArray(req.body) ? req.body : [];
  entries.forEach(e => db.progress.push({ ...e, date: new Date().toISOString() }));
  if (entries.length > 0) _syncLeaderboard(db, entries[0].userName);
  saveDB(db);
  res.json({ success: true });
});

// ── API: getUserProgress ──────────────────────────────────────
app.post('/api/getUserProgress', (req, res) => {
  const userName = req.body;
  const db       = loadDB();
  const rows     = db.progress.filter(r => r.userName === userName);

  if (rows.length === 0) {
    return res.json({ total: 0, correct: 0, wrong: 0, skipped: 0,
                      accuracy: 0, streak: 0, subjects: {},
                      projected: 0, questionsAttempted: 0 });
  }

  const total   = rows.length;
  const correct = rows.filter(r => r.result === 'correct').length;
  const wrong   = rows.filter(r => r.result === 'wrong').length;
  const skipped = rows.filter(r => r.result === 'skipped').length;
  const accuracy = (correct + wrong) > 0 ? Math.round(correct / (correct + wrong) * 100) : 0;

  const subjects = {};
  rows.forEach(r => {
    if (!subjects[r.subject]) subjects[r.subject] = { correct: 0, wrong: 0, total: 0 };
    subjects[r.subject].total++;
    if (r.result === 'correct') subjects[r.subject].correct++;
    if (r.result === 'wrong')   subjects[r.subject].wrong++;
  });

  // Streak
  const dates = [...new Set(rows.map(r => new Date(r.date).toDateString()))].sort().reverse();
  let streak = 0;
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (dates[0] === today || dates[0] === yesterday) {
    streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i-1]) - new Date(dates[i])) / 86400000;
      if (diff <= 1.5) streak++;
      else break;
    }
  }

  res.json({
    total, correct, wrong, skipped, accuracy, streak, subjects,
    projected: Math.max(0, Math.round(correct - wrong * 0.33)),
    questionsAttempted: correct + wrong
  });
});

// ── API: getLeaderboard ───────────────────────────────────────
app.post('/api/getLeaderboard', (req, res) => {
  const db = loadDB();
  res.json(db.leaderboard.sort((a, b) => b.score - a.score).slice(0, 20));
});

// ── API: getStats ─────────────────────────────────────────────
app.post('/api/getStats', (req, res) => {
  const db = loadDB();
  res.json({ totalQuestions: db.questions.length, totalCA: db.currentAffairs.length });
});

// ── API: getAnalytics ─────────────────────────────────────────
app.post('/api/getAnalytics', (req, res) => {
  const db = loadDB();
  const qs = db.questions;

  const yearCounts     = {};
  const subjectCounts  = {};
  const difficulty     = { Easy: 0, Medium: 0, Hard: 0 };
  const yearSubject    = {};   // { year: { subject: count } }
  let repeatingCount   = 0;

  qs.forEach(q => {
    const yr  = String(q.year  || 'Unknown');
    const sub = String(q.subject || 'Other');
    const dif = String(q.difficulty || '');

    // Year counts
    yearCounts[yr] = (yearCounts[yr] || 0) + 1;

    // Subject counts
    subjectCounts[sub] = (subjectCounts[sub] || 0) + 1;

    // Difficulty
    if (dif === 'Easy')   difficulty.Easy++;
    else if (dif === 'Medium') difficulty.Medium++;
    else if (dif === 'Hard')   difficulty.Hard++;

    // Year × Subject matrix
    if (!yearSubject[yr]) yearSubject[yr] = {};
    yearSubject[yr][sub] = (yearSubject[yr][sub] || 0) + 1;

    // Repeating
    if (String(q.repeatsIn || '').includes(',')) repeatingCount++;
  });

  res.json({ yearCounts, subjectCounts, difficulty, yearSubject, repeatingCount, total: qs.length });
});

// ── API: getDailyQuiz ─────────────────────────────────────────
app.post('/api/getDailyQuiz', (req, res) => {
  const { count = 10, usePYQ = true, useCA = true } = req.body || {};
  const db = loadDB();
  if (!db.dailyQuizQuestions) db.dailyQuizQuestions = [];

  let pool = [];

  // Add PYQ questions
  if (usePYQ && db.questions.length) {
    const pyqPool = [...db.questions].sort(() => Math.random() - 0.5);
    pool = pool.concat(pyqPool.map(q => ({ ...q, source: 'PYQ' })));
  }

  // Add daily news MCQ questions
  if (useCA && db.dailyQuizQuestions.length) {
    pool = pool.concat(db.dailyQuizQuestions.map(q => ({ ...q, source: 'Daily News' })));
  }

  if (!pool.length) return res.json([]);

  // Shuffle and slice to requested count
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Try to include at least some Daily News Qs if both selected
  let result = [];
  if (usePYQ && useCA && db.dailyQuizQuestions.length) {
    const caQs  = pool.filter(q => q.source === 'Daily News').slice(0, Math.min(5, count));
    const pyqQs = pool.filter(q => q.source === 'PYQ').slice(0, count - caQs.length);
    result = [...caQs, ...pyqQs].sort(() => Math.random() - 0.5);
  } else {
    result = pool.slice(0, count);
  }

  res.json(result.slice(0, count));
});

// ── API: getUPPSCNews ─────────────────────────────────────────
app.post('/api/getUPPSCNews', (req, res) => {
  const filters = req.body || {};
  const db      = loadDB();
  if (!db.uppscNews) db.uppscNews = [];
  let rows = [...db.uppscNews].reverse();
  if (filters.category && filters.category !== 'all')
    rows = rows.filter(r => r.category === filters.category);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(r =>
      String(r.headline).toLowerCase().includes(q) ||
      String(r.detail).toLowerCase().includes(q)
    );
  }
  res.json(rows);
});

// ── API: bulkAddUPPSCNews ─────────────────────────────────────
app.post('/api/bulkAddUPPSCNews', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.json({ success: false, error: 'No rows provided' });
  const db = loadDB();
  if (!db.uppscNews) db.uppscNews = [];
  rows.forEach(r => db.uppscNews.push({ ...r, date: formatDate(r.date || new Date()) }));
  saveDB(db);
  res.json({ success: true, added: rows.length });
});

// ── API: bulkAddCurrentAffairs ────────────────────────────────
app.post('/api/bulkAddCurrentAffairs', (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.json({ success: false, error: 'No rows provided' });
  const db = loadDB();
  rows.forEach(r => db.currentAffairs.push({
    ...r,
    date: formatDate(r.date || new Date())
  }));
  saveDB(db);
  res.json({ success: true, added: rows.length });
});

// ── API: checkAdmin ───────────────────────────────────────────
app.post('/api/checkAdmin', (req, res) => {
  // In local dev, you are always admin
  res.json({ isAdmin: true, email: 'local@dev.local' });
});

// ── HELPER: sync leaderboard after progress save ──────────────
function _syncLeaderboard(db, userName) {
  const rows    = db.progress.filter(r => r.userName === userName);
  const correct = rows.filter(r => r.result === 'correct').length;
  const wrong   = rows.filter(r => r.result === 'wrong').length;
  const accuracy = (correct + wrong) > 0 ? Math.round(correct / (correct + wrong) * 100) : 0;
  const score    = Math.max(0, Math.round(correct - wrong * 0.33));

  const existing = db.leaderboard.find(r => r.name === userName);
  if (existing) {
    existing.score    = score;
    existing.accuracy = accuracy;
    existing.attempted = correct + wrong;
    existing.lastActive = formatDate(new Date());
  } else {
    db.leaderboard.push({
      name: userName, score, accuracy,
      attempted: correct + wrong,
      lastActive: formatDate(new Date())
    });
  }
}

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n✅ UPPSC Study Portal — Server started');
  console.log(`🌐 Listening on port ${PORT}`);
  console.log('📁 Data stored in: db.json');
  console.log('🔧 Admin mode: ON\n');
});
