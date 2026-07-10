"""
Translate BPSC English CSV to Hindi
Usage: python translate_to_hindi.py
Input:  D:/uppsc_pyq/BPSC_questions.csv   (English)
Output: D:/uppsc_pyq/BPSC_questions_hi.csv (Hindi)
"""

import csv, time
from deep_translator import GoogleTranslator

INPUT  = 'D:/uppsc_pyq/BPSC_questions.csv'
OUTPUT = 'D:/uppsc_pyq/BPSC_questions_hi.csv'

# Columns to translate
TRANSLATE_COLS = ['Question', 'Opt_A', 'Opt_B', 'Opt_C', 'Opt_D', 'Correct_Option_Text', 'Explanation']

def tr(text):
    if not text or not text.strip():
        return text
    try:
        return GoogleTranslator(source='en', target='hi').translate(text)
    except Exception as e:
        print(f"  [warn] translation failed: {e}")
        return text

def main():
    with open(INPUT, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    print(f"Translating {len(rows)} questions to Hindi...")
    fieldnames = list(rows[0].keys())

    with open(OUTPUT, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for i, row in enumerate(rows, 1):
            new_row = dict(row)
            for col in TRANSLATE_COLS:
                if new_row.get(col):
                    new_row[col] = tr(new_row[col])
            writer.writerow(new_row)

            if i % 10 == 0:
                print(f"  {i}/{len(rows)} done...")
                time.sleep(0.5)  # avoid rate limit

    print(f"\nDone! Saved to {OUTPUT}")

if __name__ == '__main__':
    main()
