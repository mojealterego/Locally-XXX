"""Isolated Chromium DOM verification; does not navigate the full application."""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT.parent/'overlays/omega-integrations/modules/studio/src'
def module_url(code):
    return 'data:text/javascript;base64,'+base64.b64encode(code.encode()).decode()
contracts=module_url((SRC/'contracts.mjs').read_text())
narrative=module_url((SRC/'narrative.mjs').read_text().replace("'./contracts.mjs'",repr(contracts)))
playtest=module_url((SRC/'playtest.mjs').read_text().replace("'./contracts.mjs'",repr(contracts)).replace("'./narrative.mjs'",repr(narrative)))
ui=module_url((ROOT/'apps/web/game-browser.mjs').read_text().replace("'./playtest.mjs'",repr(playtest)))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(accept_downloads=True)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('<main id="root"></main>')
    page.evaluate('async url=>{const m=await import(url);window.game=m.mountGameStudio(document.querySelector("#root"),{locale:"pl"})}',ui)
    page.get_by_role('button',name='Uruchom playtest').click()
    assert page.get_by_role('status').inner_text()=='Scena: opening'
    page.get_by_role('button',name='Sprawdź dowody').click()
    assert page.get_by_role('status').inner_text()=='Scena: evidence'
    page.get_by_role('button',name='Chroń świadka').click()
    assert page.get_by_role('status').inner_text()=='Zakończenie: safe'
    with page.expect_download() as d:
        page.get_by_role('button',name='Eksportuj przebieg').click()
    trace=json.loads(Path(d.value.path()).read_text())
    assert trace['state']=={'trust':3} and [x['choice'] for x in trace['history']]==['investigate','protect']
    page.get_by_role('button',name='Zacznij od nowa').click()
    assert page.get_by_role('status').inner_text()=='Scena: opening'
    page.get_by_role('button',name='Odejdź').click()
    assert page.get_by_role('status').inner_text()=='Zakończenie: end'
    page.get_by_label('Scenariusz JSON').fill('{}')
    assert page.get_by_role('button',name='Eksportuj przebieg').is_disabled()
    page.get_by_role('button',name='Uruchom playtest').click()
    assert 'Niepoprawny' in page.get_by_role('status').inner_text()
    page.evaluate('window.game.dispose()')
    assert not errors,errors
    browser.close()
print('GAME-07 PASS: actual DOM choices, two endings, state, trace download, reset and invalid input')
