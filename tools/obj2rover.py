#!/usr/bin/env python3
"""Convert the Mars Exploration Rover OBJ (trimesh export with per-vertex colors) into js/rover_mesh.js.

    python3 tools/obj2rover.py Mars_Exploration_Rover_3D.obj js/rover_mesh.js

The OBJ is one mesh made of ~900 separate pieces. This script:
  * finds the pieces (connected sets of faces) and sorts each one into a named part by where it sits:
    six wheels, rocker-bogie suspension, body, central solar deck, left and right solar wings,
    camera mast, mast head, high-gain antenna, low-gain antenna, robot arm, deck equipment;
  * gives every piece a material class from its color (aluminum, gold anodizing, body foil,
    solar cell, dark anodizing, lens glass);
  * turns the model from Z-up to Y-up (x, y, z) -> (x, z, -y), so +x is the rover's front;
  * stores each wheel relative to its own hub so the game can swap, resize or move wheels;
  * writes positions as 16-bit integers (0.1 mm steps), colors as bytes and indices as 16-bit
    integers, all base64 encoded, into one plain script (works on hosts that cannot serve .glb).
No third-party packages.
"""
import sys,json,math,base64,struct,collections

def load(path):
    V=[];C=[];F=[]
    for l in open(path,errors='ignore'):
        if l.startswith('v '):
            p=l.split();V.append(tuple(float(x) for x in p[1:4]));C.append(tuple(float(x) for x in p[4:7]) if len(p)>=7 else (.7,.7,.7))
        elif l.startswith('f '):
            idx=[int(x.split('/')[0]) for x in l.split()[1:]]
            idx=[i-1 if i>0 else len(V)+i for i in idx]
            for k in range(1,len(idx)-1):F.append((idx[0],idx[k],idx[k+1]))
    return V,C,F

def pieces(V,F):
    par=list(range(len(V)))
    def f(a):
        while par[a]!=a: par[a]=par[par[a]];a=par[a]
        return a
    for t in F:
        for v in t[1:]:
            a,b=f(t[0]),f(v)
            if a!=b: par[a]=b
    return [f(i) for i in range(len(V))]

ORANGE={(0.62,0.45,0.22),(0.78,0.61,0.29)}
BRONZE={(0.41,0.31,0.2),(0.39,0.27,0.14),(0.39,0.28,0.14),(0.22,0.17,0.12)}
def matclass(c,part=''):
    c=tuple(round(x,2) for x in c)
    if c in ORANGE: return 'gold'
    if c in BRONZE: return 'foil'
    if c in {(0.09,0.19,0.22),(0.08,0.1,0.11)}: return 'lens'
    # solar cells: only on the deck and wings, and only the neutral-to-warm greys used for cells
    if part in ('deck','wingL','wingR') and max(c)<0.235 and c[0]>0.14 and c[1]<=c[0]+0.005 and c[2]<=c[0]+0.005: return 'cell'
    if max(c)<0.4: return 'dark'
    return 'alu'

def main(src,dst):
    V,C,F=load(src)
    root=pieces(V,F)
    members=collections.defaultdict(list)
    for i,r in enumerate(root): members[r].append(i)
    box={}
    for r,ii in members.items():
        xs=[V[i][0] for i in ii];ys=[V[i][1] for i in ii];zs=[V[i][2] for i in ii]
        box[r]=(min(xs),max(xs),min(ys),max(ys),min(zs),max(zs))
    col=lambda r:tuple(round(x,2) for x in C[members[r][0]])
    # wheels: the six tire pieces
    tires=[r for r in members if len(members[r])==82 and col(r)==(0.6,0.62,0.6) and box[r][5]<0.75]
    W=[]
    for r in tires:
        b=box[r];W.append(dict(x=(b[0]+b[1])/2,y=(b[2]+b[3])/2,z=(b[4]+b[5])/2,r=(b[5]-b[4])/2,w=b[3]-b[2]))
    W.sort(key=lambda w:(w['y']>0,w['x']))
    lab={}
    for r,b in box.items():
        x,y,z=(b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2;c=col(r);L=None
        for wi,w in enumerate(W):
            if abs(y-w['y'])<0.2 and math.hypot(x-w['x'],z-w['z'])<w['r']+0.03 and c not in ORANGE|BRONZE and b[5]<w['z']+w['r']+0.03:
                L='wheel%d'%wi;break
        if L: pass
        elif b[4]>2.24 and 0.2<x<0.8 and 0<y<0.6: L='head'
        elif b[4]>1.3 and 0.2<x<0.6 and 0.15<y<0.45: L='mast'
        elif b[4]>1.3 and -0.5<x<-0.15 and 0.08<y<0.32: L='lga'
        elif b[4]>1.3 and -0.7<x<-0.15 and -0.8<y<-0.25: L='hga'
        elif x>0.85 and abs(y)<0.5 and b[5]<1.0: L='arm'
        elif abs(y)>0.78 and b[4]>0.75 and not (1.25<=b[4] and b[5]<=1.42 and abs(y)<=0.8): L='wingL' if y>0 else 'wingR'
        elif 1.25<=b[4] and b[5]<=1.42 and abs(y)<=0.8: L='deck'
        elif b[4]>1.36: L='deckitem'
        elif b[4]>=0.55 and abs(y)<0.66 and b[5]<1.3 and -0.95<x<0.9: L='body'
        else: L='susp'
        lab[r]=L
    # build parts: name -> material -> (positions, colors, indices); wheels relative to their hub
    parts=collections.defaultdict(lambda: collections.defaultdict(lambda: [[],[],[],{}]))
    for t in F:
        r=root[t[0]];L=lab[r];m=matclass(C[t[0]],L)
        P=parts[L][m];remap=P[3]
        for v in t:
            if v not in remap:
                x,y,z=V[v]
                if L.startswith('wheel'):
                    w=W[int(L[5:])];x,y,z=x-w['x'],y-w['y'],z-w['z']
                remap[v]=len(P[0])//3;P[0].extend((x,z,-y));P[1].extend(C[v])
            P[2].append(remap[v])
    def b64(fmt,arr):return base64.b64encode(struct.pack('<%d%s'%(len(arr),fmt),*arr)).decode()
    out={}
    tris=0
    for L,mats in parts.items():
        out[L]={}
        for m,(p,c,i,_) in mats.items():
            q=[max(-32767,min(32767,int(round(v*10000)))) for v in p]
            cc=[max(0,min(255,int(round(v*255)))) for v in c]
            out[L][m]={'p':b64('h',q),'c':b64('B',cc),'i':b64('H',i)}
            tris+=len(i)//3
    meta={'q':1e-4,'wheels':[{'x':round(w['x'],4),'y':round(w['z'],4),'z':round(-w['y'],4),'r':round(w['r'],4),'w':round(w['w'],4)} for w in W],
          'note':'Mars Exploration Rover OBJ, split into parts by tools/obj2rover.py. Y up, +x forward, units as in the source file.'}
    with open(dst,'w') as fh:
        fh.write('/* Generated by tools/obj2rover.py from the Mars Exploration Rover OBJ. Do not edit by hand. */\n')
        fh.write('window.ROVER_MESH=')
        json.dump({'meta':meta,'parts':out},fh,separators=(',',':'))
        fh.write(';\n')
    cnt=collections.Counter(lab.values())
    print('pieces',len(members),'triangles',tris,'parts',dict(cnt))
if __name__=='__main__':
    if len(sys.argv)<3: print(__doc__);sys.exit(1)
    main(sys.argv[1],sys.argv[2])
