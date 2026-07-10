import requests, re, csv, time
from bs4 import BeautifulSoup

EXAMS = [
    {'id':'64','year':'2018','pages':8,'base':'https://theexampillar.com/bihar-pcs-64th-pre-exam-2018-answer-key-in-english/'},
    {'id':'65','year':'2019','pages':8,'base':'https://theexampillar.com/bihar-pcs-65th-pre-exam-paper-2019-answer-key-english/'},
    {'id':'66','year':'2020','pages':8,'base':'https://theexampillar.com/66th-bpsc-cce-prelims-exam-27-dec-2020-answer-key-in-english/'},
    {'id':'67','year':'2022','pages':8,'base':'https://theexampillar.com/bpsc-67th-combined-competitive-pre-re-exam-30-sep-2022-answer-key-in-english/'},
    {'id':'68','year':'2023','pages':8,'base':'https://theexampillar.com/bpsc-68th-cce-prelims-exam-12-feb-2023-answer-key/'},
    {'id':'69','year':'2023','pages':8,'base':'https://theexampillar.com/69th-bpsc-prelims-exam-30-sep-2023-english-language-answer-key/'},
    {'id':'70','year':'2024','pages':8,'base':'https://theexampillar.com/70th-bpsc-prelims-exam-13-december-2024-answer-key/'},
]

SUBJECT_RULES = [
    ('Polity',         ['constitution','parliament','president','governor','article','lok sabha','rajya sabha',
                        'supreme court','high court','directive','fundamental','amendment','election commission',
                        'panchayat','municipality','attorney general','solicitor']),
    ('Modern History', ['british','mughal','colonial','revolt','gandhi','nehru','congress','independence',
                        'partition','1857','sepoy','viceroy','governor general','east india','bentinck',
                        'curzon','dalhousie','wellesley','cornwallis','clive','plassey','buxar',
                        'quit india','non cooperation','civil disobedience','khilafat','swadeshi',
                        'montagu','morley','rowlatt','jallianwala','simon','round table','cripps',
                        'satyagraha','bhagat','subhas','iqbal','tilak','lala','dar-ul-islam','khalifa',
                        'tughluq','delhi sultanate','akbar','aurangzeb','shah jahan','iltutmish','balban']),
    ('Ancient History',['maurya','gupta','chandragupta','ashoka','harsha','vedic','indus','harappan',
                        'mohenjo','buddhism','jainism','buddha','mahavira','sangam','chola','pallava',
                        'chalukya','rashtrakuta','pala','vardhana','pushyabhuti','kushana','satavahana',
                        'bimbisara','ajatashatru','magadha','pataliputra','roman empire','buddhist council']),
    ('Geography',      ['river','mountain','plateau','climate','monsoon','soil','crop','mineral','dam',
                        'national park','wildlife','forest','latitude','longitude','tropic','ocean',
                        'delta','estuary','peninsula','island','bay','gulf','strait','pass']),
    ('Economy',        ['gdp','inflation','budget','fiscal','monetary','rbi','bank','sebi','niti',
                        'planning','five year','poverty','unemployment','tax','gst','revenue',
                        'finance commission','disinvestment','fdi','fii','balance of payment']),
    ('Science',        ['element','compound','atom','molecule','force','energy','motion','light',
                        'electricity','magnet','acid','base','salt','metal','nonmetal','alloy',
                        'cell','tissue','organ','photosynthesis','respiration','dna','gene',
                        'disease','bacteria','virus','vitamin','hormone']),
    ('Environment',    ['pollution','ecology','ecosystem','biodiversity','greenhouse','ozone',
                        'climate change','global warming','carbon','kyoto','paris agreement',
                        'ramsar','wildlife protection','endangered','tiger','project tiger']),
    ('Bihar Special',  ['bihar','patna','nalanda','bodh gaya','vikramshila','rajgir',
                        'vaishali','mithila','champaran','sonepur','chhath','santhal','chauri']),
    ('Current Affairs',['recently','latest','appointed','launched','inaugurated','summit']),
]

def classify_subject(text):
    t = text.lower()
    for subject, keywords in SUBJECT_RULES:
        if any(k in t for k in keywords):
            return subject
    return 'General Studies'

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def fetch_page(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code == 200:
            return r.text
        print("  HTTP " + str(r.status_code) + ": " + url)
        return None
    except Exception as e:
        print("  Error: " + str(e))
        return None

def parse_questions(html, exam_id, year):
    soup = BeautifulSoup(html, 'html.parser')
    content = soup.find('article') or soup.find('div', class_='entry-content') or soup
    text = content.get_text('\n', strip=True)
    questions = []

    blocks = re.split(r'\n(?=\d{1,3}[.)]\s+[A-Z])', text)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        num_match = re.match(r'^(\d{1,3})[.)]\s+(.+)', block, re.DOTALL)
        if not num_match:
            continue

        q_num = int(num_match.group(1))
        rest  = num_match.group(2).strip()

        ans_match = re.search(r'Answer\s*[-–:]\s*\(?([A-Ea-e])\)?', rest, re.IGNORECASE)
        if not ans_match:
            continue

        answer_ltr = ans_match.group(1).upper()
        rest = rest[:ans_match.start()].strip()

        first_opt = re.search(r'\([A-Ea-e]\)', rest)
        q_text = rest[:first_opt.start()].strip() if first_opt else rest
        q_text = re.sub(r'\s+', ' ', q_text).strip()

        if len(q_text) < 10:
            continue

        opts = {}
        if first_opt:
            for ltr, txt in re.findall(r'\(([A-Ea-e])\)\s*(.+?)(?=\n\([A-Ea-e]\)|$)', rest, re.DOTALL):
                opts[ltr.upper()] = txt.strip().replace('\n', ' ')

        correct_text = opts.get(answer_ltr, '')
        q_id = 'BPSC_' + exam_id + '_' + str(q_num).zfill(3)
        subject = classify_subject(q_text + ' ' + ' '.join(opts.values()))

        questions.append({
            'Q_ID': q_id, 'Year': year, 'Subject': subject, 'Sub_Topic': '',
            'Question': q_text,
            'Opt_A': opts.get('A',''), 'Opt_B': opts.get('B',''),
            'Opt_C': opts.get('C',''), 'Opt_D': opts.get('D',''),
            'Correct_Answer': answer_ltr, 'Correct_Option_Text': correct_text,
            'Explanation': '', 'Difficulty': 'Medium', 'Question_Type': 'MCQ',
            'Repeats_In': '', 'Zone': '',
        })

    return questions

def scrape_exam(exam):
    all_qs = []
    print("\nScraping BPSC " + exam['id'] + "th (" + exam['year'] + ")...")
    for pg in range(1, exam['pages'] + 1):
        url = exam['base'] if pg == 1 else exam['base'].rstrip('/') + '/' + str(pg) + '/'
        print("  Page " + str(pg) + "...")
        html = fetch_page(url)
        if not html:
            break
        qs = parse_questions(html, exam['id'], exam['year'])
        print("    -> " + str(len(qs)) + " questions")
        all_qs.extend(qs)
        time.sleep(1)
    return all_qs

def main():
    output = 'D:/uppsc_pyq/BPSC_questions.csv'
    fieldnames = ['Q_ID','Year','Subject','Sub_Topic','Question',
                  'Opt_A','Opt_B','Opt_C','Opt_D','Correct_Answer',
                  'Correct_Option_Text','Explanation','Difficulty','Question_Type','Repeats_In','Zone']

    all_questions = []
    for exam in EXAMS:
        qs = scrape_exam(exam)
        all_questions.extend(qs)

    seen = set()
    deduped = []
    for q in all_questions:
        key = q['Question'][:80].lower()
        if key not in seen:
            seen.add(key)
            deduped.append(q)

    print("\nTotal unique questions: " + str(len(deduped)))

    with open(output, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(deduped)

    print("Saved to " + output)

if __name__ == '__main__':
    main()
