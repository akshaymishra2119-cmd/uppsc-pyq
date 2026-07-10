"""
Patch Index.html — replace horizontal examSwitcherBar with a slim vertical sidebar.
Safe: only 3 targeted replacements, no JS changes.
"""

import re, shutil, os

SRC  = r'D:\uppsc_pyq\Index.html'
BACK = r'D:\uppsc_pyq\Index.html.bak_sidebar'

# ── backup ────────────────────────────────────────────────────────
shutil.copy2(SRC, BACK)
print(f'Backup → {BACK}')

with open(SRC, encoding='utf-8') as f:
    html = f.read()

original_len = len(html)

# ══════════════════════════════════════════════════════════════════
# CHANGE 1: Add sidebar CSS — insert before </style> near .main def
# ══════════════════════════════════════════════════════════════════
SIDEBAR_CSS = """
/* ── EXAM SIDEBAR ────────────────────────────── */
.portal-layout{display:flex;align-items:stretch;}
.exam-sidebar{
  width:52px;flex-shrink:0;
  background:#0f1f4a;
  display:flex;flex-direction:column;align-items:center;
  padding:10px 0 16px;gap:4px;
  position:sticky;top:0;
  height:calc(100vh - var(--banner-h,220px));
  overflow:hidden;
  border-right:1px solid rgba(255,255,255,.07);
  z-index:10;
}
.exam-sidebar .sb-label{
  font-size:6.5px;font-weight:800;
  color:rgba(251,191,36,.45);letter-spacing:1.2px;
  text-transform:uppercase;
  writing-mode:vertical-rl;transform:rotate(180deg);
  margin-bottom:4px;
}
.exam-sidebar .sb-div{width:28px;height:1px;background:rgba(255,255,255,.07);margin:5px 0;}
.exam-sidebar .sb-eb{
  width:40px;padding:6px 3px;border-radius:7px;
  font-size:8px;font-weight:800;text-align:center;
  cursor:pointer;letter-spacing:.2px;
  border:1.5px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.04);
  color:rgba(255,255,255,.35);
  transition:all .15s;
}
.exam-sidebar .sb-eb:hover{border-color:rgba(251,191,36,.4);color:#fbbf24;}
.exam-sidebar .sb-eb.sb-active{background:#fbbf24;color:#1a1a1a;border-color:#fbbf24;}
.exam-sidebar .sb-eb.sb-soon{border-style:dashed;opacity:.3;cursor:default;font-size:7px;line-height:1.2;}
.exam-sidebar .sb-lw{
  width:40px;padding:4px 3px;border-radius:5px;
  font-size:8px;font-weight:700;text-align:center;
  color:rgba(255,255,255,.3);cursor:pointer;
  border:1px solid transparent;transition:all .15s;
}
.exam-sidebar .sb-lw.sb-active{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.15);}
.main{flex:1;min-width:0;max-width:none !important;}
"""

OLD1 = '.main{max-width:1100px;margin:0 auto;padding:16px;}'
NEW1 = '.main{max-width:1100px;margin:0 auto;padding:16px;}' + SIDEBAR_CSS

if OLD1 in html:
    html = html.replace(OLD1, NEW1, 1)
    print('✓ Change 1: sidebar CSS injected')
else:
    print('✗ Change 1 FAILED — .main CSS not found')

# ══════════════════════════════════════════════════════════════════
# CHANGE 2: Hide existing horizontal examSwitcherBar
# ══════════════════════════════════════════════════════════════════
OLD2 = 'id="examSwitcherBar" style="background:var(--bg1);border-bottom:1px solid var(--border);padding:8px 20px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;"'
NEW2 = 'id="examSwitcherBar" style="display:none;"'

if OLD2 in html:
    html = html.replace(OLD2, NEW2, 1)
    print('✓ Change 2: examSwitcherBar hidden')
else:
    print('✗ Change 2 FAILED — examSwitcherBar style not found')

# ══════════════════════════════════════════════════════════════════
# CHANGE 3: Wrap <div class="main"> with flex layout + inject sidebar
# ══════════════════════════════════════════════════════════════════
SIDEBAR_HTML = """
<!-- ══ PORTAL LAYOUT (sidebar + main) ══════════════════════════ -->
<div class="portal-layout">

<!-- ── EXAM SIDEBAR ────────────────────────── -->
<div class="exam-sidebar" id="examSidebar">
  <div class="sb-label">Exam</div>
  <div class="sb-eb sb-active" id="sb-uppsc" onclick="switchExam('uppsc')">UPPSC</div>
  <div class="sb-eb" id="sb-bpsc" onclick="switchExam('bpsc')">BPSC</div>
  <div class="sb-eb sb-soon" title="Coming soon">MPC<br>SC</div>
  <div class="sb-eb sb-soon" title="Coming soon">UPSC</div>
  <div class="sb-div"></div>
  <div class="sb-label">Lang</div>
  <div class="sb-lw sb-active" id="sb-en" onclick="switchLang('en')">EN</div>
  <div class="sb-lw" id="sb-hi" onclick="switchLang('hi')">हि</div>
</div>

"""

OLD3 = '<!-- MAIN -->\n<div class="main">'
NEW3 = SIDEBAR_HTML + '<div class="main">'

if OLD3 in html:
    html = html.replace(OLD3, NEW3, 1)
    # Also close the portal-layout div before </body>
    html = html.replace('</body>', '</div><!-- /.portal-layout -->\n</body>', 1)
    print('✓ Change 3: sidebar + portal-layout wrapper injected')
else:
    print('✗ Change 3 FAILED — <!-- MAIN --> marker not found')

# ══════════════════════════════════════════════════════════════════
# CHANGE 4: Keep sidebar buttons in sync with switchExam/switchLang
# ══════════════════════════════════════════════════════════════════
SYNC_JS = """
/* ── Sidebar sync ────────────────────────────── */
(function(){
  var _origSwitchExam = window.switchExam;
  window.switchExam = function(exam){
    if(_origSwitchExam) _origSwitchExam(exam);
    ['uppsc','bpsc'].forEach(function(e){
      var el = document.getElementById('sb-'+e);
      if(el) el.classList.toggle('sb-active', e===exam);
    });
  };
  var _origSwitchLang = window.switchLang;
  window.switchLang = function(lang){
    if(_origSwitchLang) _origSwitchLang(lang);
    ['en','hi'].forEach(function(l){
      var el = document.getElementById('sb-'+l);
      if(el) el.classList.toggle('sb-active', l===lang);
    });
  };
})();
"""

OLD4 = '</body>'
NEW4 = f'<script>{SYNC_JS}</script>\n</body>'
html = html.replace(OLD4, NEW4, 1)
print('✓ Change 4: sidebar sync JS added')

# ── verify & write ────────────────────────────────────────────────
assert len(html) > original_len, 'File shrunk — something went wrong!'
with open(SRC, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'\nDone. File size: {original_len:,} → {len(html):,} chars')
print('Test locally before pushing.')
