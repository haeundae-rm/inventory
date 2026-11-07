from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
BLACK='/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
MED='/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc'
def F(p,s): return ImageFont.truetype(p,s,index=1)
def grad(w,h,c1,c2):
    g=Image.new('RGB',(w,h)); px=g.load()
    for y in range(h):
        for x in range(w):
            t=(x/w*0.45+y/h*0.55)
            px[x,y]=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))
    return g
def gradfast(w,h,c1,c2):
    small=grad(64,64,c1,c2); return small.resize((w,h),Image.BICUBIC)
NAVY1=(0x23,0x4A,0x86); NAVY2=(0x10,0x23,0x3F)
def ctext(d,cx,y,t,f,fill):
    b=d.textbbox((0,0),t,font=f); d.text((cx-(b[2]-b[0])/2-b[0],y-b[1]),t,font=f,fill=fill)
def boxes(d,cx,cy,u,fill,bg):
    # 상자 3개 쌓기 (아래 2 · 위 1) + 테이프 줄
    s=u; gap=u*0.12; r=u*0.10; top=cy-s-gap/2
    pos=[(cx-s-gap/2,top+s+gap),(cx+gap/2,top+s+gap),(cx-s/2,top)]
    for (x,y) in pos:
        d.rounded_rectangle([x,y,x+s,y+s],radius=r,fill=fill)
        lw=max(2,s*0.07); d.rectangle([x,y+s*0.30-lw/2,x+s,y+s*0.30+lw/2],fill=bg)
        tw=s*0.20; d.rectangle([x+s/2-tw/2,y,x+s/2+tw/2,y+s*0.30],fill=bg)
def icon(S):
    k=4; W=S*k
    im=gradfast(W,W,NAVY1,NAVY2).convert('RGBA'); d=ImageDraw.Draw(im)
    cx=cy=W/2; R=W*0.355
    d.ellipse([cx-R,cy-R,cx+R,cy+R],outline='white',width=int(W*0.035))
    r2=R*0.86; d.ellipse([cx-r2,cy-r2,cx+r2,cy+r2],outline='white',width=int(W*0.012))
    ctext(d,cx,cy-R*0.64,'STOCK',F(BLACK,int(W*0.056)),'white')
    boxes(d,cx,cy-R*0.05,W*0.102,'white',(0x1A,0x37,0x66))
    ctext(d,cx,cy+R*0.40,'재고조사',F(BLACK,int(W*0.078)),'white')
    return im.resize((S,S),Image.LANCZOS).convert('RGB')
for s in (512,192,180):
    icon(s).save(f'/home/claude/banner/icon-{s}.png')
# 공유 배너 1200x630 (정비 레포트 og.png 와 같은 틀)
k=2; W,H=1200*k,630*k
og=gradfast(W,H,(0x23,0x4E,0x8C),(0x10,0x20,0x3C)).convert('RGBA')
tile=420*k//1.4; tile=int(300*k); tx,ty=int(90*k),int(165*k)
sh=Image.new('RGBA',(W,H),(0,0,0,0)); sd=ImageDraw.Draw(sh)
sd.rounded_rectangle([tx+6*k,ty+18*k,tx+tile+6*k,ty+tile+18*k],radius=int(64*k),fill=(0,0,0,120))
sh=sh.filter(ImageFilter.GaussianBlur(22*k)); og.alpha_composite(sh)
ic=icon(tile).convert('RGBA'); m=Image.new('L',(tile,tile),0); ImageDraw.Draw(m).rounded_rectangle([0,0,tile-1,tile-1],radius=int(64*k),fill=255)
og.paste(ic,(tx,ty),m)
d=ImageDraw.Draw(og)
x0=int(446*k)
d.text((x0,int(190*k)),'재고조사',font=F(BLACK,int(96*k)),fill='white')
d.text((x0,int(330*k)),'객실 · 사우나 월말 재고조사',font=F(BOLD,int(34*k)),fill=(0xC9,0xDB,0xF2))
d.text((x0,int(380*k)),'숫자만 세면 결산 · 구매신청서까지 자동',font=F(BOLD,int(34*k)),fill=(0xC9,0xDB,0xF2))
d.rounded_rectangle([x0,int(448*k),x0+int(120*k),int(458*k)],radius=int(5*k),fill=(0xF4,0xC2,0x0D))
og.resize((1200,630),Image.LANCZOS).convert('RGB').save('/home/claude/banner/og.png')
# 미리보기: 배너 + 홈 화면 아이콘 모습 (지금 vs 새)
pv=Image.new('RGB',(1240,960),(0xEE,0xF2,0xF7)); pv.paste(Image.open('/home/claude/banner/og.png'),(20,20))
pd=ImageDraw.Draw(pv)
old=Image.open('/home/claude/inventory/icon-192.png'); new=Image.open('/home/claude/banner/icon-192.png')
rm=Image.open('/home/claude/haeundae-rm/rm/icon-192.png')
def tilep(img,x,y,label):
    s=150; t=img.resize((s,s),Image.LANCZOS); m=Image.new('L',(s,s),0); ImageDraw.Draw(m).rounded_rectangle([0,0,s-1,s-1],radius=34,fill=255)
    pv.paste(t,(x,y),m); ctext(pd,x+s/2,y+164,label,F(MED,22),(0x16,0x20,0x2C))
pd.text((40,680),'홈 화면 아이콘',font=F(BOLD,26),fill=(0x10,0x23,0x3F))
tilep(rm,60,730,'정비 레포트'); tilep(new,260,730,'재고조사 (새)'); tilep(old,520,730,'지금 아이콘')
pd.text((700,760),'← 정비 레포트와 같은 도장 모양으로\n    한 시스템처럼 보이게',font=F(MED,24),fill=(0x5E,0x6B,0x7A))
pv.save('/home/claude/banner/preview.png')
