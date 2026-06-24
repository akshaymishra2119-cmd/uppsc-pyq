"""
Ghatna Chakra — Daily Reel Generator
Generates 10 Instagram Reels per day from UPPSC PYQ questions.
Subjects rotate day-by-day. Output: D:\uppsc_pyq\reels\YYYY-MM-DD\reel_01.mp4 ... reel_10.mp4

Usage:
  python make_reels.py              # auto-detect today's subject
  python make_reels.py --subject Polity
  python make_reels.py --date 2026-06-25
"""

import json, os, math, random, subprocess, argparse, shutil
from datetime import date
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(BASE_DIR, "db.json")
MUSIC_PATH = os.path.join(BASE_DIR, "mondamusic-lofi-study-542566.mp3")
OUT_BASE   = os.path.join(BASE_DIR, "reels")
FPS = 24
W, H = 1080, 1920

SUBJECTS = [
    "Polity","Modern History","Geography","Economy",
    "Science","Environment","Current Affairs","UP Special","Ancient History",
]

BG=(13,13,23); CARD=(24,26,44); ACCENT=(99,102,241)
GREEN_BG=(16,60,35); GREEN_T=(110,231,140); WHITE=(255,255,255)
GREY=(140,150,180); GOLD=(251,191,36)

def F(sz, bold=False):
    candidates = []
    if bold:
        candidates = ["C:/Windows/Fonts/arialbd.ttf","C:/Windows/Fonts/calibrib.ttf",
                      "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    else:
        candidates = ["C:/Windows/Fonts/arial.ttf","C:/Windows/Fonts/calibri.ttf",
                      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for p in candidates:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

FB=F(34,1); FBig=F(54,1); FQ=F(50,1); FOpt=F(43); FExp=F(44)
FSm=F(29); FTim=F(58,1); FTimSm=F(28)

def wrap(text, font, max_w, draw):
    words=text.split(); lines=[]; line=""
    for w in words:
        t=(line+" "+w).strip()
        if draw.textlength(t,font=font)<=max_w: line=t
        else:
            if line: lines.append(line)
            line=w
    if line: lines.append(line)
    return lines

def rr(d,xy,r,fill,outline=None,ow=2):
    d.rounded_rectangle(xy,radius=r,fill=fill,outline=outline,width=ow)

def opt_card(d,lbl,txt,x,y,w,ok=False):
    bg=GREEN_BG if ok else (32,34,58); bdr=GREEN_T if ok else (70,75,120); tc=GREEN_T if ok else (210,215,245)
    rr(d,[x,y,x+w,y+108],22,fill=bg,outline=bdr,ow=2)
    rr(d,[x+14,y+24,x+70,y+84],16,fill=ACCENT if not ok else GREEN_T)
    lc=(13,13,23) if ok else WHITE
    lw=d.textlength(lbl,font=FBig); d.text((x+14+(56-lw)/2,y+28),lbl,font=FBig,fill=lc)
    ls=wrap(txt,FOpt,w-105,d); th=len(ls)*(FOpt.size+6); sy=y+(108-th)//2
    for i,l in enumerate(ls): d.text((x+90,sy+i*(FOpt.size+6)),l,font=FOpt,fill=tc)

def timer_ring(d,cx,cy,r,elapsed,total,color):
    d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(50,52,80),width=8)
    ang=360*(1-elapsed/total)
    d.arc([cx-r,cy-r,cx+r,cy+r],start=-90,end=-90+ang,fill=color,width=8)
    rem=max(0,total-elapsed); num=str(int(math.ceil(rem)))
    nw=d.textlength(num,font=FTim); d.text((cx-nw/2,cy-FTim.size//2-2),num,font=FTim,fill=color)
    lw=d.textlength("sec",font=FTimSm); d.text((cx-lw/2,cy+FTim.size//2-2),"sec",font=FTimSm,fill=GREY)

def make_bg():
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    for i in range(300):
        a=1-i/300; c=tuple(int(BG[k]+(20-BG[k])*a*(0.6 if k==2 else 0.3)) for k in range(3))
        d.line([(0,i),(W,i)],fill=c)
    return img,d

def header(d,subject,year):
    d.text((54,58),"GHATNA CHAKRA",font=FB,fill=ACCENT)
    d.text((54,96),"UPPSC PYQ Practice",font=FSm,fill=GREY)
    badge=subject.upper(); bw=int(d.textlength(badge,font=FB))+36
    rr(d,[W-54-bw,54,W-54,102],24,ACCENT); d.text((W-54-bw+18,62),badge,font=FB,fill=WHITE)
    d.text((54,136),f"UPPSC {year}",font=FSm,fill=GREY)
    d.line([(54,172),(W-54,172)],fill=(45,48,80),width=2)

def footer(d):
    txt="Ghatna Chakra  •  UPPSC PCS 2026"
    d.text(((W-d.textlength(txt,font=FSm))/2,H-72),txt,font=FSm,fill=(60,65,100))

def q_frame(q,elapsed,q_lines,lh):
    img,d=make_bg(); header(d,q.get("subject",""),q.get("year","2025"))
    timer_ring(d,W-88,88,46,elapsed,10,GOLD)
    for i,l in enumerate(q_lines): d.text((54,200+i*lh),l,font=FQ,fill=WHITE)
    oy=200+len(q_lines)*lh+32
    for lbl,txt in [("A",q["optA"]),("B",q["optB"]),("C",q["optC"]),("D",q["optD"])]:
        opt_card(d,lbl,txt,54,oy,W-108); oy+=124
    footer(d); return img

def ans_frame(q,elapsed,q_lines,lh):
    img,d=make_bg(); header(d,q.get("subject",""),q.get("year","2025"))
    timer_ring(d,W-88,88,46,elapsed,5,GREEN_T)
    for i,l in enumerate(q_lines): d.text((54,200+i*lh),l,font=FQ,fill=(170,175,210))
    oy=200+len(q_lines)*lh+32
    for lbl,txt in [("A",q["optA"]),("B",q["optB"]),("C",q["optC"]),("D",q["optD"])]:
        opt_card(d,lbl,txt,54,oy,W-108,ok=(lbl==q["answer"])); oy+=124
    footer(d); return img

def exp_frame(q,elapsed):
    img,d=make_bg(); header(d,q.get("subject",""),q.get("year","2025"))
    timer_ring(d,W-88,88,46,elapsed,5,(140,180,255))
    ans_map={"A":q["optA"],"B":q["optB"],"C":q["optC"],"D":q["optD"]}
    tick=f"Correct: {q['answer']}  —  {ans_map.get(q['answer'],'')}"
    while d.textlength(tick,font=FBig)>W-140: tick=tick[:-4]+"..."
    rr(d,[54,195,W-54,320],22,fill=GREEN_BG,outline=GREEN_T,ow=2)
    tw=d.textlength(tick,font=FBig); d.text(((W-tw)/2,242),tick,font=FBig,fill=GREEN_T)
    rr(d,[54,350,W-54,H-100],24,fill=CARD)
    d.text((88,380),"Explanation",font=FB,fill=ACCENT)
    d.line([(88,426),(W-88,426)],fill=(50,55,90),width=1)
    exp=q.get("explanation","") or q.get("detail","") or "Refer NCERT for more details."
    exp_lines=wrap(exp,FExp,W-160,d); ey=450
    for l in exp_lines:
        d.text((88,ey),l,font=FExp,fill=(215,220,245)); ey+=FExp.size+10
        if ey>H-200: break
    footer(d); return img

def build_reel(q, out_path):
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    kf_dir=out_path.replace(".mp4","_kf"); os.makedirs(kf_dir,exist_ok=True)
    dummy=Image.new("RGB",(W,H)); dd=ImageDraw.Draw(dummy)
    q_lines=wrap(q["question"],FQ,W-108,dd); lh=FQ.size+10
    idx=0
    for sec in range(10,0,-1):
        q_frame(q,10-sec,q_lines,lh).save(f"{kf_dir}/f{idx:04d}.png"); idx+=1
    for sec in range(5,0,-1):
        ans_frame(q,5-sec,q_lines,lh).save(f"{kf_dir}/f{idx:04d}.png"); idx+=1
    for sec in range(5,0,-1):
        exp_frame(q,5-sec).save(f"{kf_dir}/f{idx:04d}.png"); idx+=1
    tmp=out_path.replace(".mp4","_silent.mp4")
    subprocess.run([ffmpeg,"-y","-framerate","1","-i",f"{kf_dir}/f%04d.png",
        "-vf","fps=24,scale=1080:1920","-c:v","libx264","-pix_fmt","yuv420p",
        "-crf","20","-preset","fast",tmp],capture_output=True,check=True)
    if os.path.exists(MUSIC_PATH):
        subprocess.run([ffmpeg,"-y","-i",tmp,"-i",MUSIC_PATH,
            "-filter_complex","[1:a]volume=0.35,afade=t=out:st=18:d=2[a]",
            "-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","128k",
            "-shortest",out_path],capture_output=True,check=True)
        os.remove(tmp)
    else:
        os.rename(tmp,out_path)
    shutil.rmtree(kf_dir,ignore_errors=True)

def get_subject_for_date(d):
    epoch=date(2026,1,1)
    return SUBJECTS[(d-epoch).days % len(SUBJECTS)]

def get_questions(subject, n=10):
    with open(DB_PATH,"r",encoding="utf-8") as f: db=json.load(f)
    questions=db.get("questions",db) if isinstance(db,dict) else db
    subj_lo=subject.lower()
    pool=[q for q in questions
          if subj_lo in (q.get("subject","") or "").lower()
          and all(q.get(k) for k in ["question","optA","optB","optC","optD","answer"])]
    if not pool:
        print(f"  Warning: no questions for '{subject}', using all")
        pool=[q for q in questions if all(q.get(k) for k in ["question","optA","optB","optC","optD","answer"])]
    return random.sample(pool, min(n, len(pool)))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--subject")
    parser.add_argument("--date")
    parser.add_argument("--count",type=int,default=10)
    args=parser.parse_args()
    today=date.fromisoformat(args.date) if args.date else date.today()
    subject=args.subject or get_subject_for_date(today)
    count=args.count
    out_dir=os.path.join(OUT_BASE,today.isoformat())
    os.makedirs(out_dir,exist_ok=True)
    print(f"\n{'='*52}")
    print(f"  Ghatna Chakra Reel Generator")
    print(f"  Date: {today}  |  Subject: {subject}  |  Count: {count}")
    print(f"  Output: {out_dir}")
    print(f"{'='*52}\n")
    questions=get_questions(subject,count)
    print(f"  Loaded {len(questions)} questions\n")
    for i,q in enumerate(questions,1):
        out=os.path.join(out_dir,f"reel_{i:02d}.mp4")
        print(f"  [{i:02d}/{count}] {q['question'][:55]}...")
        try:
            build_reel(q,out)
            print(f"         ✓ reel_{i:02d}.mp4")
        except Exception as e:
            print(f"         ✗ Error: {e}")
    print(f"\n  Done! Reels saved to:\n  {out_dir}\n")

if __name__=="__main__":
    main()
