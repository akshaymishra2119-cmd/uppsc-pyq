// ============================================================
// UPPSC STUDY PORTAL — Local Dev Server
// Run: node server.js  →  http://localhost:3000
// ============================================================

const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const bcrypt       = require('bcryptjs');
const { Resend }   = require('resend');
const resend       = new Resend(process.env.RESEND_API_KEY);
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { pool, initDB } = require('./db');

const app    = express();
const PORT   = process.env.PORT || 3000;
const DB     = path.join(__dirname, 'db.json');
const USERS  = path.join(__dirname, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'ghatna-chakra-secret-2026';

// Init PostgreSQL tables on startup
initDB().catch(e => console.error('DB init failed:', e.message));

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
  console.log('UPPSC Study Portal started on port ' + PORT);
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
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (exists.rows.length) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, trial_expires_on, status`,
      [name.trim(), email.toLowerCase().trim(), hash, phone || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 30*24*60*60*1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, status: user.status, trialExpiresOn: user.trial_expires_on } });
  } catch(e) {
    console.error('Register error:', e.message);
    res.status(500).json({ error: 'Registration failed, try again' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!result.rows.length) return res.status(400).json({ error: 'Email not registered' });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Incorrect password' });
    // Determine current access status
    const now = new Date();
    let status = user.status;
    if (status === 'trial' && now > new Date(user.trial_expires_on)) status = 'expired';
    if (user.subscription_paid_till && now <= new Date(user.subscription_paid_till)) status = 'active';
    const expiresIn = rememberMe ? '30d' : '7d';
    const maxAge    = rememberMe ? 30*24*60*60*1000 : 7*24*60*60*1000;
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn });
    res.cookie('token', token, { httpOnly: true, maxAge, sameSite: 'lax' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, status, trialExpiresOn: user.trial_expires_on, subscriptionPaidTill: user.subscription_paid_till } });
  } catch(e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Login failed, try again' });
  }
});

// ── LOGOUT ────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

// ── FORGOT PASSWORD ──────────────────────────────────────────
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const result = await pool.query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    // Always respond success (don't reveal if email exists)
    if (!result.rows.length) return res.json({ success: true });
    const user = result.rows[0];
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await pool.query('UPDATE users SET reset_otp=$1, reset_otp_expires=$2 WHERE id=$3', [otp, expires, user.id]);
    await resend.emails.send({
      from: 'noreply@simplersense.com',
      to: email.toLowerCase().trim(),
      subject: 'UPPSC Portal — Password Reset OTP',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e0e0e0;border-radius:12px;">
          <h2 style="color:#1D9E75;margin-bottom:8px;">🔐 Password Reset</h2>
          <p>Hi <strong>${user.name}</strong>,</p>
          <p>Your OTP to reset your password on <strong>Ghatna Chakra UPPSC Portal</strong>:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:10px;text-align:center;
            color:#1D9E75;background:#E1F5EE;border-radius:8px;padding:20px;margin:20px 0;">
            ${otp}
          </div>
          <p style="color:#666;font-size:13px;">This OTP is valid for <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <p style="color:#999;font-size:12px;margin-top:24px;">If you didn't request this, ignore this email.</p>
        </div>`
    });
    res.json({ success: true });
  } catch(e) {
    console.error('Forgot password error:', e.message);
    res.status(500).json({ error: 'Failed to send OTP, try again' });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────────
app.post('/api/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });
  try {
    const result = await pool.query(
      'SELECT id, reset_otp, reset_otp_expires FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Email not found' });
    const user = result.rows[0];
    if (!user.reset_otp || user.reset_otp !== otp.trim())
      return res.status(400).json({ error: 'Invalid OTP' });
    if (new Date() > new Date(user.reset_otp_expires))
      return res.status(400).json({ error: 'OTP expired, request a new one' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=$1, reset_otp=NULL, reset_otp_expires=NULL WHERE id=$2', [hash, user.id]);
    res.json({ success: true });
  } catch(e) {
    console.error('Reset password error:', e.message);
    res.status(500).json({ error: 'Reset failed, try again' });
  }
});

// ── CHECK SESSION ─────────────────────────────────────────────
app.get('/api/me', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ loggedIn: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result  = await pool.query('SELECT id, name, email, trial_expires_on, subscription_paid_till, status FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows.length) return res.json({ loggedIn: false });
    const user = result.rows[0];
    const now  = new Date();
    let status = user.status;
    if (status === 'trial' && now > new Date(user.trial_expires_on)) status = 'expired';
    if (user.subscription_paid_till && now <= new Date(user.subscription_paid_till)) status = 'active';
    res.json({ loggedIn: true, user: { id: user.id, name: user.name, email: user.email, status, trialExpiresOn: user.trial_expires_on, subscriptionPaidTill: user.subscription_paid_till } });
  } catch { res.json({ loggedIn: false }); }
});

// ── SAVE ATTEMPT (PostgreSQL) ─────────────────────────────────
app.post('/api/saveAttempt', authMiddleware, async (req, res) => {
  const { qId, subject, year, result, timeTaken, mode, quizId } = req.body || {};
  if (!qId || !result) return res.status(400).json({ error: 'qId and result required' });
  try {
    await pool.query(
      `INSERT INTO progress (user_id, q_id, subject, year, result, time_taken, mode, quiz_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.user.id, qId, subject || null, year || null, result, timeTaken || 0,
       mode || 'practice', quizId || null]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('saveAttempt error:', e.message);
    res.status(500).json({ error: 'Could not save attempt' });
  }
});

// ── MY STATS (PostgreSQL) ─────────────────────────────────────
app.get('/api/myStats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT q_id, subject, year, result, time_taken, attempted_at
       FROM progress WHERE user_id = $1 ORDER BY attempted_at ASC`,
      [req.user.id]
    );

    // Deduplicate: keep latest result per question
    const latestMap = {};
    rows.forEach(r => { latestMap[r.q_id] = r; });
    const attempts = Object.values(latestMap);

    const correct = attempts.filter(a => a.result === 'correct').length;
    const wrong   = attempts.filter(a => a.result === 'wrong').length;
    const accuracy = (correct+wrong)>0 ? Math.round(correct/(correct+wrong)*100) : 0;

    const today = new Date().toDateString();
    const yest  = new Date(Date.now()-86400000).toDateString();
    const todayA = rows.filter(a => new Date(a.attempted_at).toDateString()===today);
    const yestA  = rows.filter(a => new Date(a.attempted_at).toDateString()===yest);
    const tC=todayA.filter(a=>a.result==='correct').length, tW=todayA.filter(a=>a.result==='wrong').length;
    const yC=yestA.filter(a=>a.result==='correct').length,  yW=yestA.filter(a=>a.result==='wrong').length;

    // Subject breakdown
    const subjects = {};
    attempts.forEach(a => {
      if (!a.subject) return;
      if (!subjects[a.subject]) subjects[a.subject]={correct:0,wrong:0,total:0};
      subjects[a.subject].total++;
      if (a.result==='correct') subjects[a.subject].correct++;
      if (a.result==='wrong')   subjects[a.subject].wrong++;
    });

    // Year breakdown (unique questions attempted per year)
    const yearMap = {};
    attempts.forEach(a => {
      if (!a.year) return;
      if (!yearMap[a.year]) yearMap[a.year]={correct:0,wrong:0,total:0};
      yearMap[a.year].total++;
      if (a.result==='correct') yearMap[a.year].correct++;
      if (a.result==='wrong')   yearMap[a.year].wrong++;
    });

    // Daily history (all rows, not deduplicated — for heatmap + question list)
    let qMap = {};
    try {
      const qs = await loadQuestions();
      qs.forEach(q => { qMap[String(q.id)] = { question: q.question, subject: q.subject, year: q.year }; });
    } catch(_) {}
    const dailyMap = {};
    rows.forEach(a => {
      const d = new Date(a.attempted_at).toDateString();
      if (!dailyMap[d]) dailyMap[d] = { correct:0, wrong:0, total:0, questions:[] };
      dailyMap[d].total++;
      if (a.result==='correct') dailyMap[d].correct++;
      if (a.result==='wrong')   dailyMap[d].wrong++;
      const qi = qMap[String(a.q_id)] || {};
      dailyMap[d].questions.push({
        q_id:     a.q_id,
        question: qi.question || '',
        subject:  a.subject   || qi.subject || '',
        year:     a.year      || qi.year    || '',
        result:   a.result
      });
    });

    // Streak
    const dates = Object.keys(dailyMap).sort((a,b)=>new Date(b)-new Date(a));
    let streak=0;
    if (dates.length && (dates[0]===today||dates[0]===yest)) {
      streak=1;
      for (let i=1;i<dates.length;i++) {
        if ((new Date(dates[i-1])-new Date(dates[i]))/86400000<=1.5) streak++;
        else break;
      }
    }

    // Mock history
    const mockRows = await pool.query(
      `SELECT score, total, time_taken, subject_breakdown, settings, taken_at
       FROM mock_history WHERE user_id = $1 ORDER BY taken_at DESC LIMIT 20`,
      [req.user.id]
    );

    res.json({
      total: attempts.length, correct, wrong, accuracy, streak,
      projected: Math.max(0, correct - Math.round(wrong*0.33)),
      today:     { total:todayA.length, correct:tC, wrong:tW, accuracy:(tC+tW)>0?Math.round(tC/(tC+tW)*100):0 },
      yesterday: { total:yestA.length,  correct:yC, wrong:yW, accuracy:(yC+yW)>0?Math.round(yC/(yC+yW)*100):0 },
      subjects, yearMap, dailyHistory: dailyMap,
      mockHistory: mockRows.rows
    });
  } catch(e) {
    console.error('myStats error:', e.message);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

// ── SAVE MOCK RESULT ──────────────────────────────────────────
app.post('/api/saveMockResult', authMiddleware, async (req, res) => {
  const { score, total, timeTaken, subjectBreakdown, settings, questions } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO mock_history (user_id, score, total, time_taken, subject_breakdown, settings, questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, score||0, total||0, timeTaken||0,
       JSON.stringify(subjectBreakdown||{}), JSON.stringify(settings||{}), JSON.stringify(questions||[])]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('saveMockResult error:', e.message);
    res.status(500).json({ error: 'Could not save mock result' });
  }
});

// ── MOCK HISTORY ──────────────────────────────────────────────
app.get('/api/mockHistory', authMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT id, score, total, time_taken, subject_breakdown, settings, questions, taken_at
       FROM mock_history WHERE user_id = $1 ORDER BY taken_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ history: rows.rows });
  } catch(e) {
    console.error('mockHistory error:', e.message);
    res.status(500).json({ error: 'Could not load mock history' });
  }
});

// ── TRACK PROGRESS (comprehensive 8-section) ──────────────────
app.get('/api/trackProgress', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;

    // All raw attempts + user info
    const [progRows, userRow, mockRows] = await Promise.all([
      pool.query(
        `SELECT q_id, subject, year, result, time_taken, mode, quiz_id, attempted_at
         FROM progress WHERE user_id = $1 ORDER BY attempted_at ASC`, [uid]),
      pool.query(`SELECT exam_date, name FROM users WHERE id = $1`, [uid]),
      pool.query(
        `SELECT id, score, total, time_taken, subject_breakdown, settings, questions, taken_at
         FROM mock_history WHERE user_id = $1 ORDER BY taken_at DESC`, [uid])
    ]);

    const allRows = progRows.rows;
    const user    = userRow.rows[0] || {};

    // ── Deduplicate per mode: keep latest per (q_id, mode) ──
    const latestByModeKey = {};
    allRows.forEach(r => {
      const key = `${r.q_id}__${r.mode || 'practice'}`;
      latestByModeKey[key] = r;
    });
    const deduped = Object.values(latestByModeKey);

    // ── SECTION 1: Summary strip ───────────────────────────────
    const totalDone = new Set(deduped.map(r => r.q_id)).size;
    const correct   = deduped.filter(r => r.result === 'correct').length;
    const wrong     = deduped.filter(r => r.result === 'wrong').length;
    const accuracy  = (correct + wrong) > 0 ? Math.round(correct / (correct + wrong) * 100) : 0;

    // Streak
    const today = new Date().toDateString();
    const yest  = new Date(Date.now() - 86400000).toDateString();
    const daySet = {};
    allRows.forEach(r => { daySet[new Date(r.attempted_at).toDateString()] = true; });
    const dayKeys = Object.keys(daySet).sort((a,b) => new Date(b) - new Date(a));
    let streak = 0;
    if (dayKeys.length && (dayKeys[0] === today || dayKeys[0] === yest)) {
      streak = 1;
      for (let i = 1; i < dayKeys.length; i++) {
        if ((new Date(dayKeys[i-1]) - new Date(dayKeys[i])) / 86400000 <= 1.5) streak++;
        else break;
      }
    }

    // Days to exam
    let daysToExam = null;
    if (user.exam_date) {
      const diff = new Date(user.exam_date) - new Date();
      daysToExam = Math.max(0, Math.ceil(diff / 86400000));
    }

    // Readiness = accuracy (correct / total attempted)
    const readiness = accuracy;

    // ── SECTION 2: Mode bifurcation ───────────────────────────
    const modes = { practice: {done:0,correct:0,wrong:0}, quiz: {done:0,correct:0,wrong:0}, mock: {done:0,correct:0,wrong:0} };
    deduped.forEach(r => {
      const m = modes[r.mode] || modes.practice;
      m.done++;
      if (r.result === 'correct') m.correct++;
      if (r.result === 'wrong') m.wrong++;
    });
    // Mock stats from mock_history (not progress table — new mock tab saves sessions, not individual Qs)
    modes.mock.mockCount = mockRows.rows.length;
    if (mockRows.rows.length > 0) {
      let mTotalQ = 0, mCorrect = 0, mWrong = 0;
      mockRows.rows.forEach(m => {
        mTotalQ  += m.total || 0;
        mCorrect += m.score || 0;
        // wrong = sum of w fields in subject_breakdown
        const sb = m.subject_breakdown || {};
        Object.values(sb).forEach(s => { mWrong += (s.w || 0); });
      });
      modes.mock.done     = mTotalQ;
      modes.mock.correct  = mCorrect;
      modes.mock.wrong    = mWrong;
      modes.mock.accuracy = (mCorrect + mWrong) > 0 ? Math.round(mCorrect / (mCorrect + mWrong) * 100) : 0;
    }
    Object.values(modes).forEach(m => {
      m.accuracy = (m.correct + m.wrong) > 0 ? Math.round(m.correct / (m.correct + m.wrong) * 100) : 0;
    });

    // ── SECTION 3: Year-wise PYQ coverage ────────────────────
    const yearMap = {};
    deduped.forEach(r => {
      if (!r.year) return;
      if (!yearMap[r.year]) yearMap[r.year] = { done:0, correct:0, wrong:0 };
      yearMap[r.year].done++;
      if (r.result === 'correct') yearMap[r.year].correct++;
      if (r.result === 'wrong') yearMap[r.year].wrong++;
    });

    // ── SECTION 4: Repeat questions mastery ──────────────────
    // Deduplicate globally — questions that appeared in multiple years
    const qYearMap = {};
    allRows.forEach(r => {
      if (!r.q_id || !r.year) return;
      if (!qYearMap[r.q_id]) qYearMap[r.q_id] = { years: new Set(), results: [] };
      qYearMap[r.q_id].years.add(r.year);
      qYearMap[r.q_id].results.push(r.result);
    });
    // q_ids that appear in 2+ distinct years (high-priority repeats)
    const repeatQIds = Object.entries(qYearMap)
      .filter(([,v]) => v.years.size >= 2)
      .map(([qId, v]) => ({
        qId,
        years: [...v.years].sort(),
        lastResult: v.results[v.results.length - 1],
        attempts: v.results.length
      }));
    const repeatStats = {
      total: repeatQIds.length,
      attempted: repeatQIds.filter(r => r.attempts > 0).length,
      correct: repeatQIds.filter(r => r.lastResult === 'correct').length,
      wrong: repeatQIds.filter(r => r.lastResult === 'wrong').length
    };

    // ── SECTION 5: Mock test history (already loaded) ─────────
    const mockHistory = mockRows.rows.map(m => ({
      id: m.id,
      score: m.score,
      total: m.total,
      timeTaken: m.time_taken,
      subjectBreakdown: m.subject_breakdown || {},
      settings: m.settings || {},
      questions: m.questions || [],
      takenAt: m.taken_at,
      pct: m.total > 0 ? Math.round(m.score / m.total * 100) : 0
    }));

    // ── SECTION 6: Wrong question bank ────────────────────────
    // Unique wrong answers per question (latest attempt = wrong)
    const wrongBank = deduped
      .filter(r => r.result === 'wrong')
      .map(r => ({ qId: r.q_id, subject: r.subject, year: r.year, attemptedAt: r.attempted_at }))
      .sort((a,b) => new Date(b.attemptedAt) - new Date(a.attemptedAt));

    // ── SECTION 7: Subject trend (last 14 days vs prev 14) ───
    const now14  = Date.now() - 14 * 86400000;
    const now28  = Date.now() - 28 * 86400000;
    const subTrend = {};
    allRows.forEach(r => {
      if (!r.subject) return;
      const t = new Date(r.attempted_at).getTime();
      if (!subTrend[r.subject]) subTrend[r.subject] = { curr:{c:0,t:0}, prev:{c:0,t:0} };
      if (t >= now14) { subTrend[r.subject].curr.t++; if (r.result==='correct') subTrend[r.subject].curr.c++; }
      else if (t >= now28) { subTrend[r.subject].prev.t++; if (r.result==='correct') subTrend[r.subject].prev.c++; }
    });
    Object.values(subTrend).forEach(s => {
      s.currAcc = s.curr.t > 0 ? Math.round(s.curr.c / s.curr.t * 100) : null;
      s.prevAcc = s.prev.t > 0 ? Math.round(s.prev.c / s.prev.t * 100) : null;
      s.trend = (s.currAcc !== null && s.prevAcc !== null) ? (s.currAcc - s.prevAcc) : null;
    });

    // ── SECTION 8: Activity calendar (365 days) ───────────────
    const calMap = {};
    allRows.forEach(r => {
      const d = new Date(r.attempted_at).toISOString().slice(0,10);
      if (!calMap[d]) calMap[d] = { total:0, correct:0, wrong:0 };
      calMap[d].total++;
      if (r.result === 'correct') calMap[d].correct++;
      if (r.result === 'wrong') calMap[d].wrong++;
    });

    // ── SECTION 9: Daily history with question details ─────────
    let qMapTP = {};
    try {
      const qs = await loadQuestions();
      qs.forEach(q => { qMapTP[String(q.id)] = { question: q.question, subject: q.subject, year: q.year,
        optA: q.optA, optB: q.optB, optC: q.optC, optD: q.optD, answer: q.answer, answerText: q.answerText, explanation: q.explanation }; });
    } catch(_) {}
    const dailyHistoryMap = {};
    allRows.forEach(r => {
      const d = new Date(r.attempted_at).toDateString();
      if (!dailyHistoryMap[d]) dailyHistoryMap[d] = { correct:0, wrong:0, total:0, questions:[] };
      dailyHistoryMap[d].total++;
      if (r.result === 'correct') dailyHistoryMap[d].correct++;
      if (r.result === 'wrong')   dailyHistoryMap[d].wrong++;
      const qi = qMapTP[String(r.q_id)] || {};
      dailyHistoryMap[d].questions.push({
        q_id:       r.q_id,
        question:   qi.question   || '',
        subject:    r.subject     || qi.subject || '',
        year:       r.year        || qi.year    || '',
        result:     r.result,
        mode:       r.mode        || 'practice',
        optA:       qi.optA       || '',
        optB:       qi.optB       || '',
        optC:       qi.optC       || '',
        optD:       qi.optD       || '',
        answer:     qi.answer     || '',
        answerText: qi.answerText || '',
        explanation:qi.explanation|| ''
      });
    });

    // Year map broken down by mode (for frontend mode filtering)
    const yearMapByMode = { practice:{}, quiz:{}, mock:{} };
    allRows.forEach(r => {
      if (!r.year) return;
      const m = yearMapByMode[r.mode] || yearMapByMode.practice;
      if (!m[r.year]) m[r.year] = { done:0, correct:0, wrong:0 };
      m[r.year].done++;
      if (r.result==='correct') m[r.year].correct++;
      if (r.result==='wrong')   m[r.year].wrong++;
    });

    res.json({
      summary: { totalDone, correct, wrong, accuracy, streak, daysToExam, readiness, userName: user.name },
      modes,
      yearMap,
      repeatStats,
      repeatQIds: repeatQIds.slice(0, 50), // top 50 only
      mockHistory,
      wrongBank: wrongBank.slice(0, 100),  // top 100 recent wrongs
      subjectTrend: subTrend,
      calendarData: calMap,
      dailyHistory: dailyHistoryMap,
      yearMapByMode
    });
  } catch(e) {
    console.error('trackProgress error:', e.message);
    res.status(500).json({ error: 'Could not load progress' });
  }
});

// ── SET EXAM DATE ─────────────────────────────────────────────
app.post('/api/setExamDate', authMiddleware, async (req, res) => {
  const { examDate } = req.body || {};
  if (!examDate) return res.status(400).json({ error: 'examDate required' });
  try {
    await pool.query(`UPDATE users SET exam_date = $1 WHERE id = $2`, [examDate, req.user.id]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: 'Could not save exam date' });
  }
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


// ── RSS NEWS FETCHER (via rss2json proxy) ────────────────────
const _newsCache = { uppsc: null, ca: null };
const _newsCacheTime = { uppsc: 0, ca: 0 };
const NEWS_TTL = 60 * 60 * 1000; // 1 hour

// Fetch an RSS feed via rss2json.com proxy (avoids 403 blocks on cloud servers)
function fetchFeedViaProxy(rssUrl) {
  return new Promise((resolve, reject) => {
    const apiUrl = 'https://api.rss2json.com/v1/api.json?count=50&rss_url=' + encodeURIComponent(rssUrl);
    https.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchFeedViaProxy(res.headers.location).then(resolve).catch(reject);
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.status !== 'ok') return resolve([]);
          const items = (json.items || []).map(it => {
            const d = it.pubDate ? new Date(it.pubDate) : new Date();
            if (Date.now() - d.getTime() > 20 * 86400000) return null; // skip >20 days old
            return {
              title:   (it.title   || '').replace(/<[^>]+>/g,'').trim(),
              desc:    (it.description || it.content || '').replace(/<[^>]+>/g,'').slice(0,400).trim(),
              dateStr: d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}),
              link:    it.link || '',
              source:  it.author || json.feed?.title || '',
              ts:      d.getTime()
            };
          }).filter(Boolean);
          resolve(items);
        } catch(e) { resolve([]); }
      });
    }).on('error', () => resolve([])).setTimeout(10000, function(){ this.destroy(); resolve([]); });
  });
}

function categorizeUPPSC(t) {
  const s = t.toLowerCase();
  if (/polity|constitution|governor|vidhan|assembly|election|mla|mp|panchayat|chief minister|yogi/.test(s)) return 'UP Polity';
  if (/economy|gdp|budget|finance|tax|revenue|msme|industry|invest|export/.test(s)) return 'UP Economy';
  if (/road|highway|expressway|metro|railway|airport|bridge|infra|project/.test(s)) return 'UP Infrastructure';
  if (/farm|farmer|agriculture|crop|wheat|sugarcane|kisan|agri/.test(s)) return 'UP Agriculture';
  if (/culture|heritage|temple|festival|art|tourism|varanasi|ayodhya|mathura|kumbh/.test(s)) return 'UP Culture & Heritage';
  if (/environment|forest|wildlife|pollution|river|yamuna|ganga|flood/.test(s)) return 'UP Environment';
  if (/crime|law|order|police|encounter|arrest|court|judge|atrocity/.test(s)) return 'UP Law & Order';
  if (/uppsc|pcs|exam|recruitment|vacancy|syllabus|admit|result/.test(s)) return 'PCS Exam';
  return 'UP Schemes';
}

function categorizeCA(t) {
  const s = t.toLowerCase();
  if (/parliament|election|cabinet|president|prime minister|governor|constitution|lok sabha|rajya sabha/.test(s)) return 'Polity';
  if (/rbi|economy|gdp|budget|inflation|trade|export|import|sebi|market|rupee/.test(s)) return 'Economy';
  if (/isro|space|missile|nuclear|technology|ai |robot|cyber|satellite|chandrayaan/.test(s)) return 'Science & Tech';
  if (/environment|climate|forest|wildlife|pollution|disaster|flood|earthquake/.test(s)) return 'Environment';
  if (/bilateral|treaty|un |who |g20|brics|quad|sco|foreign|international|war|ukraine|china|pakistan/.test(s)) return 'International';
  if (/award|medal|sport|olympic|cricket|chess|rank|prize|padma|bharat ratna/.test(s)) return 'Awards & Sports';
  if (/scheme|yojana|welfare|housing|health|education|skill|pm kisan|pmgsy/.test(s)) return 'Government Schemes';
  return 'Current Affairs';
}

function newsRelevance(cat) {
  const high = ['UP Polity','PCS Exam','Polity','Economy','UP Economy'];
  const med  = ['UP Schemes','UP Infrastructure','Government Schemes','International','Science & Tech'];
  return high.includes(cat) ? 'High' : med.includes(cat) ? 'Medium' : 'Low';
}

// ── GET /api/getUPPSCNews ─────────────────────────────────────
app.get('/api/getUPPSCNews', async (req, res) => {
  const now = Date.now();
  if (_newsCache.uppsc && (now - _newsCacheTime.uppsc) < NEWS_TTL) {
    return res.json(_newsCache.uppsc);
  }
  try {
    // Pull manually-ingested news from PostgreSQL — only if recent (last 48h)
    const pgRes = await pool.query(
      `SELECT * FROM news_items WHERE type='uppsc' AND created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC LIMIT 200`
    );
    if (pgRes.rows.length > 0) {
      const rows = pgRes.rows.map(r => ({
        headline: r.headline, detail: r.detail, date: r.date,
        category: r.category, relevance: r.relevance, source: r.source,
        tags: r.tags, link: r.link, mcq: r.mcq || ''
      }));
      rows.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return (da && db) ? db - da : 0;
      });
      _newsCache.uppsc = rows;
      _newsCacheTime.uppsc = now;
      return res.json(rows);
    }
    // Fallback: try RSS proxy (often blocked from cloud)
    const feeds = [
      'https://news.google.com/rss/search?q=Uttar+Pradesh+government+scheme+yojana&hl=en-IN&gl=IN&ceid=IN:en',
      'https://news.google.com/rss/search?q=UPPSC+UP+PSC+exam+recruitment&hl=en-IN&gl=IN&ceid=IN:en',
    ];
    const results = await Promise.all(feeds.map(u => fetchFeedViaProxy(u)));
    const seen = new Set();
    const rows = [];
    results.forEach(items => {
      items.forEach(item => {
        if (!item.title || item.title.length < 10) return;
        const k = item.title.slice(0,60);
        if (seen.has(k)) return;
        seen.add(k);
        const cat = categorizeUPPSC(item.title + ' ' + item.desc);
        rows.push({
          headline: item.title, detail: item.desc || item.title,
          date: item.dateStr, category: cat,
          relevance: newsRelevance(cat), source: item.source,
          link: item.link, tags: cat, _ts: item.ts
        });
      });
    });
    rows.sort((a,b) => b._ts - a._ts);
    _newsCache.uppsc = rows;
    _newsCacheTime.uppsc = now;
    res.json(rows);
  } catch(e) {
    console.error('getUPPSCNews error:', e.message);
    res.json(_newsCache.uppsc || []);
  }
});

// ── GET /api/getCurrentAffairs ────────────────────────────────
app.get('/api/getCurrentAffairs', async (req, res) => {
  const now = Date.now();
  if (_newsCache.ca && (now - _newsCacheTime.ca) < NEWS_TTL) {
    return res.json(_newsCache.ca);
  }
  try {
    // Pull manually-ingested news from PostgreSQL — only if recent (last 48h)
    const pgRes = await pool.query(
      `SELECT * FROM news_items WHERE type='ca' AND created_at > NOW() - INTERVAL '48 hours' ORDER BY created_at DESC LIMIT 200`
    );
    if (pgRes.rows.length > 0) {
      const rows = pgRes.rows.map(r => ({
        headline: r.headline, detail: r.detail, date: r.date,
        category: r.category, relevance: r.relevance, source: r.source,
        tags: r.tags, link: r.link, mcq: r.mcq || ''
      }));
      rows.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return (da && db) ? db - da : 0;
      });
      _newsCache.ca = rows;
      _newsCacheTime.ca = now;
      return res.json(rows);
    }
    // Fallback: try RSS proxy
    const feeds = [
      'https://news.google.com/rss/search?q=India+government+policy+scheme+budget&hl=en-IN&gl=IN&ceid=IN:en',
      'https://news.google.com/rss/search?q=India+economy+RBI+inflation+trade+export&hl=en-IN&gl=IN&ceid=IN:en',
    ];
    const results = await Promise.all(feeds.map(u => fetchFeedViaProxy(u)));
    const seen = new Set();
    const rows = [];
    results.forEach(items => {
      items.forEach(item => {
        if (!item.title || item.title.length < 10) return;
        const k = item.title.slice(0,60);
        if (seen.has(k)) return;
        seen.add(k);
        const cat = categorizeCA(item.title + ' ' + item.desc);
        rows.push({
          headline: item.title, detail: item.desc || item.title,
          date: item.dateStr, category: cat,
          relevance: newsRelevance(cat), source: item.source,
          link: item.link, tags: cat, _ts: item.ts
        });
      });
    });
    rows.sort((a,b) => b._ts - a._ts);
    _newsCache.ca = rows;
    _newsCacheTime.ca = now;
    res.json(rows);
  } catch(e) {
    console.error('getCurrentAffairs error:', e.message);
    res.json(_newsCache.ca || []);
  }
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

// ── API: ingestNews — store in PostgreSQL (persistent across deploys) ──
app.post('/api/ingestNews', async (req, res) => {
  try {
    const { uppscNews = [], currentAffairs = [] } = req.body || {};
    let added = 0;
    for (const r of uppscNews) {
      if (!r.headline) continue;
      const dupU = await pool.query(`SELECT id FROM news_items WHERE type='uppsc' AND headline=$1 LIMIT 1`, [r.headline]);
      if (dupU.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO news_items (type, headline, detail, date, category, relevance, source, tags, link, mcq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        ['uppsc', r.headline, r.detail||'', r.date||formatDate(new Date()),
         r.category||'General', r.relevance||'Medium', r.source||'', r.tags||'', r.link||'', r.mcq||'']
      );
      added++;
    }
    for (const r of currentAffairs) {
      if (!r.headline) continue;
      const dupC = await pool.query(`SELECT id FROM news_items WHERE type='ca' AND headline=$1 LIMIT 1`, [r.headline]);
      if (dupC.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO news_items (type, headline, detail, date, category, relevance, source, tags, link, mcq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        ['ca', r.headline, r.detail||'', r.date||formatDate(new Date()),
         r.category||'General', r.relevance||'Medium', r.source||'', r.tags||'', r.link||'', r.mcq||'']
      );
      added++;
    }
    // Invalidate cache so GET endpoints pick up new data immediately
    _newsCacheTime.uppsc = 0;
    _newsCacheTime.ca = 0;
    res.json({ success: true, added });
  } catch(e) {
    console.error('ingestNews error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: updateNewsMcq — bulk update MCQ for existing items ──
app.post('/api/updateNewsMcq', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    let updated = 0;
    for (const r of items) {
      if (!r.headline || !r.mcq) continue;
      const result = await pool.query(
        `UPDATE news_items SET mcq=$1 WHERE headline=$2`,
        [r.mcq, r.headline]
      );
      updated += result.rowCount;
    }
    _newsCacheTime.uppsc = 0;
    _newsCacheTime.ca = 0;
    res.json({ success: true, updated });
  } catch(e) {
    console.error('updateNewsMcq error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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

// -- API: checkAdmin
app.post('/api/checkAdmin', (req, res) => {
  res.json({ isAdmin: true, email: 'local@dev.local' });
});

// -- HELPER: sync leaderboard after progress save
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

// ── API: deleteRecentNews — delete items added in last N hours ──
app.post('/api/deleteRecentNews', async (req, res) => {
  const { secret, hours = 2 } = req.body || {};
  if (secret !== 'clear-news-2026') return res.status(403).json({ error: 'Forbidden' });
  try {
    const h = Math.min(parseInt(hours) || 2, 48);
    const result = await pool.query(
      `DELETE FROM news_items WHERE created_at > NOW() - ($1 || ' hours')::INTERVAL`,
      [h]
    );
    _newsCacheTime.uppsc = 0;
    _newsCacheTime.ca    = 0;
    res.json({ success: true, deleted: result.rowCount });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: clearAllNews (admin wipe) ───────────────────────────
app.post('/api/clearAllNews', async (req, res) => {
  const { secret } = req.body || {};
  if (secret !== 'clear-news-2026') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query(`DELETE FROM news_items`);
    _newsCacheTime.uppsc = 0;
    _newsCacheTime.ca    = 0;
    res.json({ success: true, deleted: result.rowCount });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DAILY AUTO-SCRAPE (runs every 6 hours on Railway) ────────
const { scrapeAll } = require('./scraper');

async function autoIngestNews() {
  try {
    console.log('[AutoScrape] Starting news fetch...');
    const result = await scrapeAll();
    const uppscNews     = result.uppscNews     || [];
    const currentAffairs = result.currentAffairs || [];
    let added = 0;
    for (const r of uppscNews) {
      if (!r.headline) continue;
      const dup = await pool.query(`SELECT id FROM news_items WHERE type='uppsc' AND headline=$1 LIMIT 1`, [r.headline]);
      if (dup.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO news_items (type, headline, detail, date, category, relevance, source, tags, link, mcq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        ['uppsc', r.headline, r.detail||'', r.date||'', r.category||'General',
         r.relevance||'Medium', r.source||'', r.tags||'', r.link||'', r.mcq||'']
      );
      added++;
    }
    for (const r of currentAffairs) {
      if (!r.headline) continue;
      const dup = await pool.query(`SELECT id FROM news_items WHERE type='ca' AND headline=$1 LIMIT 1`, [r.headline]);
      if (dup.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO news_items (type, headline, detail, date, category, relevance, source, tags, link, mcq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        ['ca', r.headline, r.detail||'', r.date||'', r.category||'General',
         r.relevance||'Medium', r.source||'', r.tags||'', r.link||'', r.mcq||'']
      );
      added++;
    }
    _newsCacheTime.uppsc = 0;
    _newsCacheTime.ca    = 0;
    console.log('[AutoScrape] Done — added ' + added + ' new items');
  } catch(e) {
    console.error('[AutoScrape] Error:', e.message);
  }
}

// Run once on startup (after 30s delay to let DB init finish), then every 6 hours
setTimeout(() => {
  autoIngestNews();
  setInterval(autoIngestNews, 6 * 60 * 60 * 1000);
}, 30000);

// -- START
app.listen(PORT, '0.0.0.0', () => {
  console.log('UPPSC Study Portal started on port ' + PORT);
});
