// ============================================================
// UPPSC Portal — Current Affairs Scraper
// Sources: Vision IAS · Drishti IAS · Insights on India
// Fetches via rss2json proxy (avoids Railway IP blocks)
// Articles tagged by actual pubDate for day-wise CA tab
// ============================================================

const https = require('https');
const http  = require('http');

// ── Fetch a URL ──────────────────────────────────────────────
function fetchUrl(url, timeoutMs = 20000, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
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

// ── Strip HTML ───────────────────────────────────────────────
function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

// ── Format a Date object → "15 Jul 2026" ────────────────────
function fmtDate(d) {
  if (!d || isNaN(d.getTime())) return null;
  return d.getDate() + ' ' + d.toLocaleString('en-IN', { month: 'short' }) + ' ' + d.getFullYear();
}

// ── Parse pubDate string → Date ──────────────────────────────
function parsePubDate(str) {
  if (!str) return null;
  try { const d = new Date(str); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

// ── Parse RSS XML ────────────────────────────────────────────
function parseRSS(xml) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRx.exec(xml)) !== null) {
    const block = m[1];
    const get = tag => {
      const t = new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'
      ).exec(block);
      return t ? stripHtml(t[1] || t[2] || '') : '';
    };
    items.push({ title: get('title'), description: get('description'), link: get('link'), pubDate: get('pubDate') });
  }
  return items;
}

// ── Fetch via rss2json proxy (bypasses Railway IP blocks) ────
async function fetchViaProxy(rssUrl, count = 30) {
  const api = `https://api.rss2json.com/v1/api.json?count=${count}&rss_url=${encodeURIComponent(rssUrl)}`;
  const raw = await fetchUrl(api);
  const data = JSON.parse(raw);
  if (data.status !== 'ok') throw new Error('rss2json status: ' + data.status);
  return (data.items || []).map(i => ({
    title:       stripHtml(i.title || ''),
    description: stripHtml(i.description || i.content || ''),
    link:        i.link || '',
    pubDate:     i.pubDate || '',
  }));
}

// ── Fetch RSS direct first, fallback to proxy ────────────────
async function fetchFeed(rssUrl, count = 30) {
  try {
    const xml = await fetchUrl(rssUrl);
    const items = parseRSS(xml);
    if (items.length > 0) return items.slice(0, count);
  } catch (e) {
    console.warn(`  Direct fetch failed (${e.message}), trying proxy…`);
  }
  return await fetchViaProxy(rssUrl, count);
}

// ── Filter out question/quiz/test content ────────────────────
const QUESTION_SKIP = [
  /\bquiz\b/i,
  /\bmock test\b/i,
  /\bpractice (question|paper|test)\b/i,
  /\bprelims (practice|question)\b/i,
  /\bmains (practice|question|answer)\b/i,
  /\binsights secure\b/i,
  /\btest series\b/i,
  /\banswer writing\b/i,
  /\bmodel answer\b/i,
  /\bupsc question\b/i,
  /^Q\.\s/i,                          // starts with "Q. "
  /^\d+\.\s+Which\b/i,                // "1. Which..."
  /^\d+\.\s+What\b/i,                 // "1. What..."
  /\(a\).*\(b\).*\(c\)/i,            // multiple-choice options in body
];

function isQuestionContent(title, desc) {
  const text = title + ' ' + (desc || '');
  return QUESTION_SKIP.some(rx => rx.test(text));
}

// ── Category keywords ────────────────────────────────────────
const CATEGORIES = {
  'Awards & Honours':      /\b(award|honour|medal|prize|padma|bharat ratna|felicitat|recogni[sz])/i,
  'Places in News':        /\b(inaugurat|launch|dedicat|open|dam|bridge|tunnel|airport|port|project|expressway|highway|stadium|temple|museum)/i,
  'Personalities in News': /\b(appoint|nominat|elect|honoured|receiv|celebrat|demise|passes? away|death|born|biograph)/i,
  'Government Schemes':    /\b(scheme|yojana|mission|policy|program|initiative|portal|launch|implement|guideline)/i,
  'Sports':                /\b(gold|silver|bronze|champion|tournament|cup|open|match|series|win|medal|athlete|cricket|hockey|badminton|chess|olympic|commonwealth)/i,
  'Science & Technology':  /\b(ISRO|DRDO|satellite|rocket|AI|technology|innovation|research|discover|invent|space|mission|nuclear|hydrogen|solar)/i,
  'Economy & Banking':     /\b(GDP|RBI|rate|rupee|inflation|budget|trade|export|import|market|index|ranking|economy|bank|finance|loan|fund)/i,
  'Appointments':          /\b(appoint|sworn|director general|CEO|MD|chairman|governor|chief|head|secretary|officer|DGP|CJI)/i,
  'Reports & Indices':     /\b(report|index|rank|survey|HDI|WEF|IMF|world bank|UNDP|UNICEF|WHO|global|annual report)/i,
  'Summits & Agreements':  /\b(summit|agreement|MoU|treaty|bilateral|multilateral|G20|G7|BRICS|SCO|QUAD|ASEAN|accord|sign|deal)/i,
  'International':         /\b(pakistan|china|russia|ukraine|usa|iran|israel|nato|united nations|UN|foreign|diplomatic)/i,
  'Environment':           /\b(climate|carbon|emission|forest|wildlife|biodiversity|tiger|elephant|wetland|pollution|COP|green)/i,
  'Current Affairs':       /.*/,
};

function categorise(title, desc) {
  const text = title + ' ' + desc;
  for (const [cat, rx] of Object.entries(CATEGORIES)) {
    if (rx.test(text)) return cat;
  }
  return 'Current Affairs';
}

// ── MCQ generator ────────────────────────────────────────────
function generateMCQ(title, category, detail) {
  const t = title.trim();
  const patterns = [
    { rx: /^(.+?)\s+appointed\s+as\s+(.+)/i,                     fn: (_, p, r) => `Who was appointed as ${r.trim()}? → ${p.trim()}` },
    { rx: /India\s+ranks?\s+(\d+\w*)\s+in\s+(.+)/i,              fn: (_, n, idx) => `What is India's rank in ${idx.trim()}? → ${n.trim()}` },
    { rx: /^(.+?)\s+wins?\s+(.+?award.*)/i,                       fn: (_, who, a) => `Who won ${a.trim()}? → ${who.trim()}` },
    { rx: /^(.+?)\s+(launches?|inaugurates?|dedicates?)\s+(.+)/i, fn: (_, who, v, what) => `Who ${v.trim()} ${what.trim()}? → ${who.trim()}` },
    { rx: /^(.+?)\s+signs?\s+(MoU|agreement|deal)\s+with\s+(.+)/i, fn: (_, a, type, b) => `${a.trim()} signed a ${type} with? → ${b.trim()}` },
    { rx: /(.+?Summit)\s+held\s+in\s+(.+)/i,                     fn: (_, s, pl) => `Where was the ${s.trim()} held? → ${pl.trim()}` },
    { rx: /India'?s?\s+first\s+(.+)/i,                            fn: (_, what) => `India's first ${what.trim().split(' ').slice(0,5).join(' ')}? → See detail` },
  ];
  for (const { rx, fn } of patterns) {
    const m = t.match(rx);
    if (m) return fn(...m);
  }
  const gMap = {
    'Awards & Honours':     `Which award is highlighted? → ${t}`,
    'Sports':               `What sports achievement? → ${t}`,
    'Economy & Banking':    `What economic development? → ${t}`,
    'Science & Technology': `Which tech achievement? → ${t}`,
    'Government Schemes':   `Which government scheme? → ${t}`,
    'Summits & Agreements': `What summit/agreement? → ${t}`,
    'Appointments':         `Who holds the position? → ${t}`,
    'Reports & Indices':    `Which report/index? → ${t}`,
  };
  return gMap[category] || `What is significant about: ${t}`;
}

// ── The 3 target sources ─────────────────────────────────────
const FEEDS = [
  {
    name:   'Drishti IAS',
    url:    'https://www.drishtiias.com/feed/',
    altUrl: 'https://www.drishtiias.com/current-affairs-news/feed/',
  },
  {
    name:   'Insights on India',
    url:    'https://www.insightsonindia.com/category/today-important-news/feed/',
    altUrl: 'https://www.insightsonindia.com/feed/',
  },
  {
    name:   'Vision IAS',
    url:    'https://www.visionias.in/resources/rss.php',
    altUrl: 'https://www.visionias.in/current-affairs/feed/',
  },
];

// ── Main scrape ──────────────────────────────────────────────
async function scrapeAll() {
  const results = { uppscNews: [], currentAffairs: [], errors: [] };
  const todayStr = fmtDate(new Date());

  for (const feed of FEEDS) {
    let items = [];
    try {
      console.log(`🔍 Fetching ${feed.name}…`);
      items = await fetchFeed(feed.url, 30);
      console.log(`   ✅ ${items.length} items from ${feed.name}`);
    } catch (e1) {
      console.warn(`   ⚠️  Primary URL failed: ${e1.message}`);
      if (feed.altUrl) {
        try {
          items = await fetchFeed(feed.altUrl, 30);
          console.log(`   ✅ Alt URL: ${items.length} items`);
        } catch (e2) {
          console.warn(`   ❌ Alt also failed: ${e2.message}`);
          results.errors.push(`${feed.name}: ${e2.message}`);
          continue;
        }
      } else {
        results.errors.push(`${feed.name}: ${e1.message}`);
        continue;
      }
    }

    for (const item of items) {
      if (!item.title || item.title.length < 10) continue;
      // Skip question/quiz/test content — news only
      if (isQuestionContent(item.title, item.description)) {
        console.log(`   ⏭  Skipped (question content): ${item.title.slice(0,60)}`);
        continue;
      }

      // Use actual pubDate from RSS — fall back to today only if missing/invalid
      const pubD    = parsePubDate(item.pubDate);
      const dateStr = fmtDate(pubD) || todayStr;

      const category  = categorise(item.title, item.description);
      const detail    = (item.description || item.title).slice(0, 400);
      const mcq       = generateMCQ(item.title, category, detail);
      const relevance = ['Awards & Honours','Appointments','Science & Technology',
                         'Economy & Banking','Summits & Agreements','Reports & Indices',
                         'Government Schemes'].includes(category) ? 'High' : 'Medium';

      results.currentAffairs.push({
        date:      dateStr,
        category,
        headline:  item.title,
        detail,
        source:    feed.name,
        relevance,
        tags:      category,
        mcq,
        link:      item.link || '',
      });
    }
  }

  console.log(`✅ Scrape complete — ${results.currentAffairs.length} CA items from ${FEEDS.length} sources`);
  return results;
}

module.exports = { scrapeAll, generateMCQ, categorise };
