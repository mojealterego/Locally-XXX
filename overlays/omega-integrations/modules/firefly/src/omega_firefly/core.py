"""OMEGA Image/Video Contract Engine - standalone deterministic reference implementation.

Important: No Adobe/Firefly SDK, model weights, video generation or vision models are bundled.
All external inferences (matting, recognition, identity QA) are adapter boundaries.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from typing import ClassVar, Literal
from uuid import uuid4
from urllib.parse import urlparse, parse_qs
import math
import re
import numpy as np
import cv2

from .effects import EFFECT_SPECS, validate_effect as _validate_effect, apply_effect as _apply_effect

class ContractError(ValueError):
    """Safe, explicit failure of a precondition or authorization rule."""

def validate_effect(name, params):
    try: return _validate_effect(name, params)
    except ValueError as exc: raise ContractError(str(exc)) from exc

def apply_effect(image, name, params=None, seed=0):
    try: return _apply_effect(image, name, params, seed)
    except ValueError as exc: raise ContractError(str(exc)) from exc

SLUG_RE = re.compile(r"^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$")
HEX_RE = re.compile(r"^[a-fA-F0-9]{64}$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
KINDS = frozenset(("CHARACTER", "OBJECT", "LOCATION"))
TEMPLATES = {
    "CHARACTER": frozenset(("FRONT", "THREE_QUARTER", "PROFILE", "BACK", "FULL_BODY", "EXPRESSION", "TURNAROUND_360")),
    "OBJECT": frozenset(("FRONT", "BACK", "TOP", "SIDE", "THREE_QUARTER", "TURNAROUND_360")),
    "LOCATION": frozenset(("WIDE", "INTERIOR", "EXTERIOR", "DAY", "NIGHT", "PANORAMA")),
}

def require_hash(digest: str) -> None:
    if not isinstance(digest,str) or not HEX_RE.fullmatch(digest):
        raise ContractError("INVALID_SHA256")

@dataclass(frozen=True)
class ReferenceImage:
    uri: str
    sha256: str
    rights_confirmed: bool
    def __post_init__(self):
        if not self.uri.startswith("asset://"):
            raise ContractError("REFERENCE_MUST_USE_MANAGED_ASSET")
        require_hash(self.sha256)
        if self.rights_confirmed is not True:
            raise ContractError("REFERENCE_REQUIRES_RIGHTS_CONFIRMATION")

@dataclass
class DerivedView:
    template: str
    asset_uri: str
    sha256: str
    source_revision: int
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    is_stale: bool = False

@dataclass
class Element:
    element_id: str
    kind: str
    canonical_name: str
    refs: tuple[ReferenceImage, ...]
    owner: str
    project_scope: str
    revision: int = 1
    description: str = ""
    description_source: str = "manual"
    views: dict[str,DerivedView] = field(default_factory=dict)
    dependencies: set[str] = field(default_factory=set)
    deleted: bool = False

class ElementRegistry:
    """In-memory domain model: persistence, auth and async generation are adapters."""
    def __init__(self): self._elements: dict[str,Element] = {}
    @staticmethod
    def _refs(refs):
        result=tuple(refs)
        if not 1<=len(result)<=5 or not all(isinstance(r,ReferenceImage) for r in result):
            raise ContractError("ELEMENT_REQUIRES_1_TO_5_VALID_REFERENCES")
        return result
    def create(self,kind,name,refs,owner,project_scope,description="",description_source="manual"):
        if kind not in KINDS: raise ContractError("INVALID_ELEMENT_KIND")
        if not isinstance(name,str) or not SLUG_RE.fullmatch(name): raise ContractError("INVALID_HYPHENATED_NAME")
        if not owner or not project_scope: raise ContractError("OWNER_AND_PROJECT_REQUIRED")
        if description_source not in ("manual","generated"): raise ContractError("INVALID_DESCRIPTION_SOURCE")
        references=self._refs(refs)
        element=Element(str(uuid4()),kind,name,references,owner,project_scope,description=description,description_source=description_source)
        self._elements[element.element_id]=element
        return element
    def get(self,element_id):
        e=self._elements.get(element_id)
        if not e or e.deleted: raise ContractError("ELEMENT_NOT_FOUND")
        return e
    def find(self,query,project_scope):
        return [e for e in self._elements.values() if not e.deleted and (e.project_scope==project_scope or e.project_scope=="global") and (e.element_id==query or e.canonical_name.lower()==query.lower())]
    def add_derived(self,element_id,template,asset_uri,digest,expected_revision):
        e=self.get(element_id)
        if e.revision!=expected_revision:raise ContractError("REVISION_CONFLICT")
        if template not in TEMPLATES[e.kind]:raise ContractError("UNSUPPORTED_DERIVED_TEMPLATE")
        if not asset_uri.startswith("asset://"):raise ContractError("UNMANAGED_DERIVED_ASSET")
        require_hash(digest)
        v=DerivedView(template,asset_uri,digest,e.revision)
        e.views[template]=v
        return v
    def regenerate_view(self,element_id,template,asset_uri,digest,expected_revision):
        e=self.get(element_id)
        if template not in e.views:raise ContractError("VIEW_NOT_FOUND")
        return self.add_derived(element_id,template,asset_uri,digest,expected_revision)
    def update(self,element_id,expected_revision,**changes):
        e=self.get(element_id)
        if e.revision!=expected_revision:raise ContractError("REVISION_CONFLICT")
        allowed={"kind","canonical_name","refs","description","description_source"}
        if not set(changes)<=allowed:raise ContractError("UNKNOWN_ELEMENT_FIELD")
        if "kind" in changes:
            if changes["kind"] not in KINDS:raise ContractError("INVALID_ELEMENT_KIND")
            if e.views and changes["kind"]!=e.kind:raise ContractError("KIND_LOCKED_AFTER_DERIVED_VIEWS")
        if "canonical_name" in changes and not SLUG_RE.fullmatch(changes["canonical_name"]):raise ContractError("INVALID_HYPHENATED_NAME")
        if "description_source" in changes and changes["description_source"] not in ("manual","generated"):raise ContractError("INVALID_DESCRIPTION_SOURCE")
        if "refs" in changes: changes["refs"]=self._refs(changes["refs"])
        ref_changed="refs" in changes and changes["refs"]!=e.refs
        for k,v in changes.items():setattr(e,k,v)
        e.revision+=1
        if ref_changed:
            for view in e.views.values():view.is_stale=True
        return e
    def add_dependency(self,element_id,dep): self.get(element_id).dependencies.add(dep)
    def remove_dependency(self,element_id,dep): self.get(element_id).dependencies.discard(dep)
    def delete(self,element_id,actor):
        e=self.get(element_id)
        if actor!=e.owner:raise ContractError("NOT_OWNER")
        if e.dependencies:raise ContractError("DEPENDENCIES_MUST_BE_UNLINKED")
        e.deleted=True

MENTION_RE=re.compile(r"(?<![\w@])@([A-Za-z][A-Za-z0-9-]*)", re.ASCII)
@dataclass(frozen=True)
class Mention:
    label: str
    start: int
    end: int

def scan_mentions(prompt: str):
    if not isinstance(prompt,str):raise ContractError("PROMPT_MUST_BE_TEXT")
    return [Mention(m.group(1),m.start(),m.end()) for m in MENTION_RE.finditer(prompt)]

@dataclass(frozen=True)
class ElementReference:
    element_id: str
    label: str

@dataclass(frozen=True)
class VideoPrompt:
    prompt: str
    refs: list[ElementReference]
    def compile(self):
        if not isinstance(self.prompt,str) or not self.prompt:raise ContractError("EMPTY_PROMPT")
        by_label={}
        for r in self.refs:
            if not isinstance(r,ElementReference) or not r.element_id or not SLUG_RE.fullmatch(r.label):raise ContractError("BAD_ELEMENT_REFERENCE")
            if r.label in by_label:raise ContractError("DUPLICATE_LABEL")
            by_label[r.label]=r
        mentions=scan_mentions(self.prompt)
        if any(m.label not in by_label for m in mentions):raise ContractError("UNRESOLVED_MENTION")
        return {"prompt":self.prompt,
                "elementReferences":[{"elementId":r.element_id,"label":r.label} for r in self.refs],
                "mentions":[{"label":m.label,"start":m.start,"end":m.end,"text":self.prompt[m.start:m.end]} for m in mentions]}

@dataclass(frozen=True)
class ColorAdjustments:
    exposure:float=0.0
    gamma:float=1.0
    shadow_offset:float=0.0
    highlights:float=0.0
    lights:float=0.0
    darks:float=0.0
    shadows:float=0.0
    brightness:float=0.0
    contrast:float=0.0
    tempA:float=0.0
    tempB:float=0.0
    tempLuminance:float=0.0
    hue:float=0.0
    saturation:float=0.0
    lightness:float=0.0
    colorize:bool=False
    vibrance:float=0.0
    global_saturation:float=0.0
    saturation_channels:dict[str,float]=field(default_factory=lambda:dict.fromkeys(('red','yellow','green','cyan','blue','magenta'),0.0))
    RANGES:ClassVar[dict[str,tuple[float,float]]]={
        "exposure":(-8,8),"gamma":(0.1,4),"shadow_offset":(-1,1),
        "highlights":(-1,1),"lights":(-1,1),"darks":(-1,1),"shadows":(-1,1),
        "brightness":(-1,1),"contrast":(-1,1),"tempA":(-50,50),"tempB":(-50,50),"tempLuminance":(-50,50),
        "hue":(-180,180),"saturation":(-1,1),"lightness":(-1,1),"vibrance":(-1,1),"global_saturation":(-1,1)}
    def __post_init__(self):
        for f,(lo,hi) in self.RANGES.items():
            v=getattr(self,f)
            if not isinstance(v,(float,int)) or not math.isfinite(v) or not lo<=v<=hi:raise ContractError(f"INVALID_COLOR_{f}")
        for key,value in self.saturation_channels.items():
            if key not in ('red','yellow','green','cyan','blue','magenta') or not isinstance(value,(float,int)) or not math.isfinite(value) or not -1<=value<=1:
                raise ContractError("INVALID_SATURATION_CHANNEL")

def _image_rgb(array):
    a=np.asarray(array)
    if a.dtype!=np.uint8 or a.ndim!=3 or a.shape[2] not in (3,4) or not a.size:
        raise ContractError("EXPECTED_RGB_OR_RGBA_U8")
    return a

def apply_tone(image:np.ndarray,c:ColorAdjustments)->np.ndarray:
    """CPU reference operator, sRGB gamma approximation; NOT a scene-referred ACES/ICC color engine."""
    arr=_image_rgb(image)
    if c==ColorAdjustments():return arr.copy()
    rgb=arr[...,:3].astype(np.float32)/255.
    rgb=np.clip(rgb*(2.**c.exposure),0,1)
    rgb=np.power(rgb,1./c.gamma)
    # Tonal controls are independent smooth weights, not cumulative single-slider aliases.
    luma=np.dot(rgb,[.2126,.7152,.0722])
    weights=[np.clip((luma-.65)/.35,0,1),np.maximum(0,1-np.abs(luma-.65)/.35),
             np.maximum(0,1-np.abs(luma-.35)/.35),np.clip((.35-luma)/.35,0,1)]
    for w,delta in zip(weights,(c.highlights,c.lights,c.darks,c.shadows)):
        rgb=np.clip(rgb+(w*delta*0.25)[...,None],0,1)
    rgb=np.clip((rgb-.5)*(1+c.contrast)+.5+c.brightness*.25 +c.shadow_offset*(1-luma)[...,None]*.15,0,1)
    if c.tempA or c.tempB or c.tempLuminance:
        lab=cv2.cvtColor(rgb.astype(np.float32),cv2.COLOR_RGB2LAB)
        lab[...,0]=np.clip(lab[...,0]+c.tempLuminance,0,100)
        lab[...,1]=np.clip(lab[...,1]+c.tempA,-127,127)
        lab[...,2]=np.clip(lab[...,2]+c.tempB,-127,127)
        rgb=np.clip(cv2.cvtColor(lab,cv2.COLOR_LAB2RGB),0,1)
    if any((c.hue,c.saturation,c.lightness,c.vibrance,c.global_saturation)) or any(c.saturation_channels.values()) or c.colorize:
        hsv=cv2.cvtColor(rgb.astype(np.float32),cv2.COLOR_RGB2HSV)
        if c.colorize: hsv[...,0]=((c.hue+180)%360)
        else: hsv[...,0]=(hsv[...,0]+c.hue)%360
        h=hsv[...,0];s=hsv[...,1]
        if c.vibrance:
            # Approximate skin protection: reduce boost at orange hues (15-50deg).
            skin=np.exp(-.5*((((h-30+180)%360)-180)/18)**2)
            scale=(1-s)*(1-.7*skin)
            s=np.clip(s + c.vibrance*scale,0,1)
        gain=c.saturation+c.global_saturation
        for center,name in zip((0,60,120,180,240,300),('red','yellow','green','cyan','blue','magenta')):
            delta=np.abs(((h-center+180)%360)-180)
            gain=gain+c.saturation_channels.get(name,0.)*np.maximum(0,1-delta/60)
        hsv[...,1]=np.clip(s*(1+gain),0,1)
        hsv[...,2]=np.clip(hsv[...,2]+c.lightness*.15,0,1)
        rgb=np.clip(cv2.cvtColor(hsv,cv2.COLOR_HSV2RGB),0,1)
    out=arr.copy()
    out[...,:3]=np.round(rgb*255).astype(np.uint8)
    return out

@dataclass(frozen=True)
class MaskRecord:
    maskURI:str
    tenant:str
    project:str
    sha256:str
    width:int
    height:int
    version:int
    expires_at:float
    acl:frozenset[str]
    precision:str="u8"
    coordinate_space:str="source-pixels"
    alpha_semantics:str="0-excluded-255-included"
    provenance:str="user-or-adapter"
    time_range:tuple[float,float]|None=None

class MaskStore:
    """In-memory example enforcing access and integrity. Production uses encrypted content store."""
    def __init__(self):self._map={}
    def put(self,mask,tenant,project,readers,ttl_s,now=None):
        mask=np.asarray(mask)
        if mask.ndim!=2 or mask.dtype!=np.uint8 or not mask.size:raise ContractError("INVALID_MASK_PIXELS")
        if not tenant or not project or not all(SLUG_RE.fullmatch(x) for x in (tenant,project)):
            raise ContractError("INVALID_MASK_SCOPE")
        if not readers or ttl_s<=0:raise ContractError("MISSING_ACL_OR_TTL")
        if now is None:now=datetime.now(timezone.utc).timestamp()
        key=str(uuid4());uri=f"omega-mask://{tenant}/{project}/{key}?v=1"
        rec=MaskRecord(uri,tenant,project,sha256(mask.tobytes()).hexdigest(),mask.shape[1],mask.shape[0],1,now+ttl_s,frozenset(readers))
        self._map[uri]=(rec,mask.copy())
        return rec
    def get(self,uri,tenant,project,principal,now=None):
        parsed=urlparse(uri)
        if parsed.scheme!="omega-mask" or parsed.netloc!=tenant or len(parsed.path.split('/'))!=3 or parse_qs(parsed.query).get('v')!=['1']:
            raise ContractError("INVALID_MASK_URI")
        if uri not in self._map:raise ContractError("MASK_NOT_FOUND")
        rec,pixels=self._map[uri]
        if (tenant,project)!=(rec.tenant,rec.project) or principal not in rec.acl:raise ContractError("MASK_PERMISSION_DENIED")
        if now is None:now=datetime.now(timezone.utc).timestamp()
        if now>=rec.expires_at:raise ContractError("MASK_EXPIRED")
        if sha256(pixels.tobytes()).hexdigest()!=rec.sha256:raise ContractError("MASK_INTEGRITY_FAILURE")
        return pixels.copy()

def select_mask(mask,excluded=None,invert=False):
    mask=np.asarray(mask)
    if mask.dtype!=np.uint8 or mask.ndim!=2:raise ContractError("INVALID_MASK_PIXELS")
    out=255-mask if invert else mask.copy()
    for name,other in (excluded or {}).items():
        o=np.asarray(other)
        if o.shape!=out.shape or o.dtype!=np.uint8:raise ContractError("INCOMPATIBLE_EXCLUSION_MASK")
        out=np.minimum(out,255-o)
    return out

@dataclass(frozen=True)
class CropSpec:
    bounds:tuple[float,float,float,float]=(0,0,1,1)
    focus:str="bounds"
    focus_box:tuple[float,float,float,float]|None=None
    alignX:float=.5
    alignY:float=.5
    margin:tuple[float,float,float,float]=(0,0,0,0) # L,T,R,B fractions of source image
    straighten:str="auto"
    mode:str="extract"
    def __post_init__(self):
        if self.focus not in ('bounds','subject','face','head','upper_body','prompt'):raise ContractError("INVALID_FOCUS_MODE")
        if self.straighten not in ('auto','level','vertical','full'):raise ContractError("INVALID_STRAIGHTEN_MODE")
        if self.mode not in ('extract','reframe','pad'):raise ContractError("INVALID_CROP_MODE")
        for r in (self.bounds,self.focus_box):
            if r is None:continue
            if len(r)!=4 or any(not math.isfinite(v) or not 0<=v<=1 for v in r) or r[2]<=r[0] or r[3]<=r[1]:raise ContractError("INVALID_NORMALIZED_BOUNDS")
        if any(not math.isfinite(x) or not 0<=x<=1 for x in (self.alignX,self.alignY)):
            raise ContractError("INVALID_CROP_ALIGNMENT")
        if len(self.margin)!=4 or any(not math.isfinite(x) or x<0 or x>1 for x in self.margin):raise ContractError("INVALID_MARGIN")

def compute_crop_bounds(width:int,height:int,spec:CropSpec):
    if width<=0 or height<=0:raise ContractError("INVALID_IMAGE_DIMENSIONS")
    if spec.focus!='bounds' and spec.focus_box is None:raise ContractError("FOCUS_REQUIRES_DETECTED_BOUNDS")
    l,t,r,b=spec.focus_box if spec.focus!='bounds' else spec.bounds
    ml,mt,mr,mb=spec.margin
    l,t,r,b=max(0,l-ml),max(0,t-mt),min(1,r+mr),min(1,b+mb)
    x0,y0,x1,y1=round(l*width),round(t*height),round(r*width),round(b*height)
    if x1<=x0 or y1<=y0:raise ContractError("EMPTY_CROP")
    return x0,y0,x1,y1

def crop_normalized(image,spec:CropSpec):
    arr=_image_rgb(image)
    x0,y0,x1,y1=compute_crop_bounds(arr.shape[1],arr.shape[0],spec)
    return arr[y0:y1,x0:x1].copy()

def _mask_match(image,mask):
    a=_image_rgb(image)
    if mask is None:raise ContractError("SEGMENTATION_MASK_REQUIRED")
    m=np.asarray(mask)
    if m.ndim!=2 or m.dtype!=np.uint8 or m.shape!=a.shape[:2]:raise ContractError("MASK_DIMENSIONS_MISMATCH")
    return a,m

def remove_background(image,mask,mode='cutout',hex_color='#FFFFFF'):
    a,m=_mask_match(image,mask)
    if mode not in ('cutout','solid'):raise ContractError("INVALID_BACKGROUND_MODE")
    if mode=='cutout':return np.dstack((a[...,:3],m.copy()))
    if not COLOR_RE.fullmatch(hex_color):raise ContractError("INVALID_HEX_COLOR")
    color=np.array([int(hex_color[i:i+2],16) for i in (1,3,5)],dtype=np.float32)
    alpha=m[...,None].astype(np.float32)/255.
    return np.rint(a[...,:3]*alpha+color*(1-alpha)).astype(np.uint8)

def remove_blemishes(image,mask,radius=3):
    a,m=_mask_match(image,mask)
    if not isinstance(radius,(float,int)) or not (0<radius<=32):raise ContractError("INVALID_BLEMISH_RADIUS")
    bgr=cv2.cvtColor(a[...,:3],cv2.COLOR_RGB2BGR)
    edited=cv2.cvtColor(cv2.inpaint(bgr,m,float(radius),cv2.INPAINT_TELEA),cv2.COLOR_BGR2RGB)
    result=a.copy()
    result[...,:3]=np.where(m[...,None]>0,edited,result[...,:3])
    return result

BODY_PARTS=frozenset((
 'Hair','Face','Eyes','LeftEye','RightEye','Pupil','Eyebrows','Nose','Mouth','Lips','Ears',
 'Neck','Shoulders','Arms','LeftArm','RightArm','Hands','LeftHand','RightHand','Chest',
 'Torso','UpperClothes','LowerClothes','Coat','Legs','Feet','Shoes','Hat'))

def refine_mask(mask,action,radius=1):
    """Deterministic morphology: produces a new mask, never mutates original."""
    m=np.asarray(mask)
    if m.dtype!=np.uint8 or m.ndim!=2:raise ContractError("INVALID_MASK_PIXELS")
    if action not in ('INVERT','FEATHER','DILATE','ERODE'):raise ContractError("INVALID_MASK_ACTION")
    if not isinstance(radius,int) or not 0<=radius<=128:raise ContractError("INVALID_MASK_RADIUS")
    if action=='INVERT':return 255-m
    if radius==0:return m.copy()
    if action=='FEATHER':return cv2.GaussianBlur(m,(radius*2+1,radius*2+1),radius/2+.1)
    k=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1))
    return cv2.dilate(m,k) if action=='DILATE' else cv2.erode(m,k)

def auto_tone(image,clip_limit=2.0):
    """Standalone autocontrast on Lab lightness using CLAHE; not an ML-based Adobe AutoTone."""
    a=_image_rgb(image)
    if not isinstance(clip_limit,(float,int)) or not .1<=clip_limit<=10:raise ContractError("INVALID_AUTO_TONE_CLIP")
    lab=cv2.cvtColor(a[...,:3],cv2.COLOR_RGB2LAB)
    clahe=cv2.createCLAHE(clipLimit=clip_limit,tileGridSize=(8,8))
    lab[...,0]=clahe.apply(lab[...,0])
    out=a.copy();out[...,:3]=cv2.cvtColor(lab,cv2.COLOR_LAB2RGB)
    return out

def gaussian_blur(image,radius,scope='currentLayer',mask=None):
    a=_image_rgb(image)
    if scope not in ('currentLayer','subject','background'):raise ContractError("INVALID_BLUR_SCOPE")
    if not isinstance(radius,(int,float)) or not math.isfinite(radius) or not 0<=radius<=64:raise ContractError("INVALID_BLUR_RADIUS")
    if scope!='currentLayer':a,m=_mask_match(a,mask)
    base=cv2.GaussianBlur(a[...,:3],(2*int(round(radius))+1,)*2,0) if radius else a[...,:3].copy()
    if scope!='currentLayer':
        strength=(m if scope=='subject' else 255-m)[...,None].astype(np.float32)/255.
        base=np.rint(base*strength+a[...,:3]*(1-strength)).astype(np.uint8)
    out=a.copy();out[...,:3]=base
    return out

def straighten(image,angle_deg,mode='level'):
    """Apply supplied angle: automatic angle estimation and full homography are NOT provided."""
    a=_image_rgb(image)
    if mode not in ('auto','level','vertical','full'):raise ContractError("INVALID_STRAIGHTEN_MODE")
    if not isinstance(angle_deg,(int,float)) or not math.isfinite(angle_deg) or abs(angle_deg)>45:
        raise ContractError("INVALID_STRAIGHTEN_ANGLE")
    h,w=a.shape[:2]
    matrix=cv2.getRotationMatrix2D((w/2.,h/2.),float(angle_deg),1.)
    return cv2.warpAffine(a,matrix,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT101)
