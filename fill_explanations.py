"""
Fill Explanation + generate Hindi version for BPSC questions.
- Hindi translation: Google Translate via deep-translator (FREE, no key)
- Explanations: smart template from question data (no API needed)
Outputs: BPSC_en_final.csv and BPSC_hi_final.csv

Usage:
  pip install deep-translator
  python fill_explanations.py
"""

import csv, time
from deep_translator import GoogleTranslator

INPUT   = r'D:\uppsc_pyq\BPSC_questions_fixed.csv'
OUT_EN  = r'D:\uppsc_pyq\BPSC_en_final.csv'
OUT_HI  = r'D:\uppsc_pyq\BPSC_hi_final.csv'

SUBTOPIC_HI = {
  'Revolt of 1857':                    '1857 का विद्रोह',
  'Gandhian Movements':                'गांधीवादी आंदोलन',
  'Indian National Congress':          'भारतीय राष्ट्रीय कांग्रेस',
  'Revolutionary Movements':           'क्रांतिकारी आंदोलन',
  'British Administration':            'ब्रिटिश प्रशासन',
  'Social Reform Movements':           'सामाजिक सुधार आंदोलन',
  'Partition & Independence':          'विभाजन और स्वतंत्रता',
  'Press & Literature':                'प्रेस और साहित्य',
  'Peasant & Tribal Movements':        'किसान और आदिवासी आंदोलन',
  'Constitutional Developments':       'संवैधानिक विकास',
  'Early British Conquest':            'प्रारंभिक ब्रिटिश विजय',
  'Indus Valley Civilization':         'सिंधु घाटी सभ्यता',
  'Vedic Age':                         'वैदिक काल',
  'Buddhism':                          'बौद्ध धर्म',
  'Jainism':                           'जैन धर्म',
  'Mauryan Empire':                    'मौर्य साम्राज्य',
  'Gupta Empire':                      'गुप्त साम्राज्य',
  'Post-Gupta Period':                 'गुप्तोत्तर काल',
  'Medieval Kingdoms':                 'मध्यकालीन राज्य',
  'Constitution & Constituent Assembly': 'संविधान और संविधान सभा',
  'Fundamental Rights & Duties':       'मौलिक अधिकार और कर्तव्य',
  'Directive Principles':              'नीति निदेशक तत्व',
  'Parliament':                        'संसद',
  'President & Vice President':        'राष्ट्रपति और उप राष्ट्रपति',
  'Prime Minister & Cabinet':          'प्रधानमंत्री और मंत्रिमंडल',
  'Supreme Court & Judiciary':         'सर्वोच्च न्यायालय और न्यायपालिका',
  'Governor & State Legislature':      'राज्यपाल और राज्य विधानमंडल',
  'Elections & ECI':                   'चुनाव और निर्वाचन आयोग',
  'Panchayati Raj & Municipalities':   'पंचायती राज और नगरपालिका',
  'Constitutional Amendments':         'संवैधानिक संशोधन',
  'Emergency Provisions':              'आपातकालीन प्रावधान',
  'Schedules & Lists':                 'अनुसूचियाँ और सूचियाँ',
  'Rivers & Water Bodies':             'नदियाँ और जल निकाय',
  'Mountains & Passes':                'पर्वत और दर्रे',
  'Climate & Monsoon':                 'जलवायु और मानसून',
  'Soils & Agriculture':               'मिट्टी और कृषि',
  'National Parks & Wildlife':         'राष्ट्रीय उद्यान और वन्यजीव',
  'Minerals & Energy':                 'खनिज और ऊर्जा',
  'Indian States & Cities':            'भारतीय राज्य और शहर',
  'World Geography':                   'विश्व भूगोल',
  'Transport & Industry':              'परिवहन और उद्योग',
  'Planning & Five Year Plans':        'योजना और पंचवर्षीय योजनाएँ',
  'Banking & Finance':                 'बैंकिंग और वित्त',
  'Budget & Fiscal Policy':            'बजट और राजकोषीय नीति',
  'Agriculture & Rural Economy':       'कृषि और ग्रामीण अर्थव्यवस्था',
  'Trade & Industry':                  'व्यापार और उद्योग',
  'Poverty & Employment':              'गरीबी और रोजगार',
  'Schemes & Programmes':              'योजनाएँ और कार्यक्रम',
  'Physics':                           'भौतिकी',
  'Chemistry':                         'रसायन विज्ञान',
  'Biology & Health':                  'जीव विज्ञान और स्वास्थ्य',
  'Technology & Computers':            'प्रौद्योगिकी और कंप्यूटर',
  'Climate Change & Pollution':        'जलवायु परिवर्तन और प्रदूषण',
  'Ecology & Biodiversity':            'पारिस्थितिकी और जैव विविधता',
  'Bihar History':                     'बिहार का इतिहास',
  'Bihar Geography & Economy':         'बिहार का भूगोल और अर्थव्यवस्था',
  'Bihar Culture & Persons':           'बिहार की संस्कृति और व्यक्तित्व',
  'Bihar Polity':                      'बिहार की राजव्यवस्था',
  'International Affairs':             'अंतर्राष्ट्रीय मामले',
  'Awards & Sports':                   'पुरस्कार और खेल',
  'Appointments & Reports':            'नियुक्तियाँ और रिपोर्ट',
  'General Studies':                   'सामान्य अध्ययन',
}

TRANSLATE_COLS = ['Question', 'Opt_A', 'Opt_B', 'Opt_C', 'Opt_D', 'Correct_Option_Text', 'Explanation']

def tr(text):
    if not text or not str(text).strip():
        return text
    try:
        return GoogleTranslator(source='en', target='hi').translate(str(text))
    except Exception as e:
        print(f'  [translate warn] {e}')
        time.sleep(2)
        return text

def make_explanation(row):
    """Generate a factual explanation from structured data — no AI needed."""
    ans    = row.get('Correct_Option_Text', '').strip()
    subj   = row.get('Subject', '').strip()
    topic  = row.get('Sub_Topic', '').strip()
    year   = row.get('Year', '').strip()
    opt_a  = row.get('Opt_A', '')
    opt_b  = row.get('Opt_B', '')
    opt_c  = row.get('Opt_C', '')
    opt_d  = row.get('Opt_D', '')
    correct= row.get('Correct_Answer', 'A')

    # How many options? Narrow down distractor count
    distractors = [o for o in [opt_a, opt_b, opt_c, opt_d]
                   if o.strip() and o.strip() != ans]
    distractor_str = ', '.join(f'"{d}"' for d in distractors[:2]) if distractors else ''

    exp = f'The correct answer is "{ans}". '
    if topic and topic != 'General Studies':
        exp += f'This is a key fact under {topic} ({subj}). '
    else:
        exp += f'This falls under {subj}. '
    if distractor_str:
        exp += f'Common distractors like {distractor_str} are incorrect. '
    exp += f'This topic has appeared in BPSC exams and is important for revision.'
    return exp.strip()

def _save(path, fieldnames, rows):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

def main():
    with open(INPUT, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))
    fieldnames = list(rows[0].keys())

    en_rows = [dict(r) for r in rows]
    hi_rows = [dict(r) for r in rows]
    total = len(rows)

    print(f"Processing {total} questions — EN explanations + Hindi translation...")

    for i, row in enumerate(rows):
        print(f"[{i+1}/{total}] {row['Q_ID']}...", end=' ', flush=True)

        # ── English explanation (template, instant) ───────
        exp_en = make_explanation(row)
        en_rows[i]['Explanation'] = exp_en

        # ── Hindi row: translate all text columns ─────────
        for col in TRANSLATE_COLS:
            val = row[col] if col != 'Explanation' else exp_en
            hi_rows[i][col] = tr(val)
            time.sleep(0.3)  # avoid Google rate limit

        hi_rows[i]['Sub_Topic'] = SUBTOPIC_HI.get(row['Sub_Topic'], row['Sub_Topic'])
        print('done')

        # checkpoint every 50
        if (i + 1) % 50 == 0:
            _save(OUT_EN, fieldnames, en_rows)
            _save(OUT_HI, fieldnames, hi_rows)
            print(f"  ✓ Checkpoint saved at {i+1}/{total}")
            time.sleep(2)

    _save(OUT_EN, fieldnames, en_rows)
    _save(OUT_HI, fieldnames, hi_rows)
    print(f"\nDone!\n  EN → {OUT_EN}\n  HI → {OUT_HI}")

if __name__ == '__main__':
    main()
