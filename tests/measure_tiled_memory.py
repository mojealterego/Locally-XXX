"""Repeatable client-side measurement; no model or GPU exercised."""
import json, resource, tempfile, time
from pathlib import Path
from PIL import Image
from scripts.tiled_upscale import plan, stitch
from scripts.runtime_control import checksum
baseline=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
with tempfile.TemporaryDirectory() as d:
    root=Path(d);p=plan(7680,4320,4,1024,64,64);paths=[]
    for t in p['tiles']:
        f=root/(t['id']+'.png')
        with Image.new('RGB',(t['w'],t['h']),(t['col']*20,t['row']*30,90)) as im:im.save(f)
        paths.append(f)
    start=time.monotonic();out=root/'8k.png';stitch(p,paths,out,root)
    result={'scope':'Linux client PNG stitch; synthetic solid-colour tiles; not GPU or model benchmark','width':7680,'height':4320,'tiles':len(paths),'max_tile_pixels':max(t['w']*t['h'] for t in p['tiles']),'estimated_client_bytes':p['estimated_client_bytes'],'baseline_peak_rss_kib':baseline,'peak_process_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'elapsed_seconds':round(time.monotonic()-start,3),'sha256':checksum(out),'output_bytes':out.stat().st_size}
    print(json.dumps(result,sort_keys=True))
