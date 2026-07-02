// Daily UPSC/UPPSC News Ingestion — runs via GitHub Actions at 12:00 PM IST
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://uppsc-pyq-production.up.railway.app';

const UP_FEEDS = [
  'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
  'https://timesofindia.indiatimes.com/rssfeeds/1081153148.cms',
];
const CA_FEEDS = [
  'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
  'https://www.thehindu.com/news/national/feeder/default.rss',
  'https://www.thehindu.com/business/Economy/feeder/default.rss',
  'https://www.gktoday.in/feed/',
];

const UP_INCLUDE = [
  'uttar pradesh',' up ','uppsc','upsc','pcs','lucknow','yogi',
  'varanasi','prayagraj','allahabad','ayodhya','expressway',
  'ganga','bundelkhand','purvanchal','odop','mission shakti',
  'up government','up cabinet','up budget','up scheme','cm yogi',
  'up police','up tet','up board','kumbh','digital up',
];
const CA_INCLUDE = [
  'rbi','repo rate','inflation','gdp','budget','fiscal','sebi','fdi',
  'export','trade deficit','upi','digital rupee',
  'constitution','supreme court','parliament','lok sabha','rajya sabha',
  'election commission','cabinet approved','cabinet clears','ordinance',
  'scheme launched','mission launched','yojana','portal launched',
  'india-','bilateral','quad','brics','g20','g7','sco','united nations',
  'un ','imf','world bank','wto','asean','summit','treaty','mou signed',
  'isro','drdo','space mission','satellite','nuclear','missile','defence',
  'technology mission','quantum','semiconductor','5g','cybersecurity',
  'climate change','cop','paris agreement','net zero','ramsar',
  'tiger reserve','biosphere reserve','national park','wildlife',
  'pollution','renewable energy','solar',
  'pm modi','pradhan mantri','central government',
  'health mission','education policy','nep','skill india',
  'make in india','atmanirbhar','swachh bharat',
  'bharat ratna','padma','nobel','gallantry award',
];
const EXCLUDE = [
  'cricket','ipl','bollywood','celebrity','actor','actress','film',
  'movie','box office','entertainment','fashion','horoscope','astrology',
  'viral','trending','murder','rape','road accident','road crash',
];

function parseRSS(xml) {
  const items = [];
  const rx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const b = m[1];
    const get = (tag) => {
      const r = new RegExp('<' + tag + '[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + tag + '>', 'i');
      const f = r.exec(b);
      return f ? f[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() : '';
    };
    const title = get('title');
    const desc  = get('description').slice(0,500);
    const link  = get('link') || get('guid');
    const pubDate = get('pubDate');
    if (title.length > 15) items.push({ title, desc, link, pubDate });
  }
  return items;
}

async function fetchFeed(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UPPSCBot/1.0)' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) { console.warn('  ' + url.split('/')[2] + ': HTTP ' + res.status); return []; }
    return parseRSS(await res.text());
  } catch(e) {
    console.warn('  ' + url.split('/')[2] + ' failed: ' + e.message);
    return [];
  }
}

function todayIST() {
  return new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'});
}
function isRecent(pubDate) {
  if (!pubDate) return true;
  const d = new Date(pubDate);
  return isNaN(d) || (Date.now() - d.getTime()) < 28*60*60*1000;
}
function check(text, list) { const t = text.toLowerCase(); return list.some(kw => t.includes(kw)); }

function catUP(t) {
  const s = t.toLowerCase();
  if (/uppsc|pcs\s*20\d\d|uptet|upsssc|exam|recruitment|vacancy/.test(s)) return 'PCS Exam';
  if (/expressway|highway|metro|airport|bridge|infra/.test(s))             return 'UP Infrastructure';
  if (/farmer|kisan|crop|agri|stubble|irrigation/.test(s))                 return 'UP Agriculture';
  if (/budget|odop|economy|invest|export|msme|startup/.test(s))            return 'UP Economy';
  if (/scheme|yojana|mission|abhiyan|portal|launch/.test(s))               return 'UP Schemes';
  if (/police|crime|fire|law|court|encounter/.test(s))                     return 'UP Law & Order';
  if (/culture|heritage|festival|kumbh|temple/.test(s))                    return 'UP Culture & Heritage';
  if (/environment|forest|wildlife|pollution|ramsar/.test(s))              return 'UP Environment';
  return 'UP Polity';
}
function catCA(t) {
  const s = t.toLowerCase();
  if (/rbi|repo|inflation|gdp|budget|fiscal|sebi|fdi|trade|economy/.test(s))  return 'Economy';
  if (/india-|bilateral|quad|brics|g20|summit|treaty|un |imf|wto/.test(s))    return 'International';
  if (/isro|drdo|space|satellite|nuclear|missile|defence|cyber/.test(s))       return 'Science & Tech';
  if (/climate|cop|ramsar|wildlife|forest|disaster|cyclone|solar/.test(s))     return 'Environment';
  if (/constitution|parliament|court|election|bill|ordinance|cabinet/.test(s)) return 'Polity';
  if (/award|padma|bharat ratna|nobel|gallantry/.test(s))                      return 'Awards & Sports';
  if (/army|navy|air force|operation|missile/.test(s))                         return 'Defence';
  return 'Government';
}

async function main() {
  const today = todayIST();
  console.log('\n=== UPSC/UPPSC News Ingest: ' + today + ' ===\n');

  const seen = new Set();
  const uppscNews = [];
  const currentAffairs = [];

  for (const url of UP_FEEDS) {
    const items = await fetchFeed(url);
    let added = 0;
    for (const item of items) {
      if (!isRecent(item.pubDate)) continue;
      const key = item.title.slice(0,70).toLowerCase().trim();
      if (seen.has(key)) continue;
      const combined = item.title + ' ' + item.desc;
      if (check(combined, EXCLUDE)) continue;
      if (!check(combined, UP_INCLUDE)) continue;
      seen.add(key);
      added++;
      const cat = catUP(combined);
      uppscNews.push({ date:today, category:cat, headline:item.title,
        detail:item.desc||item.title, relevance:'High',
        source:new URL(url).hostname.replace('www.',''), tags:cat, link:item.link });
    }
    console.log('  UP  | ' + url.split('/')[2] + ': ' + items.length + ' fetched, ' + added + ' relevant');
  }

  for (const url of CA_FEEDS) {
    const items = await fetchFeed(url);
    let added = 0;
    for (const item of items) {
      if (!isRecent(item.pubDate)) continue;
      const key = item.title.slice(0,70).toLowerCase().trim();
      if (seen.has(key)) continue;
      const combined = item.title + ' ' + item.desc;
      if (check(combined, EXCLUDE)) continue;
      if (!check(combined, CA_INCLUDE)) continue;
      seen.add(key);
      added++;
      const cat = catCA(combined);
      currentAffairs.push({ date:today, category:cat, headline:item.title,
        detail:item.desc||item.title,
        relevance:['Economy','International','Polity','Defence'].includes(cat)?'High':'Medium',
        source:new URL(url).hostname.replace('www.',''), tags:cat, link:item.link });
    }
    console.log('  CA  | ' + url.split('/')[2] + ': ' + items.length + ' fetched, ' + added + ' relevant');
  }

  console.log('\nTotal: ' + uppscNews.length + ' UP + ' + currentAffairs.length + ' CA\n');
  if (!uppscNews.length && !currentAffairs.length) { console.log('Nothing relevant today.'); return; }

  const res = await fetch(RAILWAY_URL + '/api/ingestNews', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ uppscNews, currentAffairs }),
  });
  if (!res.ok) { console.error('Railway error ' + res.status + ': ' + await res.text()); process.exit(1); }
  const result = await res.json();
  console.log('Done. added=' + result.added);
}

main().catch(e => { console.error(e); process.exit(1); });
