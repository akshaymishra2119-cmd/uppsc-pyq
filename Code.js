// ============================================================
// UPPSC STUDY PORTAL — Code.gs (Apps Script Backend)
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Open Google Sheets with your 450-question data
// 2. Go to Extensions → Apps Script
// 3. Paste this entire file as Code.gs
// 4. Create Index.html (paste the other file)
// 5. Click Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the Web App URL and share it
// ============================================================

// ── SHEET NAMES (must match your Google Sheet tab names) ────
const SHEET_QB    = "Question_Bank";
const SHEET_CA    = "Current_Affairs";
const SHEET_PROG  = "User_Progress";
const SHEET_LB    = "Leaderboard";

// ── ADMIN EMAIL (only this email sees the Admin tab) ────────
const ADMIN_EMAIL = "your.email@gmail.com"; // ← change this

// ── SERVE THE WEB APP ────────────────────────────────────────
function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("UPPSC Study Portal")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── GET QUESTIONS ─────────────────────────────────────────────
// Called from frontend: google.script.run.getQuestions(filters)
function getQuestions(filters) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_QB);
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];

    // Build index map for column names
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });

    let rows = data.slice(1).filter(r => r[idx["Q_ID"]] !== "");

    // Apply filters
    if (filters.subject && filters.subject !== "all")
      rows = rows.filter(r => r[idx["Subject"]] === filters.subject);
    if (filters.year && filters.year !== "all")
      rows = rows.filter(r => String(r[idx["Year"]]) === String(filters.year));
    if (filters.difficulty && filters.difficulty !== "all")
      rows = rows.filter(r => r[idx["Difficulty"]] === filters.difficulty);
    if (filters.zone && filters.zone !== "all")
      rows = rows.filter(r => r[idx["Zone"]] === filters.zone);
    if (filters.repeating)
      rows = rows.filter(r => {
        const rep = String(r[idx["Repeats_In"]] || "");
        return rep.includes(",");
      });

    // Shuffle if quiz mode
    if (filters.shuffle) {
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
    }

    // Limit
    const limit = filters.limit || 150;
    rows = rows.slice(0, limit);

    // Map to objects
    return rows.map(r => ({
      id:          r[idx["Q_ID"]],
      year:        r[idx["Year"]],
      subject:     r[idx["Subject"]],
      subTopic:    r[idx["Sub_Topic"]],
      question:    r[idx["Question"]],
      optA:        r[idx["Option_A"]],
      optB:        r[idx["Option_B"]],
      optC:        r[idx["Option_C"]],
      optD:        r[idx["Option_D"]],
      answer:      r[idx["Correct_Answer"]],
      answerText:  r[idx["Correct_Option_Text"]],
      explanation: r[idx["Explanation"]],
      difficulty:  r[idx["Difficulty"]],
      qType:       r[idx["Question_Type"]],
      repeatsIn:   r[idx["Repeats_In"]],
      zone:        r[idx["Zone"]],
    }));
  } catch(e) {
    return { error: e.toString() };
  }
}

// ── GET CURRENT AFFAIRS ───────────────────────────────────────
function getCurrentAffairs(filters) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_CA);

    // Auto-create CA sheet if missing
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_CA);
      sheet.getRange(1,1,1,8).setValues([[
        "Date","Category","Headline","Detail","Source",
        "UPPSC_Relevance","Tags","MCQ"
      ]]);
      sheet.getRange(1,1,1,8).setFontWeight("bold");
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers = data[0];
    const idx = {};
    headers.forEach((h,i) => { idx[h] = i; });

    let rows = data.slice(1).filter(r => r[idx["Headline"]] !== "");

    // Filter by category
    if (filters && filters.category && filters.category !== "all")
      rows = rows.filter(r => r[idx["Category"]] === filters.category);

    // Filter by search
    if (filters && filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(r =>
        String(r[idx["Headline"]]).toLowerCase().includes(q) ||
        String(r[idx["Detail"]]).toLowerCase().includes(q)
      );
    }

    // Sort newest first (reverse order)
    rows.reverse();

    return rows.map(r => ({
      date:       formatDate(r[idx["Date"]]),
      category:   r[idx["Category"]],
      headline:   r[idx["Headline"]],
      detail:     r[idx["Detail"]],
      source:     r[idx["Source"]],
      relevance:  r[idx["UPPSC_Relevance"]],
      tags:       r[idx["Tags"]],
      mcq:        r[idx["MCQ"]],
    }));
  } catch(e) {
    return { error: e.toString() };
  }
}

// ── ADD CURRENT AFFAIR (admin only) ──────────────────────────
function addCurrentAffair(data) {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    if (userEmail !== ADMIN_EMAIL) {
      return { success: false, error: "Not authorized" };
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_CA);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_CA);
      sheet.getRange(1,1,1,8).setValues([[
        "Date","Category","Headline","Detail","Source",
        "UPPSC_Relevance","Tags","MCQ"
      ]]);
    }

    sheet.appendRow([
      data.date, data.category, data.headline,
      data.detail, data.source, data.relevance,
      data.tags || "", data.mcq || ""
    ]);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ── SAVE USER PROGRESS ────────────────────────────────────────
function saveProgress(entry) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_PROG);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_PROG);
      sheet.getRange(1,1,1,7).setValues([[
        "UserName","Q_ID","Subject","Year","Result","Date","Time_Taken_Sec"
      ]]);
      sheet.getRange(1,1,1,7).setFontWeight("bold");
    }

    sheet.appendRow([
      entry.userName,
      entry.qId,
      entry.subject,
      entry.year,
      entry.result,        // "correct" | "wrong" | "skipped"
      new Date(),
      entry.timeTaken || 0
    ]);

    // Update leaderboard
    updateLeaderboard(entry.userName);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ── SAVE BULK PROGRESS (end of quiz) ─────────────────────────
function saveBulkProgress(entries) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_PROG);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_PROG);
      sheet.getRange(1,1,1,7).setValues([[
        "UserName","Q_ID","Subject","Year","Result","Date","Time_Taken_Sec"
      ]]);
    }

    const now = new Date();
    const rows = entries.map(e => [
      e.userName, e.qId, e.subject, e.year,
      e.result, now, e.timeTaken || 0
    ]);

    if (rows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
    }

    if (entries.length > 0) updateLeaderboard(entries[0].userName);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ── GET USER PROGRESS ─────────────────────────────────────────
function getUserProgress(userName) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_PROG);
    if (!sheet || sheet.getLastRow() <= 1) return getEmptyProgress();

    const data  = sheet.getDataRange().getValues();
    const rows  = data.slice(1).filter(r => r[0] === userName);

    if (rows.length === 0) return getEmptyProgress();

    const total    = rows.length;
    const correct  = rows.filter(r => r[4] === "correct").length;
    const wrong    = rows.filter(r => r[4] === "wrong").length;
    const skipped  = rows.filter(r => r[4] === "skipped").length;
    const accuracy = total > 0 ? Math.round(correct / (correct + wrong) * 100) || 0 : 0;

    // Subject-wise breakdown
    const subjects = {};
    rows.forEach(r => {
      const sub = r[2];
      if (!subjects[sub]) subjects[sub] = { correct: 0, wrong: 0, total: 0 };
      subjects[sub].total++;
      if (r[4] === "correct") subjects[sub].correct++;
      if (r[4] === "wrong")   subjects[sub].wrong++;
    });

    // Streak calculation
    const dates = [...new Set(rows.map(r => {
      const d = new Date(r[5]);
      return d.toDateString();
    }))].sort().reverse();

    let streak = 0;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (dates[0] === today || dates[0] === yesterday) {
      streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i-1]);
        const curr = new Date(dates[i]);
        const diff = (prev - curr) / 86400000;
        if (diff <= 1.5) streak++;
        else break;
      }
    }

    // Projected score
    const attempted  = correct + wrong;
    const projected  = attempted > 0
      ? Math.round(correct - (wrong * 0.33))
      : 0;

    return {
      total, correct, wrong, skipped,
      accuracy, streak, subjects,
      projected: Math.max(0, projected),
      questionsAttempted: attempted
    };
  } catch(e) {
    return getEmptyProgress();
  }
}

function getEmptyProgress() {
  return {
    total: 0, correct: 0, wrong: 0, skipped: 0,
    accuracy: 0, streak: 0, subjects: {},
    projected: 0, questionsAttempted: 0
  };
}

// ── UPDATE LEADERBOARD ────────────────────────────────────────
function updateLeaderboard(userName) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_LB);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_LB);
      sheet.getRange(1,1,1,5).setValues([[
        "UserName","BestScore","Accuracy","QsAttempted","LastActive"
      ]]);
      sheet.getRange(1,1,1,5).setFontWeight("bold");
    }

    const prog = getUserProgress(userName);
    const data = sheet.getDataRange().getValues();
    let found  = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userName) {
        sheet.getRange(i+1, 2, 1, 4).setValues([[
          prog.projected,
          prog.accuracy,
          prog.questionsAttempted,
          new Date()
        ]]);
        found = true;
        break;
      }
    }

    if (!found) {
      sheet.appendRow([
        userName,
        prog.projected,
        prog.accuracy,
        prog.questionsAttempted,
        new Date()
      ]);
    }
  } catch(e) {
    Logger.log("Leaderboard update error: " + e);
  }
}

// ── GET LEADERBOARD ───────────────────────────────────────────
function getLeaderboard() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_LB);
    if (!sheet || sheet.getLastRow() <= 1) return [];

    const data = sheet.getDataRange().getValues();
    return data.slice(1)
      .filter(r => r[0] !== "")
      .map(r => ({
        name:      r[0],
        score:     r[1],
        accuracy:  r[2],
        attempted: r[3],
        lastActive: formatDate(r[4])
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  } catch(e) {
    return [];
  }
}

// ── GET STATS SUMMARY ─────────────────────────────────────────
function getStats() {
  try {
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const qb   = ss.getSheetByName(SHEET_QB);
    const ca   = ss.getSheetByName(SHEET_CA);
    const totalQ = qb ? Math.max(0, qb.getLastRow() - 1) : 0;
    const totalCA = ca ? Math.max(0, ca.getLastRow() - 1) : 0;
    return { totalQuestions: totalQ, totalCA: totalCA };
  } catch(e) {
    return { totalQuestions: 450, totalCA: 0 };
  }
}

// ── CHECK IF ADMIN ────────────────────────────────────────────
function checkAdmin() {
  try {
    const email = Session.getActiveUser().getEmail();
    return { isAdmin: email === ADMIN_EMAIL, email: email };
  } catch(e) {
    return { isAdmin: false, email: "" };
  }
}

// ── HELPER: FORMAT DATE ───────────────────────────────────────
function formatDate(d) {
  if (!d) return "";
  try {
    const date = new Date(d);
    if (isNaN(date)) return String(d);
    const months = ["Jan","Feb","Mar","Apr","May","Jun",
                    "Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch(e) {
    return String(d);
  }
}

// ── AUTO-CREATE ALL SHEETS ON FIRST RUN ──────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const needed = [
    { name: SHEET_CA,   headers: ["Date","Category","Headline","Detail","Source","UPPSC_Relevance","Tags","MCQ"] },
    { name: SHEET_PROG, headers: ["UserName","Q_ID","Subject","Year","Result","Date","Time_Taken_Sec"] },
    { name: SHEET_LB,   headers: ["UserName","BestScore","Accuracy","QsAttempted","LastActive"] },
  ];
  needed.forEach(s => {
    if (!ss.getSheetByName(s.name)) {
      const sheet = ss.insertSheet(s.name);
      sheet.getRange(1,1,1,s.headers.length).setValues([s.headers]);
      sheet.getRange(1,1,1,s.headers.length).setFontWeight("bold")
           .setBackground("#1A73E8").setFontColor("#FFFFFF");
      SpreadsheetApp.flush();
    }
  });
  SpreadsheetApp.getUi().alert("Setup complete! All sheets created.");
}