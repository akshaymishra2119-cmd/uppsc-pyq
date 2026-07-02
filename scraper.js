// ============================================================
// UPPSC Portal — Auto News Scraper
// Scrapes PIB + Jagran Josh RSS, categorises, returns items
// Called by server.js cron  OR  Claude scheduled task via API
// ============================================================

const https = require('https');
const http  = require('http');

// ── Fetch a URL (no external deps — uses built-in https/http) ─
function fetchUrl(url, timeoutMs = 15000, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': 'https://www.google.com/',
        'Cache-Control': 'no-cache',
      }
    };
    const req = mod.get(url, options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return fetchUrl(next, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
      }
      if (res.statusCode === 403 || res.statusCode === 404 || res.statusCode === 429) {
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
  });
}

// ── Strip HTML tags ──────────────────────────────────────────
function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// ── Parse RSS XML → array of {title, description, link, pubDate} ─
function parseRSS(xml) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1];
    const get   = tag => { const t = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i').exec(block); return t ? stripHtml(t[1] || t[2] || '') : ''; };
    items.push({ title: get('title'), description: get('description'), link: get('link'), pubDate: get('pubDate') });
  }
  return items;
}

// ── Category keywords ────────────────────────────────────────
const CATEGORIES = {
  'Awards & Honours':       /\b(award|honour|medal|prize|padma|bharat ratna|felicitat|recogni[sz])/i,
  'Places in News':         /\b(inaugurat|launch|dedicat|open|dam|bridge|tunnel|airport|port|project|expressway|highway|stadium|temple|museum)/i,
  'Maps in News':           /\b(border|territory|district|state|region|province|map|zone|area|delimitat|survey)/i,
  'Personalities in News':  /\b(appoint|nominat|elect|honoured|receiv|celebrat|demise|passes? away|death|born|biograph)/i,
  'Government Schemes':     /\b(scheme|yojana|mission|policy|program|initiative|portal|app|launch|implement|guideline)/i,
  'Sports':                 /\b(gold|silver|bronze|champion|tournament|cup|open|match|series|win|medal|athlete|cricket|hockey|badminton|chess|olympic|CWG|commonwealth)/i,
  'Science & Technology':   /\b(ISRO|DRDO|satellite|rocket|AI|technology|innovation|research|discover|invent|space|launch|mission|nuclear|hydrogen|solar)/i,
  'Economy & Banking':      /\b(GDP|RBI|rate|rupee|inflation|budget|trade|export|import|market|index|ranking|economy|bank|finance|loan|fund)/i,
  'Books & Authors':        /\b(book|novel|author|literature|poetry|biography|publish|pen award|sahitya|write|wrote)/i,
  'Appointments':           /\b(appoint|sworn|director general|CEO|MD|chairman|governor|chief|head|secretary|officer|DGP|CJI|IAS|IPS)/i,
  'Reports & Indices':      /\b(report|index|rank|survey|HDI|GFI|WEF|IMF|world bank|UNDP|UNICEF|WHO|global|annual report)/i,
  'Summits & Agreements':   /\b(summit|agreement|MoU|treaty|bilateral|multilateral|G20|G7|BRICS|SCO|QUAD|ASEAN|accord|sign|deal)/i,
  'Current Affairs':        /.*/,   // catch-all
};

function categorise(title, desc) {
  const text = title + ' ' + desc;
  for (const [cat, rx] of Object.entries(CATEGORIES)) {
    if (rx.test(text)) return cat;
  }
  return 'Current Affairs';
}

// ── MCQ template generator ───────────────────────────────────
function generateMCQ(title, category, detail) {
  const t = title.trim();
  // Pattern: extract key entity and value from common headline formats
  const patterns = [
    // "X appointed as Y"
    { rx: /^(.+?)\s+appointed\s+as\s+(.+)/i, fn: (_, p, r) => `Who was appointed as ${r.trim()}? → ${p.trim()}` },
    // "India ranks Nth in X"
    { rx: /India\s+ranks?\s+(\d+\w*)\s+in\s+(.+)/i, fn: (_, n, idx) => `What is India's rank in ${idx.trim()}? → ${n.trim()}` },
    // "X wins Y award"
    { rx: /^(.+?)\s+wins?\s+(.+?award.*)/i, fn: (_, who, award) => `Who won ${award.trim()}? → ${who.trim()}` },
    // "X launched/inaugurated Y"
    { rx: /^(.+?)\s+(launches?|inaugurates?|dedicates?)\s+(.+)/i, fn: (_, who, v, what) => `Who ${v.trim()} ${what.trim()}? → ${who.trim()}` },
    // "Operation X"
    { rx: /Operation\s+(\w+)/i, fn: (_, name) => `Operation ${name} is associated with which context? → ${detail.split('.')[0].trim() || t}` },
    // "X signs MoU/agreement with Y"
    { rx: /^(.+?)\s+signs?\s+(MoU|agreement|deal)\s+with\s+(.+)/i, fn: (_, a, type, b) => `${a.trim()} signed a ${type} with which country/organisation? → ${b.trim()}` },
    // "X Summit held in Y"
    { rx: /(.+?Summit)\s+held\s+in\s+(.+)/i, fn: (_, s, place) => `Where was the ${s.trim()} held? → ${place.trim()}` },
    // "India's first X"
    { rx: /India'?s?\s+first\s+(.+)/i, fn: (_, what) => `What is India's first ${what.trim().split(' ').slice(0,5).join(' ')}? → ${detail.split('.')[0].trim() || t}` },
    // Default: generic
  ];
  for (const { rx, fn } of patterns) {
    const m = t.match(rx);
    if (m) return fn(...m);
  }
  // Generic fallback based on category
  const genericMap = {
    'Awards & Honours':      `Which award/honour is highlighted in this news? → ${t}`,
    'Sports':                `What sports achievement is described here? → ${t}`,
    'Economy & Banking':     `What key economic development does this news highlight? → ${t}`,
    'Science & Technology':  `Which technological achievement/development is mentioned? → ${t}`,
    'Government Schemes':    `Which government scheme/policy is highlighted? → ${t}`,
    'Summits & Agreements':  `What international agreement or summit is mentioned? → ${t}`,
    'Appointments':          `Who holds the position mentioned in this news? → ${t}`,
    'Reports & Indices':     `Which report or index is referred to in this news? → ${t}`,
  };
  return genericMap[category] || `What is significant about this news? → ${t}`;
}

// ── RSS Feed sources ─────────────────────────────────────────
// type 'uppsc' → uppscNews tab, type 'ca' → currentAffairs tab
// UPPSC keyword-filtering applied to 'uppsc' sources automatically
const FEEDS = [
  // NDTV — confirmed working ✅
  { name: 'NDTV India',     url: 'https://feeds.feedburner.com/ndtvnews-india-news',               type: 'ca'    },
  { name: 'NDTV Top',       url: 'https://feeds.feedburner.com/ndtvnews-top-stories',              type: 'ca'    },
  // The Hindu — confirmed working ✅
  { name: 'The Hindu',      url: 'https://www.thehindu.com/feeder/default.rss',                    type: 'uppsc' },
  // Indian Express — confirmed working ✅
  { name: 'Indian Express', url: 'https://indianexpress.com/feed/',                                type: 'ca'    },
  // TOI India — confirmed working ✅
  { name: 'TOI India',      url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',     type: 'uppsc' },
  // Hindustan Times — confirmed working ✅
  { name: 'HT',             url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', type: 'uppsc' },
];

// ── Main scrape function ─────────────────────────────────────
async function scrapeAll() {
  const results = { uppscNews: [], currentAffairs: [], errors: [] };
  const today   = new Date();
  const dateStr = `${today.getDate()} ${today.toLocaleString('en-IN',{month:'short'})} ${today.getFullYear()}`;

  for (const feed of FEEDS) {
    try {
      console.log(`🔍 Scraping ${feed.name}...`);
      const xml   = await fetchUrl(feed.url);
      const items = parseRSS(xml);
      console.log(`   → ${items.length} items`);

      for (const item of items.slice(0, 15)) {
        if (!item.title || item.title.length < 10) continue;
        const category = categorise(item.title, item.description);
        const detail   = item.description || item.title;
        const mcq      = generateMCQ(item.title, category, detail);

        const news = {
          date:      dateStr,
          category,
          headline:  item.title,
          detail:    detail.slice(0, 300),
          source:    feed.name,
          relevance: ['Awards & Honours','Appointments','Science & Technology','Economy & Banking','Summits & Agreements'].includes(category) ? 'High' : 'Medium',
          tags:      category,
          mcq,
          link:      item.link || '',
        };

        if (feed.type === 'uppsc') results.uppscNews.push(news);
        else                       results.currentAffairs.push(news);
      }
    } catch (e) {
      console.warn(`⚠️  ${feed.name} failed: ${e.message}`);
      results.errors.push(`${feed.name}: ${e.message}`);
    }
  }

  console.log(`✅ Scrape done — ${results.uppscNews.length} UPPSC + ${results.currentAffairs.length} CA`);
  return results;
}

module.exports = { scrapeAll, generateMCQ, categorise };
