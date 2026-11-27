"""Isolated actual Chromium decoder/Canvas/DOM test; no HTTP navigation or full app claim.
Requires Python playwright and an installed Chromium; run from any directory.
"""
import base64
import io
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
def module_url(source):
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()
converter = module_url((ROOT / 'integrations/src/converter.mjs').read_text())
photo = module_url((ROOT / 'integrations/src/photo.mjs').read_text().replace("'./converter.mjs'", repr(converter)))
ui = module_url((ROOT / 'apps/web/photo-browser.mjs').read_text().replace("'./photo.mjs'", repr(photo)))
image = Image.new('RGB', (3, 2), (64, 128, 192))
source = io.BytesIO(); image.save(source, format='PNG')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(accept_downloads=True)
    errors = []; page.on('pageerror', lambda err: errors.append(str(err)))
    page.set_content('<main id="root"></main>')
    page.evaluate('async url => {const m=await import(url);window.photoSession=m.mountPhotoStudio(document.querySelector("#root"),{locale:"pl"})}', ui)
    page.locator('input[type=file]').set_input_files({'name':'fixture.png','mimeType':'image/png','buffer':source.getvalue()})
    page.get_by_label('Czarno-białe').check()
    page.get_by_role('button',name='Przetwórz lokalnie').click()
    page.get_by_role('link',name='Pobierz zdjęcie').wait_for(timeout=10000)
    assert page.get_by_role('status').inner_text() == '3 × 2 px'
    with page.expect_download() as result:
        page.get_by_role('link',name='Pobierz zdjęcie').click()
    decoded = Image.open(result.value.path()).convert('RGB')
    assert decoded.size == (3, 2)
    for r,g,b in decoded.getdata():
        assert r == g == b and 64 < r < 192
    page.get_by_label('Ekspozycja (EV)').fill('1')
    assert page.get_by_role('link',name='Pobierz zdjęcie').count() == 0
    page.evaluate('window.photoSession.dispose()')
    assert not errors, errors
    browser.close()
print('PHOTO-05 PASS: actual PNG decode, Canvas adjustments, isolated DOM and PNG download')
