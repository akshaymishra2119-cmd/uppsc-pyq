#!/usr/bin/env python3
"""
UPPSC Instagram Reel Generator - v2 (Q+Options together)
Layout: Intro(2s) -> Question+Options(10s) -> Answer(7s) -> CTA(4s) = 23s

Usage:
  python make_reels.py news 10   # 10 news reels from dailyQuizQuestions
  python make_reels.py geo 10    # 10 Geography reels (GEO_001...)
  python make_reels.py pol 5     # Polity  pol / hist / eco / sci / env / up / ca
"""
import json, sys, os, subprocess, math, tempfile, shutil, wave
from PIL import Image, ImageDraw, ImageFont
import platform, numpy as np

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"

if platform.system() == "Windows":
    BASE, FONT_DIR = r"D:\uppsc_pyq", r"C:\Windows\Fonts"
else:
    BASE     = "/sessions/vibrant-compassionate-ride/mnt/uppsc_pyq"
    FONT_DIR = "/usr/share/fonts/truetype/liberation"

DB_PATH  = os.path.join(BASE, "db.json")
OUT_DIR  = os.path.join(BASE, "reels")
LOFI_MP3 = os.path.join(BASE, "mondamusic-lofi-study-542566.mp3")
os.makedirs(OUT_DIR, exist_ok=True)

W, H, FPS = 1080, 1920, 24

def load_font(name, size):
    for c in [os.path.join(FONT_DIR, name),
              os.path.join(FONT_DIR, "LiberationSans-Bold.ttf"),
              os.path.join(FONT_DIR, "LiberationSans-Regular.ttf"),
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\Arial.ttf"]:
        if os.path.exists(c):
            try: return ImageFont.truetype(c, size)
            except: pass
    return ImageFont.load_default()

F_HUGE  = load_font("LiberationSans-Bold.ttf",    160)
F_TITLE = load_font("LiberationSans-Bold.ttf",     68)
F_Q     = load_font("LiberationSans-Bold.ttf",     46)
F_OPT   = load_font("LiberationSans-Regular.ttf",  40)
F_BODY  = load_font("LiberationSans-Regular.ttf",  50)
F_SMALL = load_font("LiberationSans-Regular.ttf",  36)
F_BRAND = load_font("LiberationSans-Bold.ttf",     42)
F_TAG   = load_font("LiberationSans-Bold.ttf",     34)

BG_TOP  = (12, 18, 50);  BG_BOT  = (8, 12, 30);   BG_CARD = (28, 38, 65)
BG_OPT  = (22, 32, 56);  ACCENT  = (99,102,241);   ACCENT2 = (168,85,247)
GOLD    = (251,191,36);   GREEN   = (34,197,94);    GREEN_D = (22,135,62)
WHITE   = (255,255,255);  GREY    = (148,163,184);  LIGHT   = (220,228,244)
OPT_COLS = [((99,102,241),(180,182,255)), ((16,185,129),(150,240,200)),
            ((245,158,11),(255,220,130)), ((239,68,68),(255,160,160))]

def gradient_bg(img, top, bot):
    arr = np.zeros((H,W,3), dtype=np.uint8)
    for c in range(3):
        arr[:,:,c] = np.linspace(top[c], bot[c], H, dtype=np.uint8)[:,np.newaxis]
    img.paste(Image.fromarray(arr))

def rr(draw, xy, r, fill, outline=None, w=2):
    x0,y0,x1,y1 = xy
    if x0>=x1 or y0>=y1: return
    draw.rounded_rectangle([x0,y0,x1,y1], radius=r, fill=fill, outline=outline, width=w)

def wrap(text, font, max_w, max_l=None):
    words = text.split(); lines, cur = [], ""
    for word in words:
        test = (cur+" "+word).strip()
        if font.getbbox(test)[2]-font.getbbox(test)[0] <= max_w: cur = test
        else:
            if cur: lines.append(cur)
            cur = word
    if cur: lines.append(cur)
    if max_l and len(lines) > max_l:
        lines = lines[:max_l]; lines[-1] = lines[-1][:max(4,len(lines[-1])-3)]+"..."
    return lines

def th(font, n, gap=10):
    b = font.getbbox("Ag"); return n*(b[3]-b[1])+(n-1)*gap

def mlt(draw, lines, font, x, y, col, align="left", gap=12):
    for ln in lines:
        b = font.getbbox(ln); lw,lh = b[2]-b[0], b[3]-b[1]
        dx = x - lw//2 if align=="center" else (x-lw if align=="right" else x)
        draw.text((dx, y), ln, font=font, fill=col); y += lh+gap
    return y

def pill(draw, cx, cy, text, font, bg, fg, px=24, py=10):
    b = font.getbbox(text); tw,tht = b[2]-b[0], b[3]-b[1]
    x0,y0 = cx-tw//2-px, cy-tht//2-py; x1,y1 = cx+tw//2+px, cy+tht//2+py
    rr(draw,(x0,y0,x1,y1),28,bg); draw.text((x0+px,y0+py),text,font=font,fill=fg)

def brand_bar(draw, sub="UPPSC", rid=""):
    draw.rectangle([(0,H-110),(W,H)], fill=(8,12,30))
    draw.line([(0,H-110),(W,H-110)], fill=ACCENT, width=2)
    draw.text((50,H-82), "@uppsc_pyq_daily", font=F_BRAND, fill=GREY)
    if rid:
        b = F_TAG.getbbox(rid); draw.text((W-b[2]+b[0]-50,H-82), rid, font=F_TAG, fill=GOLD)
    else:
        draw.text((50,H-82), sub[:22], font=F_BRAND, fill=ACCENT)

def frame_intro(t, q, n, rid=""):
    img = Image.new("RGB",(W,H)); draw = ImageDraw.Draw(img)
    gradient_bg(img,(20,10,60),BG_BOT)
    r = int(180+40*math.sin(t*math.pi*3)); cx,cy = W//2, H//2-200
    draw.ellipse([(cx-r,cy-r),(cx+r,cy+r)], outline=ACCENT, width=8)
    draw.ellipse([(cx-r+20,cy-r+20),(cx+r-20,cy+r-20)], fill=ACCENT2)
    mlt(draw,["UPPSC"],F_HUGE,W//2,cy-90,WHITE,align="center")
    mlt(draw,["Daily Quiz"],F_TITLE,W//2,cy+90,GOLD,align="center")
    sub = q.get("subject","GS")
    pill(draw,W//2,cy+240,f"  {sub}  ",F_BODY,ACCENT,WHITE)
    a = min(1.0,t*3); c=tuple(int(v*a) for v in LIGHT)
    mlt(draw,["Swipe up for Answer"],F_SMALL,W//2,H//2+280,c,align="center")
    brand_bar(draw,sub,rid); return img

def frame_question_options(t, q, n, rid=""):
    img = Image.new("RGB",(W,H)); draw = ImageDraw.Draw(img)
    gradient_bg(img,BG_TOP,BG_BOT)
    sub  = q.get("subject","General"); diff = q.get("difficulty","Medium")
    draw.rectangle([(0,0),(W,130)], fill=ACCENT)
    draw.text((50,30), sub.upper(), font=F_Q, fill=WHITE)
    dc = {"Easy":(34,197,94),"Medium":(251,191,36),"Hard":(239,68,68)}.get(diff,GOLD)
    pill(draw,W-110,65,diff,F_SMALL,dc,(10,10,10),px=18,py=8)
    qtext = q.get("question","")
    ql = wrap(qtext,F_Q,W-160,max_l=5); qh = th(F_Q,len(ql),gap=12)+60
    rr(draw,(40,140,W-40,140+qh),22,BG_CARD); mlt(draw,ql,F_Q,70,170,LIGHT,gap=12)
    opts = [("A",q.get("optA","")),("B",q.get("optB","")),
            ("C",q.get("optC","")),("D",q.get("optD",""))]
    oy_start = 140+qh+18; avail = H-110-oy_start-10
    opt_h = (avail - 12*3)//4
    for i,(label,text) in enumerate(opts):
        oy = oy_start + i*(opt_h+12)
        bg_col,_ = OPT_COLS[i]
        prog = max(0.0,min(1.0,(t - i*0.12)*4)); ox0 = 40+int((1-prog)*W)
        if ox0 > W-80: continue
        rr(draw,(ox0,oy,W-40,oy+opt_h),18,BG_OPT,outline=bg_col,w=2)
        cr = min(36,opt_h//2-8); ccx = ox0+26+cr; ccy = oy+opt_h//2
        draw.ellipse([(ccx-cr,ccy-cr),(ccx+cr,ccy+cr)],fill=bg_col)
        b=F_Q.getbbox(label); lw,lh=b[2]-b[0],b[3]-b[1]
        draw.text((ccx-lw//2,ccy-lh//2-2),label,font=F_Q,fill=WHITE)
        tw = W-40-(ox0+26+cr*2+20)-30
        ol = wrap(text,F_OPT,tw,max_l=2); obh=th(F_OPT,len(ol),gap=8)
        mlt(draw,ol,F_OPT,ox0+26+cr*2+18,oy+(opt_h-obh)//2,LIGHT,gap=8)
    brand_bar(draw,sub,rid); return img

def frame_answer(t, q, n, rid=""):
    img = Image.new("RGB",(W,H)); draw = ImageDraw.Draw(img)
    gradient_bg(img,(8,30,18),(5,15,10))
    sub = q.get("subject","GS"); ans = q.get("answer","?")
    ans_text = q.get("answerText",""); expl = q.get("explanation","")
    draw.rectangle([(0,0),(W,140)], fill=GREEN_D)
    draw.text((50,35), f"ANSWER:  Option  {ans}", font=F_TITLE, fill=WHITE)
    a = min(1.0,t*2); cc=tuple(int(c*a) for c in BG_CARD)
    rr(draw,(40,160,W-40,620),24,cc)
    opts = {"A":q.get("optA",""),"B":q.get("optB",""),"C":q.get("optC",""),"D":q.get("optD","")}
    correct = opts.get(ans,""); display = ans_text if ans_text else correct
    gc = tuple(int(c*a) for c in GREEN)
    mlt(draw, wrap(display,F_Q,W-160,max_l=5), F_Q, 70, 200, gc, gap=14)
    if ans_text and correct and ans_text.strip()!=correct.strip():
        mlt(draw, wrap(f"Option {ans}: {correct}",F_OPT,W-160,max_l=2), F_OPT, 70, 470, GOLD, gap=10)
    draw.line([(50,650),(W-50,650)], fill=GREEN_D, width=2)
    draw.text((50,668),"WHY?",font=F_Q,fill=GOLD)
    ea = min(1.0,max(0,(t-0.4)*2)); ec=tuple(int(c*ea) for c in LIGHT)
    mlt(draw, wrap(expl,F_SMALL,W-120,max_l=14), F_SMALL, 50, 730, ec, gap=10)
    brand_bar(draw,sub,rid); return img

def frame_cta(t, q, n, rid=""):
    img = Image.new("RGB",(W,H)); draw = ImageDraw.Draw(img)
    gradient_bg(img,(20,10,55),BG_BOT)
    for i in range(30):
        sx=int((i*317+t*120)%W); sy=int((i*211)%(H-200))
        br=int(128+127*math.sin(t*4+i)); sc=(br,br,int(br*0.6))
        draw.ellipse([(sx-2,sy-2),(sx+2,sy+2)],fill=sc)
    a=min(1.0,t*2); c=lambda col: tuple(int(v*a) for v in col)
    sub = q.get("subject","GS")
    mlt(draw,["Follow for"],F_TITLE,W//2,H//2-360,c(WHITE),align="center")
    mlt(draw,["Daily UPPSC"],F_TITLE,W//2,H//2-270,c(GOLD),align="center")
    mlt(draw,["Questions!"],F_TITLE,W//2,H//2-180,c(ACCENT2),align="center")
    pill(draw,W//2,H//2-20,"  @uppsc_pyq_daily  ",F_BODY,ACCENT,WHITE)
    pill(draw,W//2,H//2+110,"  Like  •  Share  •  Save  ",F_SMALL,ACCENT2,WHITE)
    mlt(draw,[f"500+ {sub} Questions Available"],F_SMALL,W//2,H//2+220,c(GREY),align="center")
    brand_bar(draw,sub,rid); return img

PHASES = [(frame_intro,2.0),(frame_question_options,10.0),(frame_answer,7.0),(frame_cta,4.0)]
TOTAL_DUR = sum(d for _,d in PHASES)

def make_bgm_wav(path, dur=24.0, rate=44100):
    def note(freq, d, vol=0.18):
        t = np.linspace(0,d,int(rate*d),False)
        s = np.sin(2*np.pi*freq*t)*0.6 + np.sin(4*np.pi*freq*t)*0.25 + np.sin(6*np.pi*freq*t)*0.1
        e = np.ones(len(t)); atk=max(1,int(rate*0.01)); rel=max(1,int(rate*0.4))
        e[:atk]=np.linspace(0,1,atk); e[-rel:]=np.linspace(0.55,0,rel)
        return s*e*vol
    chords=[[261.63,329.63,392.00],[220.00,261.63,329.63],[174.61,220.00,261.63],[196.00,246.94,293.66]]
    total=int(rate*dur); out=np.zeros(total); cd=dur/len(chords)
    for i,chord in enumerate(chords):
        st=int(i*cd*rate)
        for f in chord:
            seg=note(f,cd); end=min(st+len(seg),total); out[st:end]+=seg[:end-st]
    t2=np.linspace(0,dur,total); out+=np.sin(2*np.pi*130.81*t2)*0.04
    out=out/(np.max(np.abs(out))+1e-9)*0.75
    fade=min(int(rate*2),total//4); out[:fade]*=np.linspace(0,1,fade); out[-fade:]*=np.linspace(1,0,fade)
    frames=(out*32767).astype(np.int16)
    with wave.open(path,'w') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(rate); wf.writeframes(frames.tobytes())

def make_video(q, fname, rid=""):
    out_path = os.path.join(OUT_DIR, fname)
    tmp = tempfile.mkdtemp()
    has_lofi = os.path.exists(LOFI_MP3)
    if has_lofi:
        audio_in = ["-stream_loop","-1","-i",LOFI_MP3]
    else:
        bgm = os.path.join(tmp,"bgm.wav"); print("  Generating piano BGM...")
        make_bgm_wav(bgm, dur=TOTAL_DUR+1.0); audio_in = ["-i",bgm]
    cmd = ([FFMPEG,"-y","-f","rawvideo","-vcodec","rawvideo",
            "-s",f"{W}x{H}","-pix_fmt","rgb24","-r",str(FPS),"-i","-"]
           + audio_in
           + ["-c:v","libx264","-preset","fast","-crf","23",
              "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
              "-af","volume=0.30","-shortest","-movflags","+faststart",out_path])
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for renderer,duration in PHASES:
        nf = int(duration*FPS)
        for f in range(nf):
            proc.stdin.write(renderer(f/max(1,nf-1), q, nf, rid).tobytes())
    proc.stdin.close(); proc.wait()
    shutil.rmtree(tmp, ignore_errors=True)
    size = os.path.getsize(out_path)//1024 if os.path.exists(out_path) else 0
    print(f"  OK {fname} ({size}KB, {'lofi' if has_lofi else 'bgm'})")
    return out_path

SUBJECT_MAP = {
    "geo":  ("Geography",      "GEO"),
    "pol":  ("Polity",         "POL"),
    "hist": ("Modern History", "HIST"),
    "eco":  ("Economy",        "ECO"),
    "sci":  ("Science",        "SCI"),
    "env":  ("Environment",    "ENV"),
    "up":   ("UP Special",     "UP"),
    "ca":   ("Current Affairs","CA"),
}

def load_db():
    with open(DB_PATH, encoding="utf-8") as f: return json.load(f)

def save_db(db):
    with open(DB_PATH, "w", encoding="utf-8") as f: json.dump(db, f, ensure_ascii=False, indent=2)

def get_used(db, prefix):
    return set(db.get("reelProgress",{}).get(prefix,[]))

def mark_used(db, prefix, qid):
    db.setdefault("reelProgress",{}).setdefault(prefix,[])
    if qid not in db["reelProgress"][prefix]: db["reelProgress"][prefix].append(qid)

def next_seq(db, prefix):
    return len(db.get("reelProgress",{}).get(prefix,[])) + 1

def main():
    mode  = sys.argv[1].lower() if len(sys.argv)>1 else "geo"
    count = int(sys.argv[2])    if len(sys.argv)>2 else 3
    db = load_db()

    if mode == "news":
        prefix = "NEWS"; all_qs = db.get("dailyQuizQuestions",[])
        used   = get_used(db,prefix)
        qs     = [q for q in all_qs if q.get("id","") not in used]
        if not qs: db.get("reelProgress",{}).pop(prefix,None); qs = all_qs
        qs = qs[:count]; seq = next_seq(db,prefix)
        label = lambda i,q: f"NEWS_{seq+i-1:03d}"
    elif mode == "all":
        prefix = "ALL"; all_qs = db.get("questions",[])
        used   = get_used(db,prefix)
        qs     = [q for q in all_qs if q.get("id","") not in used][:count]
        label  = lambda i,q: q.get("id",f"Q{i:03d}")
    else:
        if mode not in SUBJECT_MAP:
            print(f"Unknown mode '{mode}'. Use: news geo pol hist eco sci env up ca all"); sys.exit(1)
        subj_name,prefix = SUBJECT_MAP[mode]
        all_qs = [q for q in db.get("questions",[]) if q.get("subject","").lower()==subj_name.lower()]
        used   = get_used(db,prefix)
        qs     = [q for q in all_qs if q.get("id","") not in used]
        if not qs: db.get("reelProgress",{}).pop(prefix,None); used=set(); qs=all_qs
        qs = qs[:count]; seq = next_seq(db,prefix)
        label = lambda i,q: f"{prefix}_{seq+i-1:03d}"

    if not qs: print("No questions found!"); sys.exit(1)
    print(f"\n{'='*50}")
    print(f" Mode: {mode.upper()}  |  Count: {len(qs)}")
    print(f" Audio: {'Lofi MP3' if os.path.exists(LOFI_MP3) else 'Piano BGM'}")
    print(f"{'='*50}\n")

    for i,q in enumerate(qs,1):
        rid   = label(i,q)
        subj  = q.get("subject","GS").replace(" ","_")[:12]
        fname = f"reel_{rid}_{subj}.mp4"
        print(f"[{i}/{len(qs)}] {rid}  {q.get('question','')[:55]}...")
        make_video(q, fname, rid)
        mark_used(db, prefix, q.get("id",f"unk_{i}"))

    save_db(db)
    print(f"\nDone! {len(qs)} reel(s) saved to reels/")
    print(f"Tracking saved -> db.json reelProgress.{prefix}\n")

if __name__ == "__main__":
    main()
