// ============================================================
// UPSC Column Reorder — fixes All_Questions_v2 tab to match
// the exact UPPSC/BPSC column order so server.js works correctly.
//
// Target column order (same as UPPSC/BPSC):
//   0=id  1=year  2=subject  3=subTopic  4=question
//   5=optA  6=optB  7=optC  8=optD
//   9=answer  10=answerText  11=explanation
//   12=difficulty  13=qType  14=repeatsIn  15=paper
//
// HOW TO USE:
//   Open UPSC sheet → Extensions → Apps Script → paste → Run reorderUpscColumns()
// ============================================================

function reorderUpscColumns() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('All_Questions_v2');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Sheet "All_Questions_v2" not found!');
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (!data.length) { SpreadsheetApp.getUi().alert('❌ Sheet is empty!'); return; }

  // Current order in All_Questions_v2:
  // 0=id  1=year  2=paper  3=subject  4=subTopic  5=question
  // 6=optA  7=optB  8=optC  9=optD
  // 10=answer  11=answerText  12=explanation
  // 13=difficulty  14=qType  15=repeatsIn
  //
  // Target order — move paper from pos 2 → pos 15:
  const NEW_ORDER = [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 2];
  const NEW_HEADERS = [
    'id','year','subject','subTopic','question',
    'optA','optB','optC','optD',
    'answer','answerText','explanation',
    'difficulty','qType','repeatsIn','paper'
  ];

  // Reorder every row
  const reordered = data.map(function(row) {
    return NEW_ORDER.map(function(i) { return i < row.length ? row[i] : ''; });
  });

  // Force correct headers on row 0
  reordered[0] = NEW_HEADERS;

  // Write back
  sheet.clearContents();
  sheet.getRange(1, 1, reordered.length, NEW_HEADERS.length).setValues(reordered);

  // Style header
  const hr = sheet.getRange(1, 1, 1, NEW_HEADERS.length);
  hr.setBackground('#1e3a8a');
  hr.setFontColor('#ffffff');
  hr.setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, NEW_HEADERS.length);

  SpreadsheetApp.getUi().alert(
    '✅ Done!\n\n' +
    'All_Questions_v2 columns are now in the correct order:\n' +
    'id | year | subject | subTopic | question | optA | optB | optC | optD |\n' +
    'answer | answerText | explanation | difficulty | qType | repeatsIn | paper\n\n' +
    'Now create your All_Questions_HI tab with the same column order.'
  );
}
