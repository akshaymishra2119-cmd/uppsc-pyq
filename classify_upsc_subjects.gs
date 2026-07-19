// ============================================================
// UPSC Subject Classifier
// Assigns subject & subTopic to All_Questions_v2 matching
// the UPPSC/BPSC portal taxonomy.
//
// HOW TO USE:
//   1. Open UPSC Google Sheet
//   2. Extensions → Apps Script → paste → Save
//   3. Run classifyUpscSubjects()
// ============================================================

function classifyUpscSubjects() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('All_Questions_v2');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Tab "All_Questions_v2" not found!');
    return;
  }

  const data  = sheet.getDataRange().getValues();
  const nRows = data.length - 1; // exclude header

  // Column indices (0-based) in All_Questions_v2:
  // 0=id  1=year  2=subject  3=subTopic  4=question  5=optA … 15=paper
  const COL_SUBJECT  = 2;
  const COL_SUBTOPIC = 3;
  const COL_QUESTION = 4;
  const COL_PAPER    = 15;  // GS I / GS II

  // ── Classification rules ──────────────────────────────────
  // Format: [subject, subTopic, [keywords...]]
  // Rules checked in order — first match wins.
  const RULES = [
    // ── HISTORY ──────────────────────────────────────────────
    ['History', 'Ancient History', [
      'vedic','upanishad','rigveda','samaveda','atharvaveda','yajurveda',
      'maurya','ashoka','chandragupta','bindusara',
      'gupta','chandragupta ii','vikramaditya','skandagupta',
      'harappan','indus valley','indus civiliz','mohenjodaro','harappa',
      'sangam','ajanta','ellora','nalanda','taxila','vikramashila',
      'megasthenes','kautilya','arthashastra','chanakya',
      'buddhism','jainism','mahavira','gautama buddha','tripitaka',
      'ancient india','ashokan','edicts','brahmi','kharosthi',
      'chola','pallava','chalukya','rashtrakuta','pala','sena',
      'post-vedic','pre-mauryan','post-gupta','harshavardhana','harsha',
      'ancient',
    ]],
    ['History', 'Medieval History', [
      'mughal','akbar','aurangzeb','babur','humayun','shah jahan','jahangir',
      'sultanate','delhi sultanate','iltutmish','balban','alauddin khalji','firuz',
      'vijayanagar','krishnadevaraya',
      'maratha','shivaji','peshwa','bajirao',
      'sikh','guru nanak','guru gobind','khalsa',
      'bhakti movement','bhakti','sufi','chishti','kabir','mirabai','tukaram',
      'medieval india','medieval period',
      'lodi','sayyid','tughluq','khilji',
    ]],
    ['History', 'Modern History', [
      'british india','east india company','battle of plassey','battle of buxar',
      '1857','revolt of 1857','sepoy mutiny','sipahi',
      'indian national congress','congress party',
      'gandhi','mahatma','nehru','patel','subhas chandra bose','netaji',
      'partition of india','partition of bengal',
      'non-cooperation movement','civil disobedience','quit india',
      'swadeshi','boycott','home rule','rowlatt','jallianwala',
      'montagu-chelmsford','morley-minto','simon commission',
      'round table conference','poona pact','communal award',
      'tilak','gokhale','lajpat rai','bipin chandra pal',
      'freedom struggle','freedom movement','independence movement',
      'colonial','viceroy','governor-general','dalhousie',
      'regulating act','pitt\'s india act','charter act',
      'reform act','indian councils act',
    ]],
    ['History', 'World History', [
      'world war i','world war ii','first world war','second world war',
      'french revolution','american revolution','american civil war',
      'napoleon','napoleon bonaparte',
      'renaissance','reformation','counter-reformation',
      'industrial revolution','colonialism','imperialism',
      'league of nations','treaty of versailles',
    ]],

    // ── GEOGRAPHY ────────────────────────────────────────────
    ['Geography', 'Indian Geography', [
      'ganga','yamuna','brahmaputra','narmada','tapti','tapi','mahanadi',
      'godavari','krishna','kaveri','cauvery','chambal','betwa',
      'deccan plateau','deccan trap',
      'western ghats','eastern ghats','sahyadri','vindhyas','satpura','aravalli',
      'himalaya','karakoram','trans-himalaya','siwalik','shivalik',
      'thar desert','rann of kutch','kutch',
      'sundarbans','mangrove','delta','estuary',
      'andaman','nicobar','lakshadweep',
      'konkan','malabar','coromandel','gujarat coast',
      'indo-gangetic plain','gangetic plain',
      'national waterway','inland waterway',
      'india\'s geography','geography of india',
    ]],
    ['Geography', 'World Geography', [
      'amazon','nile','mississippi','congo','yangtze','ob river','lena',
      'pacific ocean','atlantic ocean','indian ocean','arctic ocean',
      'sahara desert','gobi desert','atacama',
      'alps','andes','rockies','himalayas','kilimanjaro',
      'amazon rainforest','tropical rainforest',
      'mediterranean','red sea','caspian sea','black sea',
      'equator','tropic of cancer','tropic of capricorn','arctic circle',
      'world geography','global geography',
    ]],
    ['Geography', 'Physical Geography', [
      'earthquake','seismic','tsunami','volcano','volcanic',
      'tectonic plate','lithosphere','continental drift',
      'erosion','weathering','deposition','sedimentation',
      'rock cycle','metamorphic','igneous','sedimentary',
      'ocean current','el nino','la nina','monsoon','rainfall pattern',
      'cyclone','hurricane','typhoon','tornado','depression',
      'humidity','atmospheric pressure','temperature inversion',
      'latitude','longitude','time zone','international date line',
      'plateau','peninsula','isthmus','strait','fjord',
    ]],
    ['Geography', 'Resources & Agriculture', [
      'coal','iron ore','bauxite','copper','manganese','chromite','zinc','lead','mica',
      'petroleum','crude oil','natural gas','oil field','refinery',
      'uranium','thorium','nuclear mineral',
      'mineral distribution','mineral resources',
    ]],

    // ── POLITY ───────────────────────────────────────────────
    ['Polity', 'Constitution', [
      'constitution of india','constituent assembly','preamble',
      'fundamental rights','directive principles','dpsp','fundamental duties',
      'constitutional amendment','amendment to constitution',
      'schedule','eighth schedule','ninth schedule',
      'article 14','article 15','article 16','article 17','article 19','article 21',
      'article 32','article 36','article 40','article 44','article 51',
      'article 72','article 74','article 76','article 79','article 108',
      'article 110','article 123','article 124','article 143','article 148',
      'article 155','article 161','article 163','article 164','article 200',
      'article 226','article 243','article 262','article 300','article 311',
      'article 312','article 315','article 324','article 352','article 356',
      'article 360','article 368','article 370','article 371',
    ]],
    ['Polity', 'Parliament', [
      'lok sabha','rajya sabha','parliament','parliamentary',
      'speaker of lok sabha','deputy speaker','chairman rajya sabha',
      'money bill','finance bill','ordinary bill','constitutional bill',
      'joint sitting','joint session',
      'no-confidence motion','confidence motion','censure motion',
      'question hour','zero hour','adjournment motion','privilege motion',
      'prorogation','dissolution','anti-defection',
      'budget session','monsoon session','winter session',
    ]],
    ['Polity', 'Executive', [
      'president of india','vice president','prime minister of india',
      'council of ministers','cabinet minister','minister of state',
      'governor of state','chief minister',
      'attorney general','solicitor general',
      'comptroller and auditor general','cag',
      'president\'s rule','governor\'s rule','article 356',
      'union executive','state executive',
    ]],
    ['Polity', 'Judiciary', [
      'supreme court','high court','district court','subordinate court',
      'judicial review','public interest litigation','pil',
      'writ petition','habeas corpus','mandamus','certiorari','prohibition','quo warranto',
      'contempt of court','original jurisdiction','appellate jurisdiction',
      'national green tribunal','ngt',
      'national company law tribunal','nclt',
      'armed forces tribunal',
    ]],
    ['Polity', 'Elections', [
      'election commission','chief election commissioner','model code of conduct',
      'electronic voting machine','evm','vvpat',
      'delimitation commission','delimitation of constituencies',
      'general election','by-election','bye-election',
      'representation of the people act','electoral roll','voter id',
    ]],
    ['Polity', 'Local Governance', [
      'panchayati raj','panchayat','gram sabha','gram panchayat',
      'zila parishad','block panchayat','panchayat samiti',
      'municipality','municipal corporation','urban local body','nagar palika',
      '73rd amendment','74th amendment','balwant rai mehta','ashok mehta',
    ]],
    ['Polity', 'Indian Polity', [
      'federalism','federal structure','quasi-federal',
      'union list','state list','concurrent list','seventh schedule',
      'centre-state relations','inter-state council',
      'national emergency','president\'s rule','financial emergency',
      'special status','special category state',
      'national commission','statutory body','constitutional body',
      'public service commission','upsc commission','staff selection',
    ]],

    // ── ECONOMY ──────────────────────────────────────────────
    ['Economy', 'Banking & Finance', [
      'reserve bank of india','rbi','central bank',
      'commercial bank','cooperative bank','regional rural bank','rrb','nabard',
      'nbfc','small finance bank','payment bank',
      'monetary policy','repo rate','reverse repo','crr','slr','msf',
      'open market operation','liquidity','credit policy',
      'inflation','deflation','stagflation','cpi','wpi','gdp deflator',
      'sebi','stock exchange','bse','nse','sensex','nifty',
      'mutual fund','etf','debenture','bond','equity','share',
      'insurance','irda','life insurance','general insurance',
      'foreign exchange','forex','exchange rate',
    ]],
    ['Economy', 'Agriculture & Food', [
      'agriculture','agricultural','crop','kharif','rabi','zaid',
      'irrigation','drip irrigation','sprinkler','canal irrigation',
      'green revolution','white revolution','blue revolution','yellow revolution',
      'msp','minimum support price','procurement price',
      'food security','public distribution system','pds','food corporation',
      'fertilizer','pesticide','seed','organic farming','natural farming',
      'animal husbandry','dairy','fisheries','aquaculture','horticulture',
    ]],
    ['Economy', 'Trade & Industry', [
      'export','import','trade deficit','trade surplus','balance of trade',
      'balance of payment','current account deficit','capital account',
      'fdi','foreign direct investment','fii','foreign institutional investor',
      'wto','world trade organization','gatt','trade agreement','free trade',
      'special economic zone','sez','export processing zone',
      'make in india','atmanirbhar bharat',
      'msme','micro small medium enterprise','small industry',
      'industrial policy','industrial licensing','disinvestment','privatization',
    ]],
    ['Economy', 'Planning & Development', [
      'five year plan','planning commission','niti aayog','national development council',
      'gdp','gross domestic product','gnp','nnp','national income',
      'per capita income','human development index','hdi',
      'poverty line','bpl','poverty ratio','multidimensional poverty',
      'unemployment','disguised unemployment','seasonal unemployment',
      'inclusive growth','sustainable development','sdg',
    ]],
    ['Economy', 'Indian Economy', [
      'goods and services tax','gst','value added tax','vat',
      'direct tax','income tax','corporate tax','wealth tax',
      'indirect tax','excise duty','customs duty',
      'fiscal policy','fiscal deficit','primary deficit','revenue deficit',
      'government expenditure','capital expenditure','revenue expenditure',
      'public debt','internal debt','external debt',
      'economic reform','liberalization','privatization','globalization','lpg reform',
      'subsidy','welfare scheme','social security',
    ]],

    // ── SCIENCE ──────────────────────────────────────────────
    ['Science', 'Space & Technology', [
      'isro','nasa','esa','space research',
      'satellite','artificial satellite','remote sensing','geostationary',
      'chandrayaan','mangalyaan','mars orbiter','aditya','gaganyaan',
      'launch vehicle','rocket','pslv','gslv','rocket propulsion',
      'space station','international space station','iss',
      'gps','irnss','navic','navigation satellite',
      'asteroid','comet','meteor','planet','solar system','black hole','star','galaxy',
    ]],
    ['Science', 'Biology & Life Sciences', [
      'cell','cell division','mitosis','meiosis',
      'dna','rna','gene','chromosome','genetics','heredity','mutation',
      'protein','enzyme','hormone','vitamin','mineral','amino acid',
      'photosynthesis','respiration','transpiration','digestion','absorption',
      'blood group','blood type','rh factor','plasma','haemoglobin',
      'heart','lung','liver','kidney','brain','nerve','neuron','spinal cord',
      'vaccine','vaccination','antibiotic','immunity','antibody','antigen',
      'virus','bacteria','fungi','protozoa','parasite','pathogen',
      'mammal','reptile','amphibian','aves','bird','fish','insect','arthropod',
      'plant kingdom','animal kingdom','taxonomy','binomial nomenclature',
      'ecology','food chain','food web','ecosystem','biosphere',
    ]],
    ['Science', 'Physics', [
      'newton\'s law','force','gravity','gravitational','mass','weight',
      'energy','kinetic energy','potential energy','work','power',
      'momentum','conservation of momentum','friction',
      'sound wave','frequency','amplitude','wavelength','resonance','doppler',
      'light','reflection','refraction','dispersion','lens','mirror','prism',
      'electric current','voltage','resistance','ohm\'s law','circuit',
      'magnetic field','electromagnetic induction','faraday','generator','motor',
      'nuclear fission','nuclear fusion','radioactivity','alpha','beta','gamma ray',
      'x-ray','electromagnetic spectrum','infrared','ultraviolet',
    ]],
    ['Science', 'Chemistry', [
      'periodic table','element','compound','mixture','atom','molecule',
      'acid','base','ph','salt','neutralization',
      'oxidation','reduction','redox','catalyst','corrosion','rusting',
      'polymer','plastic','rubber','synthetic fiber',
      'carbon','organic compound','hydrocarbon','alkane','alkene','alkyne',
      'carbon dioxide','ozone','greenhouse','chlorofluorocarbon',
      'alloy','steel','bronze','brass','amalgam',
      'nanotechnology','nanoparticle','nanomaterial',
    ]],
    ['Science', 'Science & Technology', [
      'artificial intelligence','machine learning','deep learning',
      'blockchain','cryptocurrency','bitcoin','digital currency',
      '5g','6g','internet of things','iot','cloud computing',
      'cybersecurity','encryption','data protection',
      'biotechnology','genetic engineering','gmo','crispr',
      '3d printing','additive manufacturing',
      'nuclear reactor','nuclear power','thorium reactor',
      'semiconductor','microchip','transistor','integrated circuit',
    ]],

    // ── ENVIRONMENT ──────────────────────────────────────────
    ['Environment', 'Biodiversity', [
      'biodiversity','biological diversity','endemic species','keystone species',
      'endangered','critically endangered','vulnerable','extinct','iucn red list',
      'tiger','snow leopard','lion','elephant','rhinoceros','gharial','sea turtle',
      'coral reef','mangrove','seagrass','kelp','algae',
      'wetland','ramsar','ramsar convention','ramsar site',
      'biosphere reserve','wildlife corridor',
      'project tiger','project elephant','project dolphin','project snow leopard',
    ]],
    ['Environment', 'Climate Change', [
      'climate change','global warming','greenhouse effect','greenhouse gas',
      'carbon dioxide emission','co2','methane emission','nitrous oxide',
      'paris agreement','paris accord','cop26','cop27','cop28','cop21',
      'kyoto protocol','unfccc','ipcc',
      'ozone layer','ozone depletion','cfc','hfc','montreal protocol',
      'sea level rise','glacial retreat','glacier melt','arctic ice',
      'carbon credit','carbon market','carbon sequestration','carbon sink',
      'net zero','decarbonization','climate finance','green fund',
    ]],
    ['Environment', 'Ecology & Ecosystems', [
      'trophic level','producer','consumer','decomposer','detritivore',
      'nitrogen cycle','carbon cycle','water cycle','hydrological cycle','phosphorus cycle',
      'primary succession','secondary succession','climax community',
      'symbiosis','mutualism','commensalism','parasitism','predation',
      'biome','tropical forest','temperate forest','grassland','savanna','tundra','desert',
      'estuarine','marine ecosystem','freshwater ecosystem','terrestrial ecosystem',
    ]],
    ['Environment', 'Pollution & Waste', [
      'air pollution','air quality','pm2.5','pm10','particulate matter','smog',
      'water pollution','ground water','effluent','sewage','eutrophication',
      'soil pollution','land degradation','desertification',
      'noise pollution','light pollution','e-waste','electronic waste',
      'solid waste management','municipal solid waste','landfill','incineration',
      'single-use plastic','plastic pollution','microplastic',
    ]],
    ['Environment', 'Conservation', [
      'national park','wildlife sanctuary','tiger reserve','biosphere reserve',
      'protected area','wildlife protection act','forest conservation act',
      'environment protection act','water prevention act','air prevention act',
      'green belt','social forestry','joint forest management',
      'world heritage site','world heritage','unesco heritage',
      'convention on biological diversity','cbd','cites',
      'migratory species','cms','bonn convention',
    ]],

    // ── CURRENT AFFAIRS ──────────────────────────────────────
    ['Current Affairs', 'Awards & Honours', [
      'nobel prize','bharat ratna','padma vibhushan','padma bhushan','padma shri',
      'gallantry award','param vir chakra','vir chakra','ashoka chakra',
      'sahitya akademi','sangeet natak akademi','lalit kala akademi',
      'booker prize','man booker','pulitzer','oscar','grammy',
      'khel ratna','arjuna award','dronacharya',
      'dada saheb phalke','national film award',
    ]],
    ['Current Affairs', 'International Organizations', [
      'united nations','un general assembly','un security council','unsc',
      'world health organization','who','imf','international monetary fund',
      'world bank','ibrd','ifc','ida',
      'world trade organization','wto',
      'nato','north atlantic treaty',
      'asean','brics','g20','g7','g8','saarc','sco','quad',
      'iaea','international atomic energy',
      'unesco','unicef','unhcr','undp','unfpa','wfp','ilo',
      'interpol','international court of justice','icj','icc',
    ]],
    ['Current Affairs', 'Government Schemes', [
      'pradhan mantri','pm yojana','central scheme','flagship scheme',
      'swachh bharat','digital india','make in india','startup india',
      'atmanirbhar','jan dhan','ujjwala','ujala','ayushman bharat',
      'skill india','stand up india','mudra','pm kisan','pm awas',
      'smart city','atal mission','amrut','hriday',
      'national mission','abhiyan','campaign',
    ]],
    ['Current Affairs', 'Defence & Security', [
      'indian army','indian navy','indian air force','coast guard','armed forces',
      'missile','ballistic missile','cruise missile','agni','prithvi','brahmos',
      'nuclear weapon','nuclear doctrine','no first use',
      'border','lac','loc','line of control','line of actual control',
      'defence budget','defence acquisition','defence export',
      'cybersecurity','cyber warfare','information warfare',
      'terrorism','counterterrorism','nsa','nia',
    ]],
    ['Current Affairs', 'Sports', [
      'olympic games','paralympic','commonwealth games','asian games',
      'cricket world cup','fifa world cup','football',
      'chess','vishwanathan anand','badminton','wrestling','boxing',
      'khelo india','national sports','sports authority of india','sai',
    ]],
  ];

  // ── Classify a question (English only) ────────────────────
  function classify(question, paper) {
    if (!question) return { subject: 'General Studies', subTopic: '' };
    var q = question.toString().toLowerCase();

    // Check ASCII ratio — skip classification for Hindi/non-Latin
    var ascii = 0;
    for (var i = 0; i < Math.min(q.length, 100); i++) {
      if (q.charCodeAt(i) < 128) ascii++;
    }
    var sampleLen = Math.min(q.length, 100);
    if (sampleLen > 0 && ascii / sampleLen < 0.6) {
      // Hindi question — classify only by paper
      if (paper === 'GS II') return { subject: 'General Studies', subTopic: 'CSAT' };
      return { subject: 'General Studies', subTopic: '' };
    }

    // GS II = CSAT (reasoning/comprehension) — classify separately
    if (paper === 'GS II') {
      return { subject: 'General Studies', subTopic: 'CSAT' };
    }

    for (var r = 0; r < RULES.length; r++) {
      var subj = RULES[r][0], sub = RULES[r][1], kws = RULES[r][2];
      for (var k = 0; k < kws.length; k++) {
        if (q.indexOf(kws[k]) >= 0) {
          return { subject: subj, subTopic: sub };
        }
      }
    }
    return { subject: 'General Studies', subTopic: '' };
  }

  // ── Process rows ──────────────────────────────────────────
  var updates = [];  // [rowIndex, subject, subTopic]
  var counts  = {};

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var question = row[COL_QUESTION];
    var paper    = row[COL_PAPER] || '';
    var result   = classify(question, paper);
    updates.push([result.subject, result.subTopic]);
    counts[result.subject] = (counts[result.subject] || 0) + 1;
  }

  // Batch-write subject + subTopic columns (cols C:D)
  if (updates.length > 0) {
    sheet.getRange(2, COL_SUBJECT + 1, updates.length, 2).setValues(updates);
  }

  // Report
  var report = '✅ Done! ' + nRows + ' rows classified.\n\nBreakdown:\n';
  var sorted = Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; });
  sorted.forEach(function(s){ report += '  ' + s + ': ' + counts[s] + '\n'; });
  SpreadsheetApp.getUi().alert(report);
}
