// ============================================================
// UPSC Sheet Restructurer — converts raw UPSC question data
// into the exact UPPSC/BPSC portal schema so server.js works.
//
// Column order matches UPPSC/BPSC exactly:
//   0=id  1=year  2=subject  3=subTopic  4=question
//   5=optA  6=optB  7=optC  8=optD
//   9=answer  10=answerText  11=explanation
//   12=difficulty  13=qType  14=repeatsIn  15=paper
//
// HOW TO USE:
//   1. Open your UPSC Google Sheet
//   2. Extensions → Apps Script → paste this → Save
//   3. Run restructureUpscSheet()
//   4. Check the new tab, then use it as the source tab name in server.js
// ============================================================

function restructureUpscSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();

  // ── Ask which tab to restructure ─────────────────────────────
  const ui       = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Restructure UPSC Sheet',
    'Enter the source tab name (e.g. All_Questions or All_Questions_HI):',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const srcTabName = response.getResponseText().trim();
  if (!srcTabName) { ui.alert('❌ No tab name entered.'); return; }

  const sheet = ss.getSheetByName(srcTabName);
  if (!sheet) {
    ui.alert('❌ Tab "' + srcTabName + '" not found!\nAvailable tabs: ' +
      ss.getSheets().map(function(s){ return s.getName(); }).join(', '));
    return;
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h){ return String(h).trim(); });
  const numRows = data.length - 1;

  // ── Find columns flexibly ─────────────────────────────────────
  function findCol(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var idx = headers.findIndex(function(h) {
        return h.toLowerCase().replace(/[\s_#]/g,'') === candidates[i].toLowerCase().replace(/[\s_#]/g,'');
      });
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const C = {
    year:  findCol(['year','yr']),
    paper: findCol(['paper','papertype']),
    qno:   findCol(['q#','qno','qnum','sno','sr','questionno']),
    subj:  findCol(['subject','sub']),
    sub2:  findCol(['subtopic','sub_topic','subtopic']),
    q:     findCol(['question','questiontext','q_text']),
    optA:  findCol(['opta','option a','option_a','opt_a']),
    optB:  findCol(['optb','option b','option_b','opt_b']),
    optC:  findCol(['optc','option c','option_c','opt_c']),
    optD:  findCol(['optd','option d','option_d','opt_d']),
    ans:   findCol(['answer','correct','correctanswer']),
    ansT:  findCol(['answertext','answer_text']),
    expl:  findCol(['explanation','explain']),
    diff:  findCol(['difficulty','diff','level']),
    qt:    findCol(['qtype','q_type','questiontype','type']),
    rep:   findCol(['repeatsin','repeats_in']),
  };

  const missing = Object.entries(C)
    .filter(function(e){ return ['year','subj','q','optA','optB','optC','optD','ans'].includes(e[0]) && e[1] < 0; })
    .map(function(e){ return e[0]; });

  if (missing.length > 0) {
    ui.alert('❌ Could not find essential columns: ' + missing.join(', ') +
      '\n\nFound headers:\n' + headers.join(' | '));
    return;
  }

  // ── Helpers ───────────────────────────────────────────────────
  function g(row, k) {
    return (C[k] >= 0 && C[k] < row.length) ? String(row[C[k]] || '').trim() : '';
  }

  function normPaper(raw) {
    var s = String(raw).trim().toLowerCase();
    if (s.includes('csat') || s.includes('gs2') || s.includes('gs ii') ||
        s.includes('paper 2') || s.includes('paper ii')) return 'GS II';
    return 'GS I';
  }

  function normDiff(raw) {
    var s = String(raw).trim().toLowerCase();
    if (s === 'easy' || s === 'e') return 'Easy';
    if (s === 'hard' || s === 'h' || s === 'difficult') return 'Hard';
    return 'Medium';
  }

  function getAnswerText(row, ansLetter) {
    var map = { A: C.optA, B: C.optB, C: C.optC, D: C.optD };
    var col = map[ansLetter.toUpperCase()];
    return (col !== undefined && col >= 0 && col < row.length) ? String(row[col] || '').trim() : '';
  }

  function pad(n, len) { return String(n).padStart(len, '0'); }

  // ── Target column order (matches UPPSC/BPSC server.js exactly) ──
  const NEW_HEADERS = [
    'id', 'year', 'subject', 'subTopic', 'question',
    'optA', 'optB', 'optC', 'optD',
    'answer', 'answerText', 'explanation',
    'difficulty', 'qType', 'repeatsIn', 'paper'
  ];

  // ── Build output rows ─────────────────────────────────────────
  const newData  = [NEW_HEADERS];
  var idCounter  = {};

  for (var i = 1; i < data.length; i++) {
    var row  = data[i];
    if (row.every(function(c){ return String(c).trim() === ''; })) continue;

    var yr    = g(row, 'year');   if (!yr) continue;
    var paper = normPaper(g(row, 'paper'));
    var subj  = g(row, 'subj')   || 'General Studies';
    var sub2  = g(row, 'sub2');
    var q     = g(row, 'q');
    var optA  = g(row, 'optA');
    var optB  = g(row, 'optB');
    var optC  = g(row, 'optC');
    var optD  = g(row, 'optD');
    var ans   = g(row, 'ans').toUpperCase();
    var ansT  = g(row, 'ansT')   || getAnswerText(row, ans);
    var expl  = g(row, 'expl');
    var diff  = normDiff(g(row, 'diff'));
    var qt    = g(row, 'qt');
    var rep   = g(row, 'rep');

    // Auto-generate ID
    var pCode = paper === 'GS II' ? 'GS2' : 'GS1';
    var idKey = yr + '_' + pCode;
    idCounter[idKey] = (idCounter[idKey] || 0) + 1;
    var id = 'UPSC_' + yr + '_' + pCode + '_' + pad(idCounter[idKey], 3);

    // Order: id,year,subject,subTopic,question,optA,optB,optC,optD,answer,answerText,explanation,difficulty,qType,repeatsIn,paper
    newData.push([id, yr, subj, sub2, q, optA, optB, optC, optD, ans, ansT, expl, diff, qt, rep, paper]);
  }

  // ── Write to output tab ───────────────────────────────────────
  var outTabName = srcTabName + '_v2';
  if (srcTabName.endsWith('_v2')) outTabName = srcTabName; // overwrite if re-running

  var outSheet = ss.getSheetByName(outTabName);
  if (outSheet) ss.deleteSheet(outSheet);
  outSheet = ss.insertSheet(outTabName);

  outSheet.getRange(1, 1, newData.length, NEW_HEADERS.length).setValues(newData);

  // Style
  var hr = outSheet.getRange(1, 1, 1, NEW_HEADERS.length);
  hr.setBackground('#1e3a8a'); hr.setFontColor('#ffffff'); hr.setFontWeight('bold');
  outSheet.setFrozenRows(1);
  outSheet.autoResizeColumns(1, NEW_HEADERS.length);

  ui.alert(
    '✅ Done! Created tab: "' + outTabName + '"\n\n' +
    (newData.length - 1) + ' rows structured in correct column order:\n' +
    'id | year | subject | subTopic | question | optA-D |\n' +
    'answer | answerText | explanation | difficulty | qType | repeatsIn | paper\n\n' +
    'Original tab untouched.'
  );
}
