// Run this on Windows: node fix_jun24_mcq.js
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, 'db.json');
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const ca = db.currentAffairs || [];

const mcqs = {
  'INS Dunagiri, INS Agray & INS Sanshodhak Commissioned': 'Where were INS Dunagiri, INS Agray & INS Sanshodhak commissioned? → Syama Prasad Mookerjee Port, Kolkata',
  'GRSE Conferred Navratna Status': 'GRSE received which elevated PSU status in June 2026? → Navratna status',
  'PM-KISAN 23rd Instalment Released — ₹18,880 Crore': 'How much was released under PM-KISAN 23rd instalment? → ₹18,880 crore to 9.6 crore farmers',
  'PMFBY Launched in West Bengal': 'PM Modi launched PMFBY in West Bengal during which month of 2026? → June 2026',
  '12th International Day of Yoga Observed at Kolkata': 'PM Modi led the 12th International Day of Yoga from which location? → Red Road, Kolkata',
  'FCRA Rules 2011 Amended via Gazette Notification': 'Which Ministry amended FCRA Rules 2011 via gazette notification in June 2026? → Union Home Ministry',
  'NMC Discontinues Postgraduate Diploma Medical Courses': 'Which body discontinued PG diploma medical courses in June 2026? → National Medical Commission (NMC)',
  'India to Transfer PSLV Technology to Private Sector': 'India plans to transfer which rocket technology to private companies? → PSLV technology',
  'CURAJ Develops Sensor to Detect Lead in Drinking Water': 'Which university developed a sensor to detect lead in drinking water? → Central University of Rajasthan (CURAJ)',
  'IAF Issues RFP for Rafale Bridge Support Package': 'IAF issued RFP for what type of support package for Rafale jets? → Five-month bridge support package',
  "India Remains ADB's Largest Private Sector Market": "India is the largest private sector market for which international bank? → Asian Development Bank (ADB)",
  'NSE Signs MoU with Bharat Metal Exchange for Non-Ferrous Metal Derivatives': 'NSE signed MoU with Bharat Metal Exchange to trade derivatives in which segment? → Non-ferrous metals',
  'India Wins Silver in Mixed 4x400m Relay, Bronze in Mixed 4x100m Relay': 'India won silver in mixed 4x400m relay at which 2026 competition? → Asian Athletics Championships 2026',
  'Lok Sabha Speaker Om Birla Launches Book on IIT at IIT Delhi': 'What book was launched by Lok Sabha Speaker Om Birla at IIT Delhi? → IIT: The Story of India\'s Most Prestigious Educational Institution',
  "India's MRFA Program to Procure 114 Additional Rafale Jets from Dassault": 'How many fighter jets will India procure under the MRFA program? → 114 Rafale jets from Dassault',
  "EAM Jaishankar Meets Mongolia's Foreign Minister; Focus on Economic Cooperation": "India's EAM Jaishankar met Mongolia's FM — focus on which area? → Economic cooperation (mining, clean energy, agriculture)",
  'Indian Astronaut Shubhanshu Shukla Onboard Axiom Mission 4 (Ax-04)': 'Which Indian astronaut is onboard Axiom Mission 4 (Ax-04)? → Shubhanshu Shukla',
  "India's Bioeconomy Crosses $190 Billion — 20-Fold Growth Since 2014": "India's bioeconomy grew how many times since 2014? → 20-fold (from ~$10 billion to $190 billion+)",
  'UP CM Yogi Sets June 2026 Deadline for Three Expressway Land Acquisitions': 'UP CM Yogi set June 2026 deadline for land acquisition of which project? → Three expressway land acquisitions',
  'Uttar Pradesh Targets 10,000 EV Charging Stations by 2030; 15.5 Lakh EVs Registered': 'How many EV charging stations is Uttar Pradesh targeting by 2030? → 10,000 charging stations',
  'IMD Forecasts Monsoon to Cover More Parts of Maharashtra, Telangana & Eastern India': 'Which agency forecasted southwest monsoon coverage over Maharashtra & Telangana in June 2026? → India Meteorological Department (IMD)',
  'Lucknow Coaching Centre Fire Claims 15 Lives; SIT Constituted': 'How many lives were lost in the Lucknow coaching centre fire of June 22, 2026? → 15 lives; SIT constituted',
  'Yogi Govt Launches Fire Safety Audit Drive Against Illegal Coaching Centres': 'Who directed DMs to conduct fire safety audits of coaching centres after Lucknow fire? → CM Yogi Adityanath',
  'India Records Over Five Lakh Organ Donation Pledges': 'How many organ donation pledges has India recorded as of June 22, 2026? → Over five lakh (500,000)',
  'New Aadhaar App Crosses 31 Million Downloads in Five Months': 'Which body launched the new Aadhaar app that crossed 31 million downloads? → UIDAI',
  'Five Eyes Alliance Issues Joint Warning on AI-Linked Cybersecurity Risks': 'Which five countries form the Five Eyes intelligence alliance? → USA, UK, Canada, Australia, New Zealand',
  "World Bank Warns Climate Change May Shrink India's GDP by 2.8% by 2050": "By how much could climate change shrink India's GDP by 2050 per World Bank? → 2.8%",
  'UPPSC PCS 2026 Notification Expected; Prelims Scheduled for December 2026': 'When is UPPSC PCS 2026 Preliminary Examination scheduled? → December 2026',
  'Andhra Pradesh Community Natural Farming Covers 6.3 Lakh Farmers': 'How many farmers are covered under the Andhra Pradesh Community Natural Farming programme? → 6.3 lakh farmers',
  'EAM Jaishankar Visits Mongolia, South Korea; Focuses on Economic Ties': "EAM Jaishankar's four-day tour in June 2026 covered which two countries? → Mongolia and South Korea",
  "India Named World's Third Largest Methane Emitter; Ruminant Livestock Key Source": "What % of India's methane output comes from ruminant livestock per UNEP? → 48%"
};

let updated = 0;
ca.forEach(item => {
  if (item.date !== '24 Jun 2026') return;
  const key = item.title || item.headline || '';
  if (item.mcq) return; // already has MCQ
  const match = Object.keys(mcqs).find(k => key.includes(k.slice(0, 25)) || k.includes(key.slice(0, 25)));
  if (match) { item.mcq = mcqs[match]; updated++; }
  else {
    // exact match
    if (mcqs[key]) { item.mcq = mcqs[key]; updated++; }
  }
});

fs.writeFileSync(DB, JSON.stringify(db, null, 2));
console.log('Done! Updated', updated, 'entries with MCQ in db.json');
console.log('Now restart the server (restart_server.bat) and refresh Chrome.');
