# Test du bouton d'actualisation, de l'historique par produit et de l'ajout d'un fichier de comptes.
#   python3 tests/e2e-actualisation.py http://localhost:8080 sauvegarde.json ajout.json captures/
import sys, json, os
from playwright.sync_api import sync_playwright, expect
BASE, BACKUP, ADD, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
errors, external, res = [], [], {}
def watch(pg):
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('request', lambda r: external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith(('data:', 'blob:')) else None)
def restore(pg, f, choice=None):
    with pg.expect_file_chooser() as fc:
        pg.locator('[data-action="pick-backup"]:visible').first.click()
    fc.value.set_files(f); pg.wait_for_timeout(600)
    if choice: pg.locator(f'.sheet [data-choice="{choice}"]').click(); pg.wait_for_timeout(600)
def tab(pg, t): pg.locator(f'[data-tab="{t}"]:visible').first.click(); pg.wait_for_timeout(300)
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp, scheme in [('m', {'width': 390, 'height': 844}, 'light'), ('d', {'width': 1440, 'height': 900}, 'dark')]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if name == 'm' else 1, is_mobile=name == 'm', has_touch=name == 'm', color_scheme=scheme)
        pg = ctx.new_page(); watch(pg)
        pg.goto(BASE + '/'); pg.wait_for_load_state('networkidle')
        restore(pg, BACKUP)
        tab(pg, 'donnees'); restore(pg, ADD, 'merge')
        res[f'{name}_total_apres_ajout'] = pg.locator('.hero .big').inner_text().replace('\n', ' ')
        res[f'{name}_bouton_visible'] = pg.locator('.refresh-btn.top').is_visible()
        res[f'{name}_bouton_label_avant'] = pg.locator('.refresh-btn.top').inner_text()
        pg.screenshot(path=f'{OUT}/{name}-1-avant.png')
        pg.locator('.refresh-btn.top').click()
        pg.wait_for_timeout(150); res[f'{name}_pendant'] = pg.locator('.refresh-btn.top').inner_text()
        expect(pg.locator('#toast')).to_contain_text('actualisé', timeout=60000)
        res[f'{name}_toast'] = pg.locator('#toast').inner_text()
        res[f'{name}_bouton_label_apres'] = pg.locator('.refresh-btn.top').inner_text()
        res[f'{name}_total_apres_actualisation'] = pg.locator('.hero .big').inner_text().replace('\n', ' ')
        res[f'{name}_note_courbe_reconstruite'] = pg.locator('.chart-note').count()
        pg.screenshot(path=f'{OUT}/{name}-2-apres.png', full_page=True)
        pg.locator('.line', has_text='IA & Big Data').first.click(); pg.wait_for_selector('.sheet.open'); pg.wait_for_timeout(500)
        res[f'{name}_courbe_produit'] = pg.locator('.sheet [data-lhost] svg').count()
        res[f'{name}_courbe_texte'] = pg.locator('.sheet [data-lhover]').inner_text()
        pg.screenshot(path=f'{OUT}/{name}-3-detail.png')
        pg.locator('.sheet [data-lrange="5A"]').click(); pg.wait_for_timeout(300)
        res[f'{name}_courbe_5A'] = pg.locator('.sheet [data-lhover]').inner_text()
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.locator('.line', has_text='Fidelity Funds').first.click(); pg.wait_for_selector('.sheet.open'); pg.wait_for_timeout(400)
        res[f'{name}_fonds_estime'] = pg.locator('.sheet .callout').first.inner_text()[:90]
        pg.screenshot(path=f'{OUT}/{name}-4-fonds.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        tab(pg, 'donnees'); pg.screenshot(path=f'{OUT}/{name}-5-donnees.png', full_page=True)
        res[f'{name}_rapport'] = pg.locator('.card', has_text='Dernière actualisation').locator('p.small').inner_text()
        res[f'{name}_debordement'] = pg.evaluate('document.documentElement.scrollWidth') > vp['width'] + 1
        ctx.close()
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1)); print('ERREURS:', errors); print('EXTERNES:', sorted(set(external)))
