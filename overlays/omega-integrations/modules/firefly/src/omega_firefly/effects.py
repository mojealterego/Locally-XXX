"""Deterministic CPU preview operations for the eighteen P09 effect identifiers.
These are original reference filters, not Adobe-compatible pixel-equivalent implementations.
"""
from __future__ import annotations
import math
import numpy as np
import cv2

# Public contract for interactive sliders: value ranges are OMEGA-design choices.
def s(minimum, maximum, default, unit='normalized'):
    return {'min':minimum,'max':maximum,'default':default,'unit':unit}

EFFECT_SPECS={
 'bloom':{'radius':s(0,24,4,'px'),'intensity':s(0,2,.35)},
 'bokehBlur':{'radius':s(0,32,5,'px'),'highlight':s(0,2,.2)},
 'cartoon':{'levels':s(2,32,8,'steps'),'edge':s(0,1,.6)},
 'colorhalftone':{'cell':s(2,32,6,'px'),'mix':s(0,1,.8)},
 'dither':{'levels':s(2,16,4,'levels'),'mix':s(0,1,1)},
 'duotone':{'strength':s(0,1,1)},
 'glitch':{'shift':s(0,32,5,'px'),'mix':s(0,1,.8)},
 'grain':{'amount':s(0,1,.18),'size':s(1,8,2,'px')},
 'lensDistortion':{'amount':s(-1,1,.12),'zoom':s(.5,2,1)},
 'mosaic':{'cell':s(1,64,8,'px')},
 'motionBlur':{'length':s(1,32,7,'px'),'angle':s(-180,180,0,'degrees')},
 'noise':{'amount':s(0,1,.15)},
 'pixelate':{'block':s(1,64,6,'px')},
 'radialBlur':{'strength':s(0,1,.2),'samples':s(2,32,8,'count')},
 'threshold':{'level':s(0,255,128,'u8'),'mix':s(0,1,1)},
 'tritone':{'strength':s(0,1,1)},
 'tritoneSepia':{'strength':s(0,1,1)},
 'twirl':{'angle':s(-720,720,90,'degrees'),'radius':s(.01,1,.7)},
}

def validate_effect(name,params):
    if name not in EFFECT_SPECS:raise ValueError('UNKNOWN_EFFECT')
    if not isinstance(params,dict):raise ValueError('INVALID_EFFECT_PARAMS')
    if not set(params)<=set(EFFECT_SPECS[name]):raise ValueError('UNKNOWN_EFFECT_SLIDER')
    for key,val in params.items():
        cfg=EFFECT_SPECS[name][key]
        if not isinstance(val,(float,int)) or not math.isfinite(val) or not cfg['min']<=val<=cfg['max']:
            raise ValueError('SLIDER_OUT_OF_RANGE')
    return True

def _blur(x,r):
    if r<=0:return x.copy()
    k=2*int(round(r))+1
    return cv2.GaussianBlur(x,(k,k),0)

def _luma(x):return np.clip(.2126*x[:,:,0]+.7152*x[:,:,1]+.0722*x[:,:,2],0,255)

def _blend(x,y,t):return x*(1-t)+y*t

def _colormap(lum,colors):
    out=np.zeros((*lum.shape,3),np.float32)
    positions=np.linspace(0,255,len(colors))
    for i in range(3):out[:,:,i]=np.interp(lum,positions,[c[i] for c in colors])
    return out

def apply_effect(image,name,params=None,seed=0):
    """Full-frame CPU preview with input RGB/RGBA uint8; alpha preserved; fixed seed -> replay."""
    params=params or {}
    validate_effect(name,params)
    p={key:params.get(key,meta['default']) for key,meta in EFFECT_SPECS[name].items()}
    a=np.asarray(image)
    if a.dtype!=np.uint8 or a.ndim!=3 or a.shape[2] not in (3,4) or not a.size:
        raise ValueError('EXPECTED_U8_RGB_OR_RGBA')
    x=a[...,:3].astype(np.float32);h,w=x.shape[:2]
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    rng=np.random.default_rng(seed)
    if name=='bloom':
        bright=np.maximum(x-180,0)*255/75
        y=np.clip(x+_blur(bright,p['radius'])*p['intensity'],0,255)
    elif name=='bokehBlur':
        g=_blur(x,p['radius']);y=np.clip(g+np.maximum(g-185,0)*p['highlight'],0,255)
    elif name=='cartoon':
        levels=int(p['levels']); quant=np.floor(x/(256/levels))*(256/levels)
        gray=cv2.cvtColor(x.astype(np.uint8),cv2.COLOR_RGB2GRAY)
        edge=cv2.Canny(gray,70,140).astype(bool)
        y=quant.copy();y[edge]=_blend(quant[edge],np.zeros_like(quant[edge]),p['edge'])
    elif name=='colorhalftone':
        cell=max(2,int(p['cell']));tiny=cv2.resize(x,(max(1,w//cell),max(1,h//cell)),interpolation=cv2.INTER_AREA)
        coarse=cv2.resize(tiny,(w,h),interpolation=cv2.INTER_NEAREST)
        dot=((xx%cell-cell/2)**2+(yy%cell-cell/2)**2)<(cell*.32)**2
        y=_blend(x,np.where(dot[...,None],coarse,255.),p['mix'])
    elif name=='dither':
        bayer=np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]],np.float32)
        d=bayer[np.arange(h)[:,None]%4,np.arange(w)[None,:]%4]
        levels=int(p['levels']);z=np.floor(np.clip(x/255*(levels-1)+(d[...,None]/16-.5),0,levels-1)+.5)*255/(levels-1)
        y=_blend(x,z,p['mix'])
    elif name=='duotone':
        y=_blend(x,_colormap(_luma(x),[[16,38,82],[245,218,159]]),p['strength'])
    elif name=='glitch':
        z=x.copy();sh=int(p['shift']);z[:,:,0]=np.roll(x[:,:,0],sh,axis=1);z[:,:,2]=np.roll(x[:,:,2],-sh,axis=1)
        y=_blend(x,z,p['mix'])
    elif name=='grain':
        cell=max(1,int(p['size']));noise=rng.normal(0,50,(max(1,math.ceil(h/cell)),max(1,math.ceil(w/cell)),1)).astype(np.float32)
        noise=cv2.resize(noise,(w,h),interpolation=cv2.INTER_NEAREST).reshape(h,w,1)
        y=x+noise*p['amount']
    elif name=='lensDistortion':
        cx=(w-1)/2;cy=(h-1)/2;radius=max(cx,cy,1)
        dx=(xx-cx)/radius;dy=(yy-cy)/radius;r2=dx*dx+dy*dy
        factor=(1+p['amount']*r2)/p['zoom']
        mx=(cx+dx*factor*radius).astype(np.float32);my=(cy+dy*factor*radius).astype(np.float32)
        y=cv2.remap(x,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
    elif name in ('mosaic','pixelate'):
        cell=max(1,int(p.get('cell',p.get('block',1))));
        tmp=cv2.resize(x,(max(1,w//cell),max(1,h//cell)),interpolation=cv2.INTER_AREA)
        y=cv2.resize(tmp,(w,h),interpolation=cv2.INTER_NEAREST)
    elif name=='motionBlur':
        ln=max(1,int(p['length']));size=ln*2+1;kernel=np.zeros((size,size),np.float32)
        angle=math.radians(p['angle']);cx=cy=ln
        x0=int(round(cx-ln*math.cos(angle)));y0=int(round(cy-ln*math.sin(angle)))
        x1=int(round(cx+ln*math.cos(angle)));y1=int(round(cy+ln*math.sin(angle)))
        cv2.line(kernel,(x0,y0),(x1,y1),1.,1);kernel/=max(kernel.sum(),1)
        y=cv2.filter2D(x,-1,kernel,borderType=cv2.BORDER_REFLECT101)
    elif name=='noise':
        y=x+rng.normal(0,60*p['amount'],x.shape).astype(np.float32)
    elif name=='radialBlur':
        cx=(w-1)/2;cy=(h-1)/2;acc=np.zeros_like(x)
        for alpha in np.linspace(0,p['strength'],int(p['samples'])):
            mx=cx+(xx-cx)*(1-alpha);my=cy+(yy-cy)*(1-alpha)
            acc+=cv2.remap(x,mx.astype(np.float32),my.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
        y=acc/int(p['samples'])
    elif name=='threshold':
        bw=np.where(_luma(x)>=p['level'],255.,0.)
        y=_blend(x,np.repeat(bw[...,None],3,axis=2),p['mix'])
    elif name=='tritone':
        y=_blend(x,_colormap(_luma(x),[[25,36,66],[108,144,140],[248,229,190]]),p['strength'])
    elif name=='tritoneSepia':
        y=_blend(x,_colormap(_luma(x),[[40,22,15],[151,103,61],[244,222,178]]),p['strength'])
    elif name=='twirl':
        cx=(w-1)/2;cy=(h-1)/2;dx=xx-cx;dy=yy-cy;r=np.hypot(dx,dy)
        limit=max(1,min(w,h)/2*p['radius']);phase=np.deg2rad(p['angle'])*np.maximum(0,1-r/limit)**2
        co=np.cos(phase);si=np.sin(phase)
        mx=cx+co*dx-si*dy;my=cy+si*dx+co*dy
        y=cv2.remap(x,mx.astype(np.float32),my.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
    else:
        raise ValueError('UNKNOWN_EFFECT')
    out=a.copy();out[...,:3]=np.clip(np.rint(y),0,255).astype(np.uint8)
    return out
