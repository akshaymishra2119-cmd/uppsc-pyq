// Daily news ingestion for UPPSC Portal
// Runs via GitHub Actions at 12:00 PM IST every day
// Fetches UP news + Current Affairs from RSS feeds and POSTs to Railway

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://uppsc-pyq-production.up.railway.app';

// RSS sources — GitHub Actions IPs are NOT blocked by these
const UP_FEEDS = [
  'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',          // PIB UP region
  'https://timesofindia.indiatimes.com/rssfeeds/1081153148.cms',       // TOI UP/Uttarakhand
  'https://www.ndtv.com/rss/india',                                     // NDTV India
];

const CA_FEEDS = [
  'https://www.thehindu.com/news/national/feeder/default.rss',          // The Hindu national
  'https://www.gktoday.in/feed/',                                        // GK Today
  'https://www.insightsonindia.com/feed/',                               // Insights on India
  'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',                    // PIB national
];

const UP_KEYWORDS = [
  'uttar pradesh', ' up ', 'uppsc', 'yogi', 'lucknow', 'varanasi',
  'prayagraj', 'allahabad', 'agra', 'kanpur', 'noida', 'meerut',
  'gorakhpur', 'ayodhya', 'mathura', 'aligarh', 'bareilly',
  'ganga expressway', 'purvanchal', 'bundelkhand', 'vindhyachal',
];

// Parse RSS XML without external deps
function parseRSS(xml) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const found = r.exec(block);
      return found ? found[1].replace(/<[^>]+>/g, '').trim() : '';
    };
    const title   = get('title');
    const desc    = get('description').slice(0, 400);
    const link    = get('link') || get('guid');
    const pubDate = get('pubDate');
    if (title.length > 10) items.push({ title, desc, link, pubDate });
  }
  return items;
}

async function fetchFeed(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UPPSCBot/1.0)' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return parseRSS(await res.text());
  } catch (e) {
    console.warn(`Feed failed (${url}): ${e.message}`);
    return [];
  }
}

function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
}

function isRecent(pubDate) {
  if (!pubDate) return false;
  const d = new Date(pubDate);
  if (isNaN(d)) return false;
  return (Date.now() - d.getTime()) < 30 * 60 * 60 * 1000; // last 30h
}

function categorizeUP(text) {
  const t = text.toLowerCase();
  if (/uppsc|pcs\s*20|uptet|upsssc|exam|recruitment|vacancy|notification/.test(t)) return 'PCS Exam';
  if (/expressway|highway|metro|bridge|airport|infra/.test(t))  return 'UP Infrastructure';
  if (/farmer|kisan|crop|agri|stubble|irrigation/.test(t))      return 'UP Agriculture';
  if (/budget|odop|gdp|economy|invest|export|msme/.test(t))     return 'UP Economy';
  if (/scheme|yojana|mission|abhiyan|portal|launch/.test(t))    return 'UP Schemes';
  if (/police|crime|fire|accident|law|order/.test(t))           return 'UP Law & Order';
  if (/culture|heritage|festival|kumbh|temple/.test(t))         return 'UP Culture & Heritage';
  if (/environment|forest|wildlife|pollution|ramsar/.test(t))   return 'UP Environment';
  return 'UP Polity';
}

function categorizeCA(text) {
  const t = text.toLowerCase();
  if (/rbi|repo|inflation|gdp|economy|budget|trade|fdi/.test(t))         return 'Economy';
  if (/india-|summit|bilateral|treaty|un |g20|brics|imf|world bank/.test(t)) return 'International';
  if (/isro|drdo|space|ai |technology|cyber|satellite/.test(t))          return 'Science & Tech';
  if (/climate|environment|cop|ndc|wildlife|forest|disaster/.test(t))    return 'Environment';
  if (/election|constitution|parliament|court|bill|act/.test(t))         return 'Polity';
  if (/award|prize|sport|olympic|commonwealth/.test(t))                  return 'Awards & Sports';
  if (/army|navy|air force|defence|drdo|operation/.test(t))             return 'Defence';
  return 'Government';
}

async function main() {
  const today    = todayLabel();
  const seen     = new Set();
  const uppscNews    = [];
  const currentAffairs = [];

  console.log(`\n=== Daily News Ingest: ${today} ===\n`);

  // ── UP News ────────────────────────────────────────────────
  for (const url of UP_FEEDS) {
    const items = await fetchFeed(url);
    console.log(`  UP feed ${url.split('/')[2]}: ${items.length} raw items`);
    for (const item of items) {
      if (!isRecent(item.pubDate)) continue;
      const key = item.title.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      const combined = (item.title + ' ' + item.desc).toLowerCase();
      const isUP = UP_KEYWORDS.some(kw => combined.includes(kw));
      if (!isUP) continue;
      seen.add(key);
      const cat = categorizeUP(combined);
      uppscNews.push({
        date: today,
        category: cat,
        headline: item.title,
        detail: item.desc || item.title,
        relevance: ['PCS Exam','UP Economy','UP Polity'].includes(cat) ? 'High' : 'Medium',
        source: new URL(url).hostname.replace('www.', ''),
        tags: cat,
        link: item.link,
      });
    }
  }

  // ── Current Affairs ────────────────────────────────────────
  for (const url of CA_FEEDS) {
    const items = await fetchFeed(url);
    console.log(`  CA feed ${url.split('/')[2]}: ${items.length} raw items`);
    for (const item of items) {
      if (!isRecent(item.pubDate)) continue;
      const key = item.title.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cat = categorizeCA(item.title + ' ' + item.desc);
      currentAffairs.push({
        date: today,
        category: cat,
        headline: item.title,
        detail: item.desc || item.title,
        relevance: ['Economy','International','Polity'].includes(cat) ? 'High' : 'Medium',
        source: new URL(url).hostname.replace('www.', ''),
        tags: cat,
        link: item.link,
      });
    }
  }

  console.log(`\nCollected: ${uppscNews.length} UP news, ${currentAffairs.length} CA items`);

  if (uppscNews.length === 0 && currentAffairs.length === 0) {
    console.log('Nothing new — exiting.');
    return;
  }

  // ── POST to Railway ────────────────────────────────────────
  const res = await fetch(`${RAILWAY_URL}/api/ingestNews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uppscNews, currentAffairs }),
  });

  if (!res.ok) {
    console.error(`Railway API error: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log('Result:', JSON.stringify(result));
  console.log(`Done. Added ${result.added} new items.`);
}

main().catch(e => { console.error(e); process.exit(1); });
