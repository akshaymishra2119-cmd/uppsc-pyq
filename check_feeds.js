const https = require('https');
const http  = require('http');

function fetchUrl(url, timeoutMs = 15000, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Referer': 'https://www.google.com/',
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return fetchUrl(next, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

const FEEDS = [
  { name: 'NDTV India',        url: 'https://feeds.feedburner.com/ndtvnews-india-news' },
  { name: 'NDTV Top',          url: 'https://feeds.feedburner.com/ndtvnews-top-stories' },
  { name: 'The Hindu',         url: 'https://www.thehindu.com/feeder/default.rss' },
  { name: 'Indian Express',    url: 'https://indianexpress.com/feed/' },
  { name: 'TOI India',         url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/home_page_top_stories.rss' },
  { name: 'ANI',               url: 'https://www.aninews.in/rss/india.rss' },
  { name: 'HT',                url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml' },
];

(async () => {
  console.log('Testing feeds...\n');
  let total = 0;
  for (const f of FEEDS) {
    try {
      const { status, body } = await fetchUrl(f.url);
      const itemCount = (body.match(/<item/g) || []).length;
      console.log(`✅ ${status} | ${String(itemCount).padStart(3)} items | ${f.name}`);
      total += itemCount;
    } catch(e) {
      console.log(`❌ ${e.message.split(':')[0].padEnd(12)} | ${f.name}`);
    }
  }
  console.log(`\nTotal items found: ${total}`);
})();
