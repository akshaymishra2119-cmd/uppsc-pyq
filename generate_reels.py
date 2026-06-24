#!/usr/bin/env python3
"""
UPPSC Instagram Reel Video Generator
=====================================
Reads questions from db.json and generates 1080x1920 animated MP4 videos.

Usage:
  python generate_reels.py          # generates 5 random questions
  python generate_reels.py 10       # generates 10 questions
  python generate_reels.py 10 pyq   # only PYQ questions
  python generate_reels.py 10 quiz  # only Daily Quiz questions

Output: D:\\uppsc_pyq\\reels\\  folder
"""

import json, os, sys, textwrap, random
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

# ── CONFIG ──────────────────────────────────────────────────────────────────
W, H    = 1080, 1920
FPS     = 30
import platform
if platform.system() == "Windows":
    DB_PATH = r"D:\uppsc_pyq\db.json"
    OUT_DIR = r"D:\uppsc_pyq\reels"
    _BASE   = r"C:\Windows\Fonts"
else:
    # Linux sandbox (mounted path)
    DB_PATH = "/sessions/vibrant-compassionate-ride/mnt/uppsc_pyq/db.json"
    OUT_DIR = "/sessions/vibrant-compassionate-ride/mnt/uppsc_pyq/reels"
    _BASE   = "/usr/share/fonts"

# Font paths
FONTS = [
    os.path.join(_BASE, "arialbd.ttf"),
    os.path.join(_BASE, "arial.ttf"),
    os.path.join(_BASE, "truetype/dejavu/DejaVuSans-Bold.ttf"),
    os.path.join(_BASE, "truetype/liberation/LiberationSans-Bold.ttf"),
    os.path.join(_BASE, "truetype/freefont/FreeSansBold.ttf"),
]
FONT_REG_PATHS = [
    os.path.join(_BASE, "arial.ttf"),
    os.path.join(_BASE, "truetype/dejavu/DejaVuSans.ttf"),
    os.path.join(_BASE, "truetype/liberation/LiberationSans-Regular.ttf"),
    os.path.join(_BASE, "truetype/freefont/FreeSans.ttf"),
]

def load_font(size, bold=True):
    paths = FONTS if bold else FONT_REG_PATHS
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except:
            pass
    return ImageFont.load_default()

# ── COLOURS (RGB for PIL) ────────────────────────────────────────────────────
BG_TOP    = (8,  18, 48)
BG_BOT    = (4,  8,  24)
TEAL      = (29, 158, 117)
GOLD      = (201,168, 76)
WHITE     = (255,255,255)
GRAY      = (160,170,190)
GREEN_OK  = (34, 197, 94)
DIM       = (60, 70, 90)
OPT_COLS  = [
    (37,  99,  235),   # A - blue
    (124, 58,  237),   # B - purple
    (217, 119, 6),     # C - amber
    (220, 50,  50),    # D - red
]
OPT_LABELS = ['A', 'B', 'C', 'D']

os.makedirs(OUT_DIR, exist_ok=True)

# ── GRADIENT BACKGROUND ──────────────────────────────────────────────────────
def make_bg():
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        r_val = y / H
        col = tuple(int(BG_TOP[i]*(1-r_val) + BG_BOT[i]*r_val) for i in range(3))
        draw.line([(0,y),(W,y)], fill=col)
    # subtle grid lines
    for x in range(0, W, 80):
        draw.line([(x,0),(x,H)], fill=(255,255,255,8))
    for y in range(0, H, 80):
        draw.line([(0,y),(W,y)], fill=(255,255,255,8))
    return img

BG_FRAME = make_bg()

def fresh_bg():
    return BG_FRAME.copy()

# ── TEXT HELPERS ─────────────────────────────────────────────────────────────
def draw_text_wrapped(draw, text, x, y, font, color, max_width, line_spacing=12, center=False):
    """Draw wrapped text, return bottom y."""
    words = text.split()
    lines = []
    line = ""
    for word in words:
        test = (line + " " + word).strip()
        bbox = font.getbbox(test)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    cur_y = y
    for ln in lines:
        if center:
            bbox = font.getbbox(ln)
            lw = bbox[2] - bbox[0]
            draw.text(((W - lw)//2, cur_y), ln, font=font, fill=color)
        else:
            draw.text((x, cur_y), ln, font=font, fill=color)
        bbox = font.getbbox(ln)
        cur_y += (bbox[3] - bbox[1]) + line_spacing
    return cur_y

def rounded_rect(draw, x1, y1, x2, y2, radius, fill, outline=None, outline_width=2):
    draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=fill, outline=outline, width=outline_width)

def alpha_blend(base_img, overlay_img, alpha):
    """Blend overlay onto base with given alpha (0-1)."""
    if alpha <= 0:
        return base_img
    if alpha >= 1:
        return overlay_img
    return Image.blend(base_img, overlay_img, alpha)

def pil_to_cv2(img):
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

# ── RENDER FRAMES ────────────────────────────────────────────────────────────

def render_frame(q, phase, frame_in_phase, total_in_phase):
    """
    Render one frame.
    phase: 'intro' | 'question' | 'options' | 'countdown' | 'answer' | 'cta'
    """
    img  = fresh_bg()
    draw = ImageDraw.Draw(img)
    t = frame_in_phase / max(total_in_phase - 1, 1)  # 0..1 progress in phase

    # ── Fonts ──
    fnt_brand  = load_font(38)
    fnt_tag    = load_font(26, bold=False)
    fnt_q      = load_font(46)
    fnt_opt    = load_font(40)
    fnt_ans_lbl= load_font(34, bold=False)
    fnt_big    = load_font(220)
    fnt_cta    = load_font(44)
    fnt_sub    = load_font(32, bold=False)
    fnt_exp    = load_font(34, bold=False)
    fnt_small  = load_font(28, bold=False)

    # ── Always draw brand bar at top ──
    draw.rectangle([0, 0, W, 110], fill=(15, 30, 70))
    draw.rectangle([0, 106, W, 112], fill=TEAL)
    brand_text = "📚 Ghatna Chakra"
    draw.text((40, 28), brand_text, font=fnt_brand, fill=GOLD)
    draw.text((W-240, 36), "UPPSC PYQ", font=fnt_tag, fill=GRAY)

    # ── Subject / year tag ──
    subj  = q.get('subject','General')
    year  = q.get('year', q.get('date',''))
    diff  = q.get('difficulty','')
    tag_text = f"  {subj}  "
    if year: tag_text += f"│  {year}  "
    if diff: tag_text += f"│  {diff}  "
    bbox = fnt_tag.getbbox(tag_text)
    tw = bbox[2]-bbox[0]+20
    rounded_rect(draw, 40, 130, 40+tw, 170, 8, fill=(29,158,117,180), outline=TEAL)
    draw.text((50, 135), tag_text, font=fnt_tag, fill=WHITE)

    # ── PHASE: intro ──
    if phase == 'intro':
        alpha = min(1.0, t * 3)
        col = tuple(int(c * alpha) for c in GOLD)
        draw_text_wrapped(draw, "UPPSC PCS", 0, 750, load_font(110), col, W, center=True)
        draw_text_wrapped(draw, "Previous Year", 0, 890, load_font(70, bold=False),
                          tuple(int(c*alpha) for c in GRAY), W, center=True)
        draw_text_wrapped(draw, "Question", 0, 990, load_font(110), col, W, center=True)
        # decorative line
        line_w = int(W * 0.6 * min(1.0, t*2))
        lx = (W - line_w)//2
        draw.rectangle([lx, 1120, lx+line_w, 1126], fill=TEAL)
        draw_text_wrapped(draw, "Can you answer this?", 0, 1160,
                          load_font(42, bold=False), tuple(int(c*min(1,t*2)) for c in WHITE), W, center=True)

    # ── PHASE: question ──
    elif phase == 'question':
        q_text = q.get('question','')
        # Slide in from right
        offset = int((1-min(1.0, t*2)) * 120)
        q_img  = fresh_bg()
        q_draw = ImageDraw.Draw(q_img)
        # question label
        q_draw.text((40+offset, 210), "Q.", font=load_font(54), fill=GOLD)
        draw_text_wrapped(q_draw, q_text, 40+offset, 290, fnt_q, WHITE, W-80, line_spacing=18)
        img = alpha_blend(img, q_img, min(1.0, t*1.5))

    # ── PHASE: options ──
    elif phase == 'options':
        # Draw question (static)
        q_text = q.get('question','')
        draw.text((40, 210), "Q.", font=load_font(54), fill=GOLD)
        draw_text_wrapped(draw, q_text, 40, 290, fnt_q, WHITE, W-80, line_spacing=18)

        opts = [q.get('optA',''), q.get('optB',''), q.get('optC',''), q.get('optD','')]
        n_opts = 4
        reveal_per = 1.0 / n_opts

        opt_start_y = 780
        for i, (label, opt_text, col) in enumerate(zip(OPT_LABELS, opts, OPT_COLS)):
            opt_t = (t - i * reveal_per) / reveal_per
            if opt_t < 0:
                break
            opt_alpha = min(1.0, opt_t * 3)
            slide_x = int((1 - min(1.0, opt_t*2)) * 150)

            oy = opt_start_y + i * 240
            box_img = fresh_bg()
            box_draw = ImageDraw.Draw(box_img)
            # option box
            rounded_rect(box_draw, 30+slide_x, oy, W-30+slide_x, oy+210, 20,
                        fill=tuple(c//5 for c in col),
                        outline=col, outline_width=3)
            # label circle
            rounded_rect(box_draw, 50+slide_x, oy+55, 130+slide_x, oy+155, 40, fill=col)
            box_draw.text((72+slide_x, oy+68), label, font=load_font(60), fill=WHITE)
            # option text
            draw_text_wrapped(box_draw, opt_text, 155+slide_x, oy+55, fnt_opt, WHITE, W-200)

            img = alpha_blend(img, box_img, opt_alpha)

    # ── PHASE: countdown ──
    elif phase == 'countdown':
        q_text = q.get('question','')
        draw.text((40, 210), "Q.", font=load_font(54), fill=GOLD)
        draw_text_wrapped(draw, q_text, 40, 290, fnt_q, WHITE, W-80, line_spacing=18)

        opts = [q.get('optA',''), q.get('optB',''), q.get('optC',''), q.get('optD','')]
        opt_start_y = 780
        for i, (label, opt_text, col) in enumerate(zip(OPT_LABELS, opts, OPT_COLS)):
            oy = opt_start_y + i * 240
            rounded_rect(draw, 30, oy, W-30, oy+210, 20,
                        fill=tuple(c//5 for c in col),
                        outline=col, outline_width=3)
            rounded_rect(draw, 50, oy+55, 130, oy+155, 40, fill=col)
            draw.text((72, oy+68), label, font=load_font(60), fill=WHITE)
            draw_text_wrapped(draw, opt_text, 155, oy+55, fnt_opt, WHITE, W-200)

        # overlay timer
        remaining = 5 - int(t * 5)
        remaining = max(0, remaining)
        pulse = 0.85 + 0.15 * abs(np.sin(t * np.pi * 10))
        timer_size = int(180 * pulse)
        fnt_timer = load_font(timer_size)
        timer_str = str(remaining) if remaining > 0 else "⏰"
        bbox = fnt_timer.getbbox(timer_str)
        tw = bbox[2]-bbox[0]
        # dark overlay circle
        draw.ellipse([(W//2-130, 1820), (W//2+130, 2080)],
                     fill=(10,20,50), outline=GOLD, width=6)
        draw.text(((W-tw)//2, 1840), timer_str, font=fnt_timer, fill=GOLD)
        draw_text_wrapped(draw, "What's your answer?", 0, 1760,
                          load_font(38, bold=False), GRAY, W, center=True)

    # ── PHASE: answer ──
    elif phase == 'answer':
        correct = q.get('answer','A')
        answer_text = q.get('answerText', q.get('optA',''))
        explanation = q.get('explanation','')

        q_text = q.get('question','')
        draw.text((40, 140), "Q.", font=load_font(48), fill=GOLD)
        draw_text_wrapped(draw, q_text, 40, 210, load_font(38), GRAY, W-80, line_spacing=14)

        opts = [q.get('optA',''), q.get('optB',''), q.get('optC',''), q.get('optD','')]
        opt_start_y = 560
        flash = 0.5 + 0.5*abs(np.sin(t * np.pi * 4)) if t < 0.3 else 1.0

        for i, (label, opt_text, col) in enumerate(zip(OPT_LABELS, opts, OPT_COLS)):
            oy = opt_start_y + i * 190
            is_correct = (label == correct)
            if is_correct:
                box_col = tuple(int(GREEN_OK[j]*flash + (col[j]//5)*(1-flash)) for j in range(3))
                border_col = GREEN_OK
                bw = 5
            else:
                box_col = tuple(c//8 for c in col)
                border_col = DIM
                bw = 2
            rounded_rect(draw, 30, oy, W-30, oy+175, 16,
                        fill=box_col, outline=border_col, outline_width=bw)
            lbl_col = GREEN_OK if is_correct else DIM
            rounded_rect(draw, 50, oy+42, 118, oy+138, 34, fill=lbl_col)
            draw.text((65, oy+52), label, font=load_font(52), fill=WHITE)
            tc = WHITE if is_correct else GRAY
            draw_text_wrapped(draw, opt_text, 140, oy+45, load_font(36 if is_correct else 34),
                              tc, W-180)
            if is_correct:
                draw.text((W-80, oy+60), "✓", font=load_font(64), fill=GREEN_OK)

        # Answer banner
        banner_alpha = min(1.0, (t-0.2)*3)
        if banner_alpha > 0:
            banner_y = opt_start_y + 4*190 + 20
            rounded_rect(draw, 30, banner_y, W-30, banner_y+200, 16,
                        fill=(20,80,50), outline=GREEN_OK, outline_width=3)
            draw.text((56, banner_y+16), "✅  Correct Answer:", font=load_font(36, bold=False),
                      fill=GREEN_OK)
            draw_text_wrapped(draw, answer_text, 50, banner_y+62, load_font(40), WHITE, W-100)

        # Explanation
        if explanation and t > 0.5:
            exp_y = opt_start_y + 4*190 + 240
            exp_alpha = min(1.0, (t-0.5)*4)
            rounded_rect(draw, 30, exp_y, W-30, min(H-180, exp_y+280), 12,
                        fill=(20,30,60), outline=(80,100,160), outline_width=2)
            draw.text((54, exp_y+14), "💡 Explanation", font=load_font(34, bold=False), fill=GOLD)
            draw_text_wrapped(draw, explanation[:220]+"…" if len(explanation)>220 else explanation,
                              50, exp_y+56, fnt_exp,
                              tuple(int(c*exp_alpha) for c in GRAY), W-100, line_spacing=10)

    # ── PHASE: cta ──
    elif phase == 'cta':
        # fade-in brand block
        alpha = min(1.0, t*2)
        draw_text_wrapped(draw, "📚", 0, 520, load_font(180), WHITE, W, center=True)
        draw_text_wrapped(draw, "Ghatna Chakra", 0, 740, load_font(80),
                          tuple(int(c*alpha) for c in GOLD), W, center=True)
        draw_text_wrapped(draw, "UPPSC PYQ Daily Practice", 0, 860, load_font(44, bold=False),
                          tuple(int(c*alpha) for c in GRAY), W, center=True)

        # divider
        lw = int(W*0.5*min(1.0, t*3))
        draw.rectangle([(W-lw)//2, 940, (W+lw)//2, 946], fill=TEAL)

        draw_text_wrapped(draw, "Follow for daily MCQs", 0, 980, load_font(54),
                          tuple(int(c*alpha) for c in WHITE), W, center=True)
        draw_text_wrapped(draw, "Questions · Analysis · Daily Quiz", 0, 1070,
                          load_font(36, bold=False),
                          tuple(int(c*alpha) for c in GRAY), W, center=True)

        # bottom bar
        draw.rectangle([0, H-160, W, H], fill=(15,30,70))
        draw.rectangle([0, H-162, W, H-156], fill=TEAL)
        draw_text_wrapped(draw, "Save this post & share with your friends! 🚀",
                          0, H-130, load_font(34, bold=False), GOLD, W, center=True)

    return img


def generate_video(q, out_path, q_num=1):
    """Generate one full video for a question."""
    # Phase definitions: (name, duration_seconds)
    phases = [
        ('intro',     2.0),
        ('question',  4.0),
        ('options',   5.0),
        ('countdown', 5.0),
        ('answer',    7.0),
        ('cta',       4.0),
    ]
    total_frames = sum(int(d * FPS) for _, d in phases)

    # Use XVID for maximum Windows compatibility; save as .avi
    fourcc = cv2.VideoWriter_fourcc(*'XVID')
    writer = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

    frame_count = 0
    for phase_name, duration in phases:
        n_frames = int(duration * FPS)
        for f in range(n_frames):
            img = render_frame(q, phase_name, f, n_frames)
            writer.write(pil_to_cv2(img))
            frame_count += 1
        print(f"  [{q_num}] Phase '{phase_name}' done ({n_frames} frames)")

    writer.release()
    print(f"  ✅ Saved: {out_path} ({frame_count} frames, {frame_count/FPS:.1f}s)")


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    count  = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    source = sys.argv[2] if len(sys.argv) > 2 else 'all'

    print(f"\n🎬 UPPSC Reel Generator")
    print(f"   Count  : {count}")
    print(f"   Source : {source}")
    print(f"   Output : {OUT_DIR}\n")

    with open(DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)

    pool = []
    if source in ('pyq', 'all'):
        pool += db.get('questions', [])
    if source in ('quiz', 'all'):
        pool += db.get('dailyQuizQuestions', [])

    if not pool:
        print("❌ No questions found in db.json")
        return

    random.shuffle(pool)
    selected = pool[:count]

    for i, q in enumerate(selected, 1):
        qid   = q.get('id', q.get('qid', f'q{i}'))
        subj  = q.get('subject','General').replace(' ','_')
        fname = f"reel_{i:02d}_{subj}_{qid}.avi"
        out   = os.path.join(OUT_DIR, fname)
        print(f"\n[{i}/{len(selected)}] Generating: {fname}")
        print(f"  Q: {q.get('question','')[:80]}")
        generate_video(q, out, q_num=i)

    print(f"\n Done! {len(selected)} videos saved to:\n   {OUT_DIR}")
    print("\nNext steps:")
    print("  1. Open the reels folder in File Explorer")
    print("  2. Review each video")
    print("  3. Add background music in CapCut (optional)")
    print("  4. Upload t