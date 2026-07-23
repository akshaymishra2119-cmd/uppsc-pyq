/**
 * fix_bpsc_answers.gs
 * Run this in the BPSC Google Sheet (ID: 15xXnY1NE1CIYGXVOMNa_RXcZ8WOIS5HwUzq-xwKjNbo)
 * to correct wrong answers and two subject misclassifications.
 *
 * Sheet columns (1-indexed):
 *   A=1  id
 *   B=2  year
 *   C=3  subject
 *   D=4  subTopic
 *   E=5  question
 *   F=6  optA
 *   G=7  optB
 *   H=8  optC
 *   I=9  optD
 *   J=10 answer  ← main target
 *   K=11 answerText
 *   L=12 explanation
 *   ...
 */

function fixBpscAnswers() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();

  // Try both tab names used by server.js
  const sheet = ss.getSheetByName('BPSC_EN') || ss.getSheetByName('Sheet1') || ss.getSheetByName('BPSC');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Could not find sheet tab. Rename your tab to BPSC_EN or open the correct sheet.');
    return;
  }

  // ── Answer corrections (E → correct letter) ──────────────────
  // Format: { id, answer, subject (optional override) }
  const corrections = [
    { id: 'BPSC_64_035', answer: 'A' },                          // DNA: Watson & Crick
    { id: 'BPSC_64_045', answer: 'A' },                          // Main greenhouse gas: CO2
    { id: 'BPSC_64_080', answer: 'C' },                          // Not true Kanya Utthan: ₹60k total
    { id: 'BPSC_64_090', answer: 'C' },                          // Troops 200/250/500: Sher Shah
    { id: 'BPSC_64_135', answer: 'D' },                          // Not industrial initiative: Digital India
    { id: 'BPSC_64_139', answer: 'A' },                          // RBI Governor 2018: Urjit Patel
    { id: 'BPSC_65_002', answer: 'E', subject: 'Bihar Special' },// Searchlight editor (keep E, fix subject)
    { id: 'BPSC_65_031', answer: 'A' },                          // Unit of pressure: kg/cm²
    { id: 'BPSC_65_133', answer: 'B' },                          // Order of Precedence: CEC first
    { id: 'BPSC_65_144', answer: 'A' },                          // Not direct finance: NABARD
    { id: 'BPSC_66_065', answer: 'B' },                          // London Marathon 2020: Shura Kitata
    { id: 'BPSC_66_074', answer: 'C' },                          // Bihar election press note: 25 Sep 2020
    { id: 'BPSC_66_081', answer: 'B' },                          // Operation MAGA: Trump re-election
    { id: 'BPSC_66_143', answer: 'C', subject: 'Economy' },      // IIP releases: CSO (fix subject too)
    { id: 'BPSC_67_003', answer: 'A' },                          // Opposed Khalifa: Alauddin Khalji
  ];

  const corrMap = {};
  corrections.forEach(c => corrMap[c.id] = c);

  // ── Read all rows ─────────────────────────────────────────────
  const lastRow  = sheet.getLastRow();
  const data     = sheet.getRange(2, 1, lastRow - 1, 12).getValues(); // cols A–L

  const COL_ID      = 0;  // A (0-indexed)
  const COL_SUBJECT = 2;  // C
  const COL_ANSWER  = 9;  // J

  let updated = 0;
  const log = [];

  data.forEach((row, i) => {
    const qid = String(row[COL_ID]).trim();
    if (!corrMap[qid]) return;

    const fix   = corrMap[qid];
    const rowNo = i + 2; // 1-indexed, +1 for header
    const oldAns = row[COL_ANSWER];
    const oldSub = row[COL_SUBJECT];

    // Update answer
    if (fix.answer !== undefined && fix.answer !== oldAns) {
      sheet.getRange(rowNo, COL_ANSWER + 1).setValue(fix.answer);
      log.push(`${qid}: answer ${oldAns} → ${fix.answer}`);
      updated++;
    }

    // Update subject if specified
    if (fix.subject && fix.subject !== oldSub) {
      sheet.getRange(rowNo, COL_SUBJECT + 1).setValue(fix.subject);
      log.push(`${qid}: subject "${oldSub}" → "${fix.subject}"`);
      updated++;
    }
  });

  const msg = updated === 0
    ? '✅ Nothing to update — all cells already correct.'
    : `✅ Updated ${updated} cell(s):\n\n` + log.join('\n');

  SpreadsheetApp.getUi().alert(msg);
  Logger.log(msg);
}
