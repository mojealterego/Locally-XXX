import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import io
import numpy as np
import pytest
from PIL import Image
from omega_firefly.core import (ElementRegistry, ElementReference, ReferenceImage, ContractError,
    scan_mentions, VideoPrompt, ColorAdjustments, MaskStore, validate_effect,
    EFFECT_SPECS, apply_effect, CropSpec, crop_normalized, remove_background,
    remove_blemishes, apply_tone, select_mask, compute_crop_bounds)


def ref(i=1): return ReferenceImage(uri=f'asset://ref-{i}',sha256=f'{i:064x}',rights_confirmed=True)

def test_create_types_and_limit():
    reg=ElementRegistry()
    for kind in ('CHARACTER','OBJECT','LOCATION'):
        assert reg.create(kind,'Red-Fox',[ref()], 'u', 'p').kind==kind
    with pytest.raises(ContractError): reg.create('STYLE','Style',[ref()],'u','p')
    for n in (0,6):
        with pytest.raises(ContractError):reg.create('CHARACTER','Fox',[ref(x) for x in range(n)],'u','p')

def test_reference_and_names():
    reg=ElementRegistry()
    for name in ('Red Fox','-Fox','Fox_1',''):
        with pytest.raises(ContractError):reg.create('CHARACTER',name,[ref()], 'u','p')
    with pytest.raises(ContractError):reg.create('CHARACTER','Fox',[ReferenceImage('https://a', 'bad',True)],'u','p')
    with pytest.raises(ContractError):reg.create('CHARACTER','Fox',[ReferenceImage('asset://ok','0'*64,False)],'u','p')

def test_stale_generation_revision_and_kind():
    reg=ElementRegistry()
    e=reg.create('CHARACTER','Red-Fox',[ref()], 'u','p')
    view=reg.add_derived(e.element_id,'FRONT','asset://view-1','1'*64,expected_revision=1)
    assert not view.is_stale
    with pytest.raises(ContractError):reg.update(e.element_id,expected_revision=2,kind='OBJECT')
    with pytest.raises(ContractError):reg.update(e.element_id,expected_revision=1,kind='OBJECT')
    reg.update(e.element_id,expected_revision=1,refs=[ref(2)])
    assert reg.get(e.element_id).views['FRONT'].is_stale
    assert reg.regenerate_view(e.element_id,'FRONT','asset://view-2','2'*64, expected_revision=2).is_stale is False

def test_permission_search_and_delete_with_dependents():
    r=ElementRegistry(); e=r.create('LOCATION','Old-Town',[ref()], 'u','p')
    assert r.find('Old-Town','p')[0].element_id==e.element_id
    assert r.find(e.element_id,'p')[0].element_id==e.element_id
    assert r.find('Old-Town','other')==[]
    with pytest.raises(ContractError):r.delete(e.element_id,'intruder')
    r.add_dependency(e.element_id,'video:1')
    with pytest.raises(ContractError):r.delete(e.element_id,'u')
    r.remove_dependency(e.element_id,'video:1')
    r.delete(e.element_id,'u')
    assert not r.find('Old-Town','p')

def test_mentions_preserve_exact_bytes_and_labels():
    prompt='Scena z @Red-Fox, światło i @Old-Town; kontakt x@y.com'
    ms=scan_mentions(prompt)
    assert [(m.label,prompt[m.start:m.end]) for m in ms]==[('Red-Fox','@Red-Fox'),('Old-Town','@Old-Town')]
    refs=[ElementReference('e1','Red-Fox'),ElementReference('e2','Old-Town')]
    job=VideoPrompt(prompt, refs).compile()
    assert job['prompt']==prompt and job['elementReferences'][0]['label']=='Red-Fox'
    assert job['mentions'][0]['text']=='@Red-Fox'
    with pytest.raises(ContractError):VideoPrompt('Hej @Missing',refs).compile()
    with pytest.raises(ContractError):VideoPrompt('Hej @Red-Fox',[refs[0],refs[0]]).compile()

def test_color_bounds_independence():
    c=ColorAdjustments(tempA=5,tempB=-2,tempLuminance=4,highlights=0.2,lights=0.4,darks=-0.3,shadows=-0.1,vibrance=0.5)
    assert c.highlights!=c.lights and c.darks!=c.shadows
    with pytest.raises(ContractError):ColorAdjustments(exposure=999)
    with pytest.raises(ContractError):ColorAdjustments(gamma=float('nan'))
    with pytest.raises(ContractError):ColorAdjustments(saturation_channels={'red':2})

def test_color_identity_and_finite():
    arr=np.array([[[128,80,60],[10,20,30]]],dtype=np.uint8)
    assert np.array_equal(apply_tone(arr,ColorAdjustments()),arr)
    img=apply_tone(arr,ColorAdjustments(exposure=1,tempA=5))
    assert img.shape==arr.shape and img.dtype==np.uint8

def test_mask_scope_expiration_integrity_invert_and_exclusion():
    store=MaskStore(); m=np.array([[0,255],[255,0]],dtype=np.uint8)
    rec=store.put(m,'t','p',{'agent-a'},ttl_s=10,now=1000)
    assert np.array_equal(store.get(rec.maskURI,'t','p','agent-a',now=1001),m)
    with pytest.raises(ContractError):store.get(rec.maskURI,'other','p','agent-a',now=1001)
    with pytest.raises(ContractError):store.get(rec.maskURI,'t','p','outsider',now=1001)
    with pytest.raises(ContractError):store.get(rec.maskURI,'t','p','agent-a',now=1011)
    assert np.array_equal(select_mask(m,invert=True),255-m)
    assert np.array_equal(select_mask(m,excluded={'nose':np.array([[0,255],[0,0]],np.uint8)}),np.array([[0,0],[255,0]],np.uint8))
    with pytest.raises(ContractError):store.get('https://localhost/admin','t','p','agent-a',now=1001)

def test_effect_catalog_and_all_filters():
    assert len(EFFECT_SPECS)==18
    rgba=np.dstack([np.tile(np.arange(0,64,8,dtype=np.uint8),(8,1))]*3+[np.full((8,8),255,np.uint8)])
    for name,info in EFFECT_SPECS.items():
        assert info and all('min' in v and 'max' in v and 'default' in v for v in info.values())
        params={p:d['default'] for p,d in info.items()}
        validate_effect(name,params)
        o=apply_effect(rgba,name,params,seed=42)
        assert o.shape==rgba.shape and o.dtype==np.uint8
        assert np.array_equal(o[...,3],rgba[...,3])
    with pytest.raises(ContractError):validate_effect('unknown',{})
    with pytest.raises(ContractError):validate_effect('bloom',{'radius':10000})
    with pytest.raises(ContractError):validate_effect('bloom',{'unlisted':1})

def test_effect_determinism():
    arr=np.tile(np.arange(16,dtype=np.uint8).reshape(4,4,1),(1,1,3))
    assert np.array_equal(apply_effect(arr,'noise',{'amount':0.2},seed=14),apply_effect(arr,'noise',{'amount':0.2},seed=14))
    assert not np.array_equal(apply_effect(arr,'noise',{'amount':0.2},seed=14),apply_effect(arr,'noise',{'amount':0.2},seed=15))

def test_crop_contract_and_normalization():
    spec=CropSpec(bounds=(0.1,0.2,0.8,0.9),focus='bounds',alignX=0.33,alignY=0.5,margin=(0,0,0,0),straighten='auto')
    assert compute_crop_bounds(100,200,spec)==(10,40,80,180)
    a=np.zeros((200,100,3),np.uint8)
    assert crop_normalized(a,spec).shape==(140,70,3)
    with pytest.raises(ContractError):CropSpec(bounds=(0.8,0.2,0.1,0.9))
    with pytest.raises(ContractError):CropSpec(bounds=(-0.1,0.2,0.9,0.8))
    with pytest.raises(ContractError):CropSpec(straighten='illegal')

def test_crop_focus_and_margin():
    spec=CropSpec(focus='subject',focus_box=(0.5,0.5,0.7,0.7),margin=(0.1,0.2,0.1,0.2))
    assert compute_crop_bounds(100,100,spec)==(40,30,80,90)
    with pytest.raises(ContractError):compute_crop_bounds(100,100,CropSpec(focus='face'))

def test_remove_bg_and_blemishes_contract():
    arr=np.full((16,16,3),120,dtype=np.uint8)
    m=np.full((16,16),255,dtype=np.uint8);m[:4]=0
    cut=remove_background(arr,m,'cutout')
    assert cut.shape==(16,16,4) and cut[0,0,3]==0 and cut[5,5,3]==255
    sol=remove_background(arr,m,'solid','#00FFAA')
    assert sol.shape==(16,16,3) and list(sol[0,0])==[0,255,170]
    with pytest.raises(ContractError):remove_background(arr,m,'solid','#XYZ')
    with pytest.raises(ContractError):remove_background(arr,None,'cutout')
    arr[7:9,7:9]=[220,2,1];blem=np.zeros((16,16),np.uint8); blem[7:9,7:9]=255
    out=remove_blemishes(arr,blem,radius=2)
    assert np.array_equal(out[0,0],arr[0,0])
    assert np.any(out[7:9,7:9]!=arr[7:9,7:9])
    with pytest.raises(ContractError):remove_blemishes(arr,None)

def test_body_parts_and_refine_mask():
    from omega_firefly.core import BODY_PARTS, refine_mask
    assert len(BODY_PARTS)>=20 and {'Hair','Eyes','Pupil','UpperClothes','LowerClothes','Coat'} <= BODY_PARTS
    mask=np.zeros((9,9),np.uint8);mask[4,4]=255
    assert refine_mask(mask,'DILATE',1).sum()>255
    assert refine_mask(mask,'ERODE',1).sum()==0
    assert np.array_equal(refine_mask(mask,'INVERT'),255-mask)
    assert refine_mask(mask,'FEATHER',2).shape==mask.shape
    with pytest.raises(ContractError):refine_mask(mask,'DILATE',1000)

def test_autotone_gaussian_blur_straighten():
    from omega_firefly.core import auto_tone, gaussian_blur, straighten
    a=np.zeros((16,16,3),np.uint8);a[:,8:]=255
    assert auto_tone(a).shape==a.shape
    assert gaussian_blur(a,3).shape==a.shape
    mask=np.zeros((16,16),np.uint8);mask[:,:8]=255
    bg=gaussian_blur(a,3,'background',mask)
    assert np.array_equal(bg[:,:8],a[:,:8])
    assert straighten(a,0).shape==a.shape
    with pytest.raises(ContractError):gaussian_blur(a,3,'background')

@pytest.mark.parametrize('effect_name',sorted(EFFECT_SPECS))
def test_individual_effect_operator(effect_name):
    image=np.array([[[x*10,y*10,128] for x in range(16)] for y in range(16)],dtype=np.uint8)
    out=apply_effect(image,effect_name,seed=20261122)
    assert out.shape==image.shape and out.dtype==np.uint8

@pytest.mark.parametrize('invalid',[
    {'bloom':{'radius':-1}}, {'motionBlur':{'angle':999}}, {'grain':{'size':0}},
    {'threshold':{'level':256}}, {'twirl':{'radius':1.1}},
])
def test_effect_validation_rejects_out_of_bounds(invalid):
    n,p=next(iter(invalid.items()))
    with pytest.raises(ContractError):validate_effect(n,p)
