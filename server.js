// ============================================================
// UPPSC STUDY PORTAL — Local Dev Server
// Run: node server.js  →  http://localhost:3000
// ============================================================

const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app    = express();
const PORT   = process.env.PORT || 3000;
const DB     = path.join(__dirname, 'db.json');
const USERS  = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'ghatna-chakra-secret-2026';

// ── GOOGLE SHEETS CONFIG ──────────────────────────────────────
const SHEET_ID  = '1K-XHrHic5of1qIp5vWCJUbYnDbzSVt4_7RZAN-yY_vw';
const SHEET_TAB = 'QUESTION_BANK';   // exact tab name in your sheet
const CACHE_TTL = 5 * 60 * 1000;    // 5 minutes

let _sheetsCache     = null;
let _sheetsCacheTime = 0;

// Fetch and parse Google Sheets public gviz endpoint (no API key needed)
function fetchSheetQuestions() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_TAB)}`;
    https.get(url, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          // Strip JSONP wrapper: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
          const jsonStr = raw.replace(/^[^{(]*\(/, '').replace(/\)[\s;]*$/, '').replace(/^[^{]*/, '');
          const parsed  = JSON.parse(jsonStr);

          console.log(`📊 Sheet rows: ${parsed.table.rows.length}, cols: ${parsed.table.cols.length}`);

          // Sheet has no header row — map by column POSITION (matches Code.js column order)
          // Col: 0=Q_ID 1=Year 2=Subject 3=Sub_Topic 4=Question 5=Opt_A 6=Opt_B 7=Opt_C
          //      8=Opt_D 9=Correct_Answer 10=Correct_Option_Text 11=Explanation
          //      12=Difficulty 13=Question_Type 14=Repeats_In 15=Zone
          const v = (row, i) => {
            const cell = row.c[i];
            return cell && cell.v !== null && cell.v !== undefined ? String(cell.v) : '';
          };

          const rows = parsed.table.rows.filter(row => v(row, 0).trim());

          // Map by column position (matches Code.js order exactly)
          const questions = rows.map(row => ({
            id:          v(row,  0),
            year:        v(row,  1),
            subject:     v(row,  2),
            subTopic:    v(row,  3),
            topic:       v(row,  3),
            question:    v(row,  4),
            optA:        v(row,  5),
            optB:        v(row,  6),
            optC:        v(row,  7),
            optD:        v(row,  8),
            answer:      v(row,  9),
            answerText:  v(row, 10),
            explanation: v(row, 11),
            difficulty:  v(row, 12) || 'Medium',
            qType:       v(row, 13),
            repeatsIn:   v(row, 14),   // use sheet's Repeats_In column directly
            zone:        v(row, 15),
          }));

          // repeatsIn already set from sheet col 14 — no recompute needed

          // Merge with db.json for questions not yet in the sheet
          let merged = questions;
          try {
            const db = loadDB();
            const sheetIds = new Set(questions.map(q => q.id));
            const dbOnly = (db.questions || []).filter(q => !sheetIds.has(q.id));
            if (dbOnly.length) {
              // db.json questions have richer 'topic' fields — prefer those
              merged = [...questions, ...dbOnly];
              console.log(`📦 Merged: ${questions.length} from sheet + ${dbOnly.length} from db.json`);
            }
          } catch(e) { /* db.json optional */ }

          // ── Compute repeatsIn dynamically across ALL merged questions ──
          // Use 'topic' if set (db.json questions), else 'subTopic' (sheet questions)
          // Skip generic catch-all values that would cause false positives
          const GENERIC = new Set(['general','other','unknown','','miscellaneous','mixed']);
          const topicYears = {};
          merged.forEach(q => {
            const t = ((q.topic && !GENERIC.has(q.topic.toLowerCase())) ? q.topic : q.subTopic || '').trim();
            if (!t || GENERIC.has(t.toLowerCase())) return;
            if (!topicYears[t]) topicYears[t] = new Set();
            topicYears[t].add(String(q.year));
          });
          merged.forEach(q => {
            const t = ((q.topic && !GENERIC.has(q.topic.toLowerCase())) ? q.topic : q.subTopic || '').trim();
            q.repeatsIn = (t && topicYears[t] && topicYears[t].size > 1)
              ? [...topicYears[t]].sort().join(',')
              : '';
          });
          const repeatCount = merged.filter(q => q.repeatsIn.includes(',')).length;
          console.log(`🔁 Repeating topics computed: ${repeatCount} questions flagged`);

          _sheetsCache     = merged;
          _sheetsCacheTime = Date.now();
          console.log(`✅ Sheet synced: ${merged.length} questions loaded`);
          resolve(merged);
        } catch (err) {
          reject(new Error('Sheet parse error: ' + err.message));
        }
      });
    }).on('error', reject);
  });
}

// Return cached questions, fetching fresh if TTL expired
async function getSheetQuestions() {
  if (_sheetsCache && (Date.now() - _sheetsCacheTime) < CACHE_TTL) {
    return _sheetsCache;
  }
  return fetchSheetQuestions();
}

// Load questions — sheet first, db.json fallback
async function loadQuestions() {
  try {
    return await getSheetQuestions();
  } catch (err) {
    console.warn('⚠️  Sheet fetch failed, falling back to db.json:', err.message);
    const db = loadDB();
    return db.questions || [];
  }
}

// Pre-warm cache on startup (non-blocking)
loadQuestions().catch(err => console.warn('Startup sheet fetch failed:', err.message));

app.use(express.json({ strict: false }));
app.use(cookieParser());

// ── USERS DB HELPERS ──────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS)) {
    fs.writeFileSync(USERS, JSON.stringify({ users: [] }, null, 2));
    return { users: [] };
  }
  return JSON.parse(fs.readFileSync(USERS, 'utf8'));
}
function saveUsers(data) { fs.writeFileSync(USERS, JSON.stringify(data, null, 2)); }

// ── JWT MIDDLEWARE ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired, please login again' }); }
}

// ── REGISTER ──────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
  const data = loadUsers();
  if (data.users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(400).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now().toString(), name: name.trim(), email: email.toLowerCase().trim(),
                 password: hash, createdAt: new Date().toISOString(), attempts: [] };
  data.users.push(user);
  saveUsers(data);
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 30*24*60*60*1000 });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const data = loadUsers();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(400).json({ error: 'Email not registered' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Incorrect password' });
  const expiresIn = rememberMe ? '30d' : '1d';
  const maxAge    = rememberMe ? 30*24*60*60*1000 : 24*60*60*1000;
  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn });
  res.cookie('token', token, { httpOnly: true, maxAge });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

// ── LOGOUT ────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

// ── CHECK SESSION ─────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ loggedIn: false });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ loggedIn: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch { res.json({ loggedIn: false }); }
});

// ── SAVE ATTEMPT ──────────────────────────────────────────────
app.post('/api/saveAttempt', authMiddleware, (req, res) => {
  const data = loadUsers();
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.attempts) user.attempts = [];
  user.attempts.push({ ...req.body, date: new Date().toISOString() });
  saveUsers(data);
  res.json({ success: true });
});

// ── MY STATS ─────────────────────────────────────────────────
app.get('/api/myStats', authMiddleware, (req, res) => {
  const data = loadUsers();
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const attempts = user.attempts || [];
  const correct  = attempts.filter(a => a.result === 'correct').length;
  const wrong    = attempts.filter(a => a.result === 'wrong').length;
  const accuracy = (correct+wrong)>0 ? Math.round(correct/(correct+wrong)*100) : 0;
  const today    = new Date().toDateString();
  const yest     = new Date(Date.now()-86400000).toDateString();
  const todayA   = attempts.filter(a => new Date(a.date).toDateString()===today);
  const yestA    = attempts.filter(a => new Date(a.date).toDateString()===yest);
  const tC=todayA.filter(a=>a.result==='correct').length, tW=todayA.filter(a=>a.result==='wrong').length;
  const yC=yestA.filter(a=>a.result==='correct').length,  yW=yestA.filter(a=>a.result==='wrong').length;
  const subjects = {};
  attempts.forEach(a => {
    if (!a.subject) return;
    if (!subjects[a.subject]) subjects[a.subject]={correct:0,wrong:0,total:0};
    subjects[a.subject].total++;
    if (a.result==='correct') subjects[a.subject].correct++;
    if (a.result==='wrong')   subjects[a.subject].wrong++;
  });
  const dailyMap = {};
  attempts.forEach(a => {
    const d=new Date(a.date).toDateString();
    if (!dailyMap[d]) dailyMap[d]={correct:0,wrong:0,total:0};
    dailyMap[d].total++;
    if (a.result==='correct') dailyMap[d].correct++;
    if (a.result==='wrong')   dailyMap[d].wrong++;
  });
  const dates=Object.keys(dailyMap).sort((a,b)=>new Date(b)-new Date(a));
  let streak=0;
  if (dates[0]===today||dates[0]===yest) {
    streak=1;
    for (let i=1;i<dates.length;i++) {
      if ((new Date(dates[i-1])-new Date(dates[i]))/86400000<=1.5) streak++;
      else break;
    }
  }
  res.json({
    total: attempts.length, correct, wrong, accuracy, streak,
    projected: Math.max(0, correct-Math.round(wrong*0.33)),
    today:     { total:todayA.length, correct:tC, wrong:tW, accuracy:(tC+tW)>0?Math.round(tC/(tC+tW)*100):0 },
    yesterday: { total:yestA.length,  correct:yC, wrong:yW, accuracy:(yC+yW)>0?Math.round(yC/(yC+yW)*100):0 },
    subjects, dailyHistory: dailyMap
  });
});

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

// ── NEWS IMAGES — read from Google Sheet tab NEWS_IMAGES ──────
// Sheet columns: 0=URL  1=Caption(optional)
// On local dev, also serves files from ./news_images/ folder as fallback
const NEWS_IMAGES_DIR = path.join(__dirname, 'news_images');
if (!fs.existsSync(NEWS_IMAGES_DIR)) fs.mkdirSync(NEWS_IMAGES_DIR);
app.use('/news_images', express.static(NEWS_IMAGES_DIR));

let _imgCache = null;
let _imgCacheTime = 0;

function fetchNewsImagesFromSheet() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=NEWS_IMAGES`;
    https.get(url, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const jsonStr = raw.replace(/^[^{(]*\(/, '').replace(/\)[\s;]*$/, '').replace(/^[^{]*/, '');
          const parsed  = JSON.parse(jsonStr);
          const v = (row, i) => {
            const cell = row.c[i];
            return cell && cell.v !== null ? String(cell.v).trim() : '';
          };
          const urls = parsed.table.rows
            .map(row => ({ url: v(row, 0), caption: v(row, 1) }))
            .filter(r => r.url && r.url.startsWith('http'));
          resolve(urls);
        } catch(e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

app.get('/api/newsImages', async (req, res) => {
  const now = Date.now();
  if (_imgCache && now - _imgCacheTime < CACHE_TTL) return res.json(_imgCache);
  try {
    const sheetImgs = await fetchNewsImagesFromSheet();
    // Also include local folder images as fallback / supplement
    let localImgs = [];
    try {
      localImgs = fs.readdirSync(NEWS_IMAGES_DIR)
        .filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f))
        .map(f => ({ url: `/news_images/${f}`, caption: '' }));
    } catch(e) {}
    _imgCache = [...sheetImgs, ...localImgs];
    _imgCacheTime = now;
    res.json(_imgCache);
  } catch(e) {
    // Sheet failed — fall back to local folder only
    try {
      const localImgs = fs.readdirSync(NEWS_IMAGES_DIR)
        .filter(f => /\.(png|jpg|jpeg|webp|gif)$/i.test(f))
        .map(f => ({ url: `/news_images/${f}`, caption: '' }));
      res.json(localImgs);
    } catch(e2) { res.json([]); }
  }
});

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
app.post('/api/getQuestions', async (req, res) => {
  try {
    const filters = req.body || {};
    let rows = await loadQuestions();

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

    rows = rows.slice(0, filters.limit || 2000);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
app.post('/api/getAnalytics', async (req, res) => {
  try {
    const qs = await loadQuestions();

    const yearCounts     = {};
    const subjectCounts  = {};
    const difficulty     = { Easy: 0, Medium: 0, Hard: 0 };
    const yearSubject    = {};
    let repeatingCount   = 0;

    qs.forEach(q => {
      const yr  = String(q.year    || 'Unknown');
      const sub = String(q.subject || 'Other');
      const dif = String(q.difficulty || '');

      yearCounts[yr]  = (yearCounts[yr]  || 0) + 1;
      subjectCounts[sub] = (subjectCounts[sub] || 0) + 1;

      if (dif === 'Easy')        difficulty.Easy++;
      else if (dif === 'Medium') difficulty.Medium++;
      else if (dif === 'Hard')   difficulty.Hard++;

      if (!yearSubject[yr]) yearSubject[yr] = {};
      yearSubject[yr][sub] = (yearSubject[yr][sub] || 0) + 1;

      if (String(q.repeatsIn || '').includes(',')) repeatingCount++;
    });

    res.json({ yearCounts, subjectCounts, difficulty, yearSubject, repeatingCount, total: qs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: syncSheet — force refresh from Google Sheets ─────────
app.post('/api/syncSheet', async (req, res) => {
  try {
    _sheetsCache     = null;  // invalidate cache
    _sheetsCacheTime = 0;
    const qs = await fetchSheetQuestions();
    res.json({ success: true, count: qs.length, message: `Synced ${qs.length} questions from Google Sheet` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: getDailyQuiz ─────────────────────────────────────────
app.post('/api/getDailyQuiz', async (req, res) => {
  const { count = 10, usePYQ = true, useCA = true } = req.body || {};
  const db = loadDB();
  if (!db.dailyQuizQuestions) db.dailyQuizQuestions = [];

  let pool = [];

  // Add PYQ questions from sheet (with db fallback)
  if (usePYQ) {
    const sheetQs = await loadQuestions().catch(() => db.questions || []);
    const pyqPool = [...sheetQs].sort(() => Math.random() - 0.5);
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

// ── API: getDigest — fetch DAILY_DIGEST sheet tab ────────────
let _digestCache = null;
let _digestCacheTime = 0;
const DIGEST_TAB = 'DAILY_DIGEST';

function fetchDigest() {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(DIGEST_TAB)}`;
    https.get(url, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const jsonStr = raw.replace(/^[^{(]*\(/, '').replace(/\)[\s;]*$/, '').replace(/^[^{]*/, '');
          const parsed  = JSON.parse(jsonStr);
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const v = (row, i) => {
            const cell = row.c[i];
            if (!cell || cell.v === null || cell.v === undefined) return '';
            // gviz returns dates as "Date(YYYY,M,D)" with 0-indexed month
            const dm = String(cell.v).match(/^Date\((\d+),(\d+),(\d+)\)$/);
            if (dm) return `${parseInt(dm[3])} ${MONTHS[parseInt(dm[2])]} ${dm[1]}`;
            // Use formatted value if available (already a nice string)
            if (cell.f) return String(cell.f).trim();
            return String(cell.v).trim();
          };
          // New schema: 0=Date 1=Type(UPPSC|CA) 2=Question 3=Answer 4=Subject
          const rows = parsed.table.rows.filter(row => v(row, 0) && v(row, 1) && v(row, 2));

          // Group by date preserving insertion order
          const byDate = {};
          const dateOrder = [];
          rows.forEach(row => {
            const date = v(row, 0);
            const type = v(row, 1).toUpperCase(); // UPPSC or CA
            const item = { q: v(row, 2), ans: v(row, 3), sub: v(row, 4) };
            if (!byDate[date]) {
              byDate[date] = { date, uppsc: [], ca: [] };
              dateOrder.push(date);
            }
            if (type === 'UPPSC') byDate[date].uppsc.push(item);
            else if (type === 'CA') byDate[date].ca.push(item);
          });

          // Newest first
          resolve(dateOrder.reverse().map(d => byDate[d]));
        } catch(e) { reject(e); }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

app.get('/api/digest', async (req, res) => {
  const now = Date.now();
  if (_digestCache && now - _digestCacheTime < CACHE_TTL) {
    return res.json(_digestCache);
  }
  try {
    _digestCache = await fetchDigest();
    _digestCacheTime = now;
    res.json(_digestCache);
  } catch(e) {
    console.error('Digest fetch error:', e.message);
    res.json([]);
  }
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

// ── API: ingestNews — POST scraped items into db.json ─────────
// Called by scraper.js cron or Claude scheduled task
app.post('/api/ingestNews', (req, res) => {
  try {
    const { uppscNews = [], currentAffairs = [], source = 'auto-scraper' } = req.body;
    if (!uppscNews.length && !currentAffairs.length) {
      return res.json({ ok: false, message: 'No items provided' });
    }

    const db      = loadDB();
    const dateStr = uppscNews[0]?.date || currentAffairs[0]?.date || '';

    // Deduplicate by headline — don't re-add same day's headlines
    const existingUP = new Set((db.uppscNews    || []).map(n => n.headline));
    const existingCA = new Set((db.currentAffairs || []).map(n => n.headline));

    const newUP = uppscNews.filter(n => !existingUP.has(n.headline));
    const newCA = currentAffairs.filter(n => !existingCA.has(n.headline));

    db.uppscNews     = [...(db.uppscNews    || []), ...newUP];
    db.currentAffairs = [...(db.currentAffairs || []), ...newCA];

    // Keep only last 90 days of news (avoid bloat)
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const inRange = item => { try { return new Date(item.date) >= cutoff; } catch { return true; } };
    db.uppscNews      = db.uppscNews.filter(inRange);
    db.currentAffairs = db.currentAffairs.filter(inRange);

    saveDB(db);
    console.log(`📥 ingestNews [${source}]: +${newUP.length} UPPSC, +${newCA.length} CA  (date: ${dateStr})`);
    res.json({ ok: true, added: { uppsc: newUP.length, ca: newCA.length }, date: dateStr });
  } catch (e) {
    console.error('ingestNews error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── API: scrapeStatus — last scrape summary ───────────────────
let _lastScrapeReport = null;
app.get('/api/scrapeStatus', (req, res) => {
  res.json(_lastScrapeReport || { status: 'never_run', message: 'No scrape has run yet' });
});

// ── Cron disabled on Railway (no node-cron dependency) ─────────
// Scraping is handled by Claude scheduled tasks via /api/ingestNews

// ── LEFT PANEL — local docx readers ──────────────────────────
const mammoth = require('mammoth');

const LEFT_PANEL_DIRS = {
  editorial: 'D:\\editorial_national',
  upnews:    'D:\\Editorial_UP',
  mcq:       'D:\\1_liner_UPPSC',
};
const LEFT_PANEL_PREFIX = { editorial: 'CA_', upnews: 'UPPSC_', mcq: 'Questions_' };

function getTodayDocx(type) {
  const dir    = LEFT_PANEL_DIRS[type];
  const prefix = LEFT_PANEL_PREFIX[type];
  if (!fs.existsSync(dir)) return null;
  const today  = new Date();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const name   = `${prefix}${today.getDate()}${months[today.getMonth()]}${today.getFullYear()}.docx`;
  const exact  = path.join(dir, name);
  if (fs.existsSync(exact)) return exact;
  // fallback: most recent docx in folder
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.docx'))
      .sort();
    if (files.length) return path.join(dir, files[files.length - 1]);
  } catch(e) {}
  return null;
}

async function parseDocxText(filepath) {
  const result = await mammoth.extractRawText({ path: filepath });
  return result.value;
}

// Parse editorial text → array of {title, bullets[], takeaway}
function parseEditorial(text) {
  const sections = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let current = null;
  for (const line of lines) {
    // Numbered section heading like "1. India–New Zealand FTA"
    if (/^\d+\.\s+[A-Z]/.test(line)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^\d+\.\s+/, ''), bullets: [], takeaway: '' };
    } else if (current && /^Takeaway:/i.test(line)) {
      current.takeaway = line.replace(/^Takeaway:\s*/i, '');
    } else if (current) {
      current.bullets.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// Parse UP news text → array of {category, headline, detail}
function parseUPNews(text) {
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let category = 'General';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Category headers (short, no period, title-case)
    if (line.length < 50 && !line.endsWith('.') && /^[A-Z]/.test(line) && !/^\d/.test(line) && !line.startsWith('Source')) {
      category = line;
    } else if (/^[A-Z]/.test(line) && line.length > 40) {
      // Headline — next lines are detail
      const detail = [];
      let j = i + 1;
      while (j < lines.length && lines[j].length > 20 && /^[A-Za-z]/.test(lines[j]) && !/^[A-Z][a-z]+ [A-Z]/.test(lines[j])) {
        detail.push(lines[j]);
        j++;
      }
      items.push({ category, headline: line, detail: detail.join(' ').slice(0, 250) });
      i = j;
      continue;
    }
    i++;
  }
  return items;
}

// Parse MCQ text → array of {qno, question, options:{a,b,c,d}, answer}
function parseMCQ(text) {
  const questions = [];
  const blocks = text.split(/(?=Q\d+\.)/);
  for (const block of blocks) {
    const qMatch = block.match(/Q(\d+)\.\s*([\s\S]*?)(?=\(a\))/i);
    const aMatch = block.match(/\(a\)\s*(.+)/i);
    const bMatch = block.match(/\(b\)\s*(.+)/i);
    const cMatch = block.match(/\(c\)\s*(.+)/i);
    const dMatch = block.match(/\(d\)\s*(.+)/i);
    const ansMatch = block.match(/Answer:\s*\(([abcd])\)/i);
    if (qMatch && ansMatch) {
      questions.push({
        qno:      parseInt(qMatch[1]),
        question: qMatch[2].trim(),
        options:  {
          a: aMatch ? aMatch[1].trim() : '',
          b: bMatch ? bMatch[1].trim() : '',
          c: cMatch ? cMatch[1].trim() : '',
          d: dMatch ? dMatch[1].trim() : '',
        },
        answer: ansMatch[1].toLowerCase(),
      });
    }
  }
  return questions;
}

// Helper: parse docx → items, save to db.json, return items
async function getStudyItems(type, parseFn) {
  const file = getTodayDocx(type);
  if (file) {
    // Running locally — read docx, save to db.json so Railway can serve it
    const text  = await parseDocxText(file);
    const items = parseFn(text);
    // Persist to db.json
    const db = loadDB();
    if (!db.studyContent) db.studyContent = {};
    db.studyContent[type] = { items, file: path.basename(file), date: new Date().toDateString() };
    saveDB(db);
    return { ok: true, items, file: path.basename(file) };
  }
  // Running on Railway — fall back to db.json
  const db = loadDB();
  const cached = db.studyContent && db.studyContent[type];
  if (cached && cached.items && cached.items.length) {
    return { ok: true, items: cached.items, file: cached.file, cached: true };
  }
  return { ok: false, items: [] };
}

app.get('/api/leftPanel/editorial', async (req, res) => {
  try { res.json(await getStudyItems('editorial', parseEditorial)); }
  catch(e) { res.json({ ok: false, items: [], error: e.message }); }
});

app.get('/api/leftPanel/upnews', async (req, res) => {
  try { res.json(await getStudyItems('upnews', parseUPNews)); }
  catch(e) { res.json({ ok: false, items: [], error: e.message }); }
});

app.get('/api/leftPanel/mcq', async (req, res) => {
  try { res.json(await getStudyItems('mcq', parseMCQ)); }
  catch(e) { res.json({ ok: false, items: [], error: e.message }); }
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n✅ UPPSC Study Portal — Server started');
  console.log(`🌐 Listening on port ${PORT}`);
  console.log('📁 Data stored in: db.json');
  console.log('🔧 Admin mode: ON\n');
});
