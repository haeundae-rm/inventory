# 재고조사 아이콘 · 공유 배너 — 정비 레포트(남색 도장) · 정비 지원(주황 카트)과 헷갈리지 않게 색·모양 다르게
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
BLACK='/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
MED='/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc'
F=lambda p,s: ImageFont.truetype(p,s,index=1)
THEMES={'green':((0x2E,0xA8,0x6E),(0x0B,0x5A,0x3B),(0xD9,0xF5,0xE6)),
        'purple':((0x8A,0x5C,0xE0),(0x3E,0x22,0x8A),(0xE7,0xDD,0xFB))}
def grad(w,h,c1,c2):
    g=Image.new('RGB',(64,64)); px=g.load()
    for y in range(64):
        for x in range(64):
            t=x/64*0.45+y/64*0.55; px[x,y]=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))
    return g.resize((w,h),Image.BICUBIC)
def ctext(d,cx,y,t,f,fill):
    b=d.textbbox((0,0),t,font=f); d.text((cx-(b[2]-b[0])/2-b[0],y-b[1]),t,font=f,fill=fill)
def icon(S,th):
    c1,c2,soft=THEMES[th]; k=4; W=S*k
    im=grad(W,W,c1,c2).convert('RGBA'); d=ImageDraw.Draw(im)
    s=W*0.25; gap=W*0.03; r=s*0.12; cx=W/2; base=W*0.80
    pos=[(cx-s-gap/2,base-s),(cx+gap/2,base-s),(cx-s/2,base-2*s-gap)]
    for i,(x,y) in enumerate(pos):
        d.rounded_rectangle([x,y,x+s,y+s],radius=r,fill='white' if i<2 else soft)
        lw=s*0.06; d.rectangle([x,y+s*0.30-lw/2,x+s,y+s*0.30+lw/2],fill=c2)
        tw=s*0.20; d.rectangle([x+s/2-tw/2,y,x+s/2+tw/2,y+s*0.30],fill=c2)
    # 위쪽 상자 옆 체크 배지 (다 셌음)
    bx,by,br=cx+s*0.95,base-2*s-gap+s*0.15,W*0.085
    d.ellipse([bx-br,by-br,bx+br,by+br],fill='white')
    d.line([(bx-br*0.45,by+br*0.02),(bx-br*0.1,by+br*0.38),(bx+br*0.5,by-br*0.35)],fill=c2,width=int(br*0.28),joint='curve')
    return im.resize((S,S),Image.LANCZOS).convert('RGB')
def og(th,path):
    c1,c2,soft=THEMES[th]; k=2; W,H=1200*k,630*k
    o=grad(W,H,c1,c2).convert('RGBA')
    tile=int(300*k); tx,ty=int(90*k),int(165*k)
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([tx+6*k,ty+18*k,tx+tile+6*k,ty+tile+18*k],radius=int(64*k),fill=(0,0,0,110))
    o.alpha_composite(sh.filter(ImageFilter.GaussianBlur(22*k)))
    ic=icon(tile,th).convert('RGBA'); m=Image.new('L',(tile,tile),0); ImageDraw.Draw(m).rounded_rectangle([0,0,tile-1,tile-1],radius=int(64*k),fill=255)
    o.paste(ic,(tx,ty),m); d=ImageDraw.Draw(o); x0=int(446*k)
    d.text((x0,int(190*k)),'재고조사',font=F(BLACK,int(96*k)),fill='white')
    d.text((x0,int(330*k)),'객실 · 사우나 월말 재고조사',font=F(BOLD,int(34*k)),fill=soft)
    d.text((x0,int(380*k)),'숫자만 세면 결산 · 구매신청서까지 자동',font=F(BOLD,int(34*k)),fill=soft)
    d.rounded_rectangle([x0,int(448*k),x0+int(120*k),int(458*k)],radius=int(5*k),fill='white')
    o.resize((1200,630),Image.LANCZOS).convert('RGB').save(path)
if __name__=='__main__':
    out=sys.argv[1] if len(sys.argv)>1 else '.'
    th=sys.argv[2] if len(sys.argv)>2 else 'green'
    for s in (512,192,180): icon(s,th).save(f'{out}/icon-{s}.png')
    og(th,f'{out}/og.png')
