// ============================================================
// UPPSC Portal — Auto QType Classifier
// Paste this into your Google Sheet's Apps Script editor
// (Extensions → Apps Script) and run classifyQTypes()
// ============================================================

function classifyQTypes() {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const sheet   = ss.getSheetByName('QUESTION_BANK');
  if (!sheet) { Browser.msgBox('Sheet "QUESTION_BANK" not found!'); return; }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());

  // Find column indices by header name
  const COL = {
    question: findCol(headers, ['question','q_text','question_text']),
    optA:     findCol(headers, ['opta','opt_a','option_a','optiona']),
    optB:     findCol(headers, ['optb','opt_b','option_b','optionb']),
    optC:     findCol(headers, ['optc','opt_c','option_c','optionc']),
    optD:     findCol(headers, ['optd','opt_d','option_d','optiond']),
    qtype:    findCol(headers, ['qtype','q_type','type','question_type']),
  };

  // Validate
  if (COL.question < 0) { Browser.msgBox('Could not find "question" column!'); return; }
  if (COL.qtype   < 0) { Browser.msgBox('Could not find "qType" column!'); return; }

  Logger.log('Column map: ' + JSON.stringify(COL));

  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row     = data[i];
    const qText = String(row[COL.question] || '').trim();

    // Skip rows with no question text
    if (!qText) { skipped++; continue; }
    if (!qText) continue;

    // Combine question + all options for pattern matching
    const optText = [COL.optA, COL.optB, COL.optC, COL.optD]
      .filter(c => c >= 0)
      .map(c => String(row[c] || ''))
      .join(' ');
    const full = (qText + ' ' + optText).toLowerCase();

    const classified = classify(qText, full);

    // Write back (col index is 0-based, setCell is 1-based)
    sheet.getRange(i + 1, COL.qtype + 1).setValue(classified);
    updated++;

    // Progress every 100 rows
    if (updated % 100 === 0) Logger.log(`Processed ${updated} rows...`);
  }

  SpreadsheetApp.getUi().alert(
    `Done!\n\nUpdated: ${updated} rows\nSkipped (already tagged): ${skipped} rows`
  );
}

// ── Classification logic ─────────────────────────────────────
function classify(qText, full) {

  // 1. ASSERTION & REASON
  //    Looks for "Assertion" or standard A&R phrasing
  if (
    /\bassertion\b/i.test(qText) ||
    /\breason\b.*\bexplain/i.test(qText) ||
    /\(a\)\s+and\s+\(r\)/i.test(full) ||
    /both.*assertion.*reason/i.test(full) ||
    /assertion.*is.*true.*reason.*is.*true/i.test(full)
  ) return 'A&R';

  // 2. CHRONOLOGICAL ORDER
  //    Arrange in order / correct sequence
  if (
    /chronological/i.test(qText) ||
    /arrange.*(?:following|above|below).*(?:order|sequence)/i.test(qText) ||
    /correct.*(?:chronological|sequence|order)/i.test(qText) ||
    /(?:ascending|descending).*order/i.test(qText) ||
    /which.*correct.*order/i.test(qText) ||
    /order.*of.*occurrence/i.test(qText)
  ) return 'Chronology';

  // 3. MATCH THE FOLLOWING
  //    Match list / column / pair correctly
  if (
    /match.*(?:list|column|following|pair)/i.test(qText) ||
    /(?:list|column)\s*[i1]\s+(?:with|and)\s+(?:list|column)\s*[ii2]/i.test(qText) ||
    /correctly.*(?:matched|paired)/i.test(qText) ||
    /which.*(?:pair|pairs).*(?:correct|incorrect)/i.test(qText) ||
    /\bcode\b.*below.*match/i.test(full) ||
    /(list-i|list-ii|column-i|column-ii)/i.test(full)
  ) return 'Match';

  // 4. STATEMENT-BASED
  //    "Consider the following statements" / numbered statements / which is correct/incorrect
  if (
    /consider\s+the\s+following\s+statements?/i.test(qText) ||
    /which\s+(?:of\s+the\s+following\s+)?statements?\s+(?:is|are)\s+(?:correct|incorrect|true|false)/i.test(qText) ||
    /how\s+many\s+(?:of\s+the\s+following\s+)?statements?\s+(?:is|are)\s+(?:correct|incorrect|true|false)/i.test(qText) ||
    /(?:given|following)\s+statements?.*(?:correct|incorrect|true|false)/i.test(qText) ||
    /statements?.*(?:1|2|3).*(?:correct|incorrect|true|false)/i.test(qText) ||
    // options contain only/both style combos
    /only\s+[123]\s+(?:is|are)\s+correct/i.test(full) ||
    /(?:1\s+and\s+2|2\s+and\s+3|1\s+and\s+3)\s+(?:only\s+)?(?:are|is)\s+correct/i.test(full) ||
    /all\s+(?:the\s+)?(?:three|four|above)\s+(?:statements?\s+)?(?:are\s+)?correct/i.test(full)
  ) return 'Statement';

  // 5. DIRECT — everything else
  return 'Direct';
}

// ── Helper: find column index by possible names ──────────────
function findCol(headers, candidates) {
  for (const name of candidates) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  // Fallback: partial match
  for (const name of candidates) {
    const idx = headers.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}
