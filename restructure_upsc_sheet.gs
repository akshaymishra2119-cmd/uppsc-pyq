// ============================================================
// UPSC Sheet Restructurer — Auto-renames columns to match
// UPPSC portal schema so switchExam('upsc') works out of box.
//
// HOW TO USE:
//   1. Open your UPSC Google Sheet
//      (https://docs.google.com/spreadsheets/d/1Taa98Ga3X5Z3kiiOCBqe0Crh759-jq5vTVlUCq3LQ14)
//   2. Extensions → Apps Script
//   3. Paste this entire file, click Save
//   4. Run  restructureUpscSheet()
//   5. Authorize when prompted → Done!
// ============================================================

function restructureUpscSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('All_Questions');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Sheet "All_Questions" not found!\nMake sure you\'re running this in the correct spreadsheet.');
    return;
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const numRows = data.length - 1; // exclude header

  // ── Find current column indices (flexible matching) ──────────
  function findCol(candidates) {
    for (const c of candidates) {
      const i = headers.findIndex(h => h.toLowerCase().replace(/[\s_#]/g,'') === c.toLowerCase().replace(/[\s_#]/g,''));
      if (i >= 0) return i;
    }
    return -1;
  }

  const C = {
    year:  findCol(['year','yr']),
    paper: findCol(['paper','papertype']),
    qno:   findCol(['q#','qno','qnum','questionno','sno','sr']),
    subj:  findCol(['subject','sub']),
    diff:  findCol(['difficulty','diff','level']),
    q:     findCol(['question','questiontext','q_text']),
    optA:  findCol(['optiona','option a','opta']),
    optB:  findCol(['optionb','option b','optb']),
    optC:  findCol(['optionc','option c','optc']),
    optD:  findCol(['optiond','option d','optd']),
    ans:   findCol(['answer','correct','correctanswer']),
  };

  // Validate essential columns
  const missing = Object.entries(C).filter(([k,v]) => v < 0).map(([k]) => k);
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert('❌ Could not find columns: ' + missing.join(', ') +
      '\n\nFound headers: ' + headers.join(' | '));
    return;
  }

  // ── Build new column order ────────────────────────────────────
  // New schema: id | year | paper | subject | subTopic | question |
  //             optA | optB | optC | optD | answer | answerText |
  //             explanation | difficulty | qType | repeatsIn
  const NEW_HEADERS = [
    'id','year','paper','subject','subTopic',
    'question','optA','optB','optC','optD',
    'answer','answerText','explanation','difficulty','qType','repeatsIn'
  ];

  // ── Helper: normalize paper name ─────────────────────────────
  function normalizePaper(raw) {
    const s = String(raw).trim().toLowerCase();
    if (s.includes('csat') || s.includes('gs2') || s.includes('gs ii') || s.includes('paper 2') || s.includes('paper ii')) return 'GS II';
    return 'GS I'; // default
  }

  // ── Helper: normalize difficulty ─────────────────────────────
  function normalizeDiff(raw) {
    const s = String(raw).trim().toLowerCase();
    if (s === 'easy' || s === 'e') return 'Easy';
    if (s === 'hard' || s === 'h' || s === 'difficult') return 'Hard';
    return 'Medium';
  }

  // ── Helper: get answerText from option letter ─────────────────
  function getAnswerText(row, ansLetter) {
    const map = { A: C.optA, B: C.optB, C: C.optC, D: C.optD };
    const col = map[String(ansLetter).trim().toUpperCase()];
    return (col !== undefined && col >= 0) ? String(row[col] || '').trim() : '';
  }

  // ── Helper: zero-pad number ───────────────────────────────────
  function pad(n, len) { return String(n).padStart(len, '0'); }

  // ── Build new data array ──────────────────────────────────────
  const newData = [NEW_HEADERS];
  let idCounter = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Skip completely empty rows
    if (row.every(cell => String(cell).trim() === '')) continue;

    const year   = String(row[C.year]  || '').trim();
    const paper  = normalizePaper(row[C.paper]);
    const qno    = String(row[C.qno]   || '').trim();
    const subj   = String(row[C.subj]  || '').trim();
    const diff   = normalizeDiff(row[C.diff]);
    const q      = String(row[C.q]     || '').trim();
    const optA   = String(row[C.optA]  || '').trim();
    const optB   = String(row[C.optB]  || '').trim();
    const optC   = String(row[C.optC]  || '').trim();
    const optD   = String(row[C.optD]  || '').trim();
    const ans    = String(row[C.ans]   || '').trim().toUpperCase();

    // Auto-generate unique ID: UPSC_2023_GS1_001
    const paperCode = paper === 'GS II' ? 'GS2' : 'GS1';
    const idKey = year + '_' + paperCode;
    idCounter[idKey] = (idCounter[idKey] || 0) + 1;
    const id = 'UPSC_' + (year || 'UNK') + '_' + paperCode + '_' + pad(idCounter[idKey], 3);

    // Auto-populate answerText from correct option
    const answerText = getAnswerText(row, ans);

    newData.push([
      id, year, paper, subj, '',      // id,year,paper,subject,subTopic
      q, optA, optB, optC, optD,      // question,optA,optB,optC,optD
      ans, answerText, '', diff, '', '' // answer,answerText,explanation,difficulty,qType,repeatsIn
    ]);
  }

  // ── Write to a NEW tab (safe — original untouched) ───────────
  const newSheetName = 'All_Questions_v2';
  let newSheet = ss.getSheetByName(newSheetName);
  if (newSheet) ss.deleteSheet(newSheet); // replace if re-running
  newSheet = ss.insertSheet(newSheetName);

  newSheet.getRange(1, 1, newData.length, NEW_HEADERS.length).setValues(newData);

  // Style header row
  const headerRange = newSheet.getRange(1, 1, 1, NEW_HEADERS.length);
  headerRange.setBackground('#1e3a8a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');

  // Freeze header
  newSheet.setFrozenRows(1);

  // Auto-resize columns
  newSheet.autoResizeColumns(1, NEW_HEADERS.length);

  const msg = `✅ Done!\n\n` +
    `• New tab created: "${newSheetName}"\n` +
    `• ${newData.length - 1} questions restructured\n` +
    `• Original "All_Questions" tab untouched\n\n` +
    `Next steps:\n` +
    `1. Check the new tab looks correct\n` +
    `2. Fill in "explanation" and "qType" columns if you have that data\n` +
    `3. Share the sheet URL with Claude to wire it into the portal`;

  SpreadsheetApp.getUi().alert(msg);
  Logger.log('Restructure complete. Rows written: ' + (newData.length - 1));
}
