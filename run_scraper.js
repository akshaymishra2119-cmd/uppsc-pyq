const { scrapeAll } = require('./scraper.js');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const DB    = path.join(__dirname, 'db.json');

scrapeAll().then(r => {
  if (!r.uppscNews.length && !r.currentAffairs.length) {
    console.log('No items scraped. Check your internet connection.');
    process.exit(1);
  }

  console.log('Fetched: ' + r.uppscNews.length + ' UPPSC + ' + r.currentAffairs.length + ' CA items');

  // Step 1: Save to local db.json
  try {
    let db = { uppscNews: [], currentAffairs: [] };
    if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const existUP = new Set((db.uppscNews     || []).map(n => n.headline));
    const existCA = new Set((db.currentAffairs || []).map(n => n.headline));
    const newUP = r.uppscNews.filter(n => !existUP.has(n.headline));
    const newCA = r.currentAffairs.filter(n => !existCA.has(n.headline));
    db.uppscNews      = [...(db.uppscNews     || []), ...newUP];
    db.currentAffairs = [...(db.currentAffairs || []), ...newCA];
    fs.writeFileSync(DB, JSON.stringify(db, null, 2));
    console.log('Saved to local db.json: +' + newUP.length + ' UPPSC, +' + newCA.length + ' CA');
  } catch(e) {
    console.warn('db.json write failed: ' + e.message);
  }

  // Step 2: POST to Railway
  const body = JSON.stringify({
    uppscNews:      r.uppscNews,
    currentAffairs: r.currentAffairs,
    source:         'run_scraper'
  });

  const req = https.request({
    hostname: 'uppsc-pyq-production.up.railway.app',
    path:     '/api/ingestNews',
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const j = JSON.parse(data);
        if (j.ok) {
          console.log('Posted to Railway: +' + (j.added && j.added.uppsc || 0) + ' UPPSC, +' + (j.added && j.added.ca || 0) + ' CA');
          console.log('');
          console.log('Done! News is now live on the portal.');
        } else {
          console.log('Railway response: ' + data);
        }
      } catch(e) { console.log('Railway: ' + data); }
    });
  });
  req.on('error', e => console.error('Railway POST failed: ' + e.message));
  req.write(body);
  req.end();

}).catch(e => console.error('Scraper error: ' + e.message));
