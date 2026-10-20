# Test de bout en bout de Carnet (Playwright, Chromium).
#   python3 tests/e2e.py http://localhost:8080 chemin/export.csv dossier_captures
import sys, json, os, re
from playwright.sync_api import sync_playwright, expect

BASE, CSV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
errors, external = [], []
results = {}

def watch(page):
    page.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('request', lambda r: external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith('data:') and not r.url.startswith('blob:') else None)

def shot(page, name, full=True):
    page.wait_for_timeout(450)
    page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def tab(page, name):
    page.locator(f'[data-tab="{name}"]:visible').first.click()
    page.wait_for_timeout(300)

def overflow(page):
    return page.evaluate('document.documentElement.scrollWidth') > page.viewport_size['width'] + 1

with sync_playwright() as p:
    b = p.chromium.launch()
    # ——— Téléphone, clair ———
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, color_scheme='light')
    page = ctx.new_page(); watch(page)
    page.goto(BASE + '/'); page.wait_for_load_state('networkidle')
    shot(page, 'm-light-01-vide', full=False)
    results['font_lora'] = page.evaluate("document.fonts.check('500 20px Lora')")
    # import CSV
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='Importer un CSV Trade Republic').click()
    fc.value.set_files(CSV)
    page.wait_for_selector('.sheet.open')
    shot(page, 'm-light-02-import-apercu', full=False)
    results['import_callout'] = page.locator('.sheet .callout').inner_text()
    page.locator('.sheet [data-ok]').click()
    page.wait_for_timeout(600)
    # profil
    tab(page, 'donnees')
    page.fill('#pf-name', 'Valentin'); page.get_by_role('button', name='Enregistrer').first.click()
    tab(page, 'patrimoine')
    results['title'] = page.locator('h1.title').inner_text()
    results['total_hero'] = page.locator('.hero .big').inner_text()
    shot(page, 'm-light-03-patrimoine')
    results['overflow_home_mobile'] = overflow(page)
    # détail d'une ligne
    page.locator('.line', has_text='MSCI World (PEA)').first.click()
    page.wait_for_selector('.sheet.open')
    shot(page, 'm-light-04-detail-ligne', full=False)
    results['detail_holdings'] = page.locator('.sheet .holding').count()
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    # compte
    page.locator('.acc').first.click(); page.wait_for_selector('.sheet.open'); shot(page, 'm-light-05-compte', full=False)
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    # actualisation (faux Yahoo)
    page.locator('.night [data-action="refresh"]').click()
    expect(page.locator('#toast')).to_contain_text('actualisés', timeout=20000)
    results['refresh_toast'] = page.locator('#toast').inner_text()
    results['stale_card_after'] = page.locator('.night').count()
    page.wait_for_timeout(500)
    shot(page, 'm-light-06-apres-actualisation')
    for t in ['analyse', 'simuler', 'donnees']:
        tab(page, t); shot(page, f'm-light-07-{t}')
        results[f'overflow_{t}_mobile'] = overflow(page)
    # simulation : vente de CAC 40 sur le PEA
    tab(page, 'simuler')
    page.select_option('#sim-line', 'tr-pea-lu1681046931')
    page.locator('[data-action="sim-mode"][data-v="sell"]').click()
    page.fill('#sim-amount', '1500')
    page.wait_for_timeout(300)
    results['sim_sell'] = page.locator('#sim-out').inner_text()[:400]
    shot(page, 'm-light-08-simuler-vente')
    # simulation achat nouvelle ligne
    page.locator('[data-action="sim-mode"][data-v="buy"]').click()
    page.select_option('#sim-line', 'new:LU1681045370'); page.wait_for_timeout(200)
    page.fill('#sim-price', '5,5'); page.fill('#sim-amount', '500'); page.wait_for_timeout(300)
    results['sim_buy_new'] = page.locator('#sim-out').inner_text()[:300]
    # ajout d'un compte Caisse d'Épargne avec solde
    tab(page, 'donnees')
    page.get_by_role('button', name='Ajouter un compte').click(); page.wait_for_selector('.sheet.open')
    page.fill('#ac-name', 'Caisse d’Épargne'); page.fill('#ac-bal', '1 234,56')
    shot(page, 'm-light-09-nouveau-compte', full=False)
    page.locator('.sheet button[type=submit]').click(); page.wait_for_timeout(400)
    # ajout d'une ligne manuelle (assurance-vie)
    page.get_by_role('button', name='Ajouter un compte').click(); page.wait_for_selector('.sheet.open')
    page.fill('#ac-name', 'Linxea Spirit 2'); page.select_option('#ac-kind', 'av'); page.locator('.sheet button[type=submit]').click(); page.wait_for_timeout(400)
    page.get_by_role('button', name='Ajouter une ligne').click(); page.wait_for_selector('.sheet.open')
    page.select_option('#lf-acc', label='Linxea Spirit 2'); page.select_option('#lf-type', 'fonds-euros')
    page.fill('#lf-name', 'Fonds euros (test)'); page.fill('#lf-amount', '2000')
    shot(page, 'm-light-10-nouvelle-ligne', full=False)
    page.locator('.sheet button[type=submit]').click(); page.wait_for_timeout(400)
    tab(page, 'patrimoine'); results['total_after_manual'] = page.locator('.hero .big').inner_text()
    # export clair + chiffré, effacement, restauration chiffrée
    tab(page, 'donnees')
    with page.expect_download() as dl:
        page.get_by_role('button', name='Exporter en clair').click()
    plain = f'{OUT}/export-clair.json'; dl.value.save_as(plain)
    page.get_by_role('button', name='Exporter chiffrée').click(); page.wait_for_selector('.sheet.open')
    page.fill('#pp1', 'une phrase de test'); page.fill('#pp2', 'une phrase de test')
    with page.expect_download() as dl2:
        page.locator('.sheet button[type=submit]').click()
    enc = f'{OUT}/export-chiffre.json'; dl2.value.save_as(enc)
    encj = json.load(open(enc)); results['encrypted_has_plain_names'] = ('Valentin' in open(enc).read()) or ('MSCI' in open(enc).read())
    results['encrypted_keys'] = sorted(encj.keys())
    page.get_by_role('button', name='Effacer toutes les données').click(); page.wait_for_selector('.sheet.open')
    page.locator('.sheet [data-ok]').click(); page.wait_for_timeout(500)
    results['after_wipe_empty'] = page.locator('.empty').count()
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='Restaurer une sauvegarde').click()
    fc.value.set_files(enc); page.wait_for_selector('.sheet.open')
    page.fill('#pp1', 'mauvaise phrase'); page.locator('.sheet button[type=submit]').click(); page.wait_for_timeout(2500)
    results['wrong_pass_toast'] = page.locator('#toast').inner_text()
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='Restaurer une sauvegarde').click()
    fc.value.set_files(enc); page.wait_for_selector('.sheet.open')
    page.fill('#pp1', 'une phrase de test'); page.locator('.sheet button[type=submit]').click(); page.wait_for_timeout(2500)
    results['total_after_restore'] = page.locator('.hero .big').inner_text()
    # PWA
    results['manifest'] = page.evaluate("fetch('manifest.webmanifest').then(r=>r.json()).then(j=>j.name+' '+j.icons.length)")
    results['sw'] = page.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r)")
    ctx.close()

    # ——— Téléphone, sombre : restaurer la sauvegarde livrée ———
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
    page = ctx.new_page(); watch(page)
    page.goto(BASE + '/'); page.wait_for_load_state('networkidle')
    shot(page, 'm-dark-01-vide', full=False)
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='Restaurer une sauvegarde').click()
    fc.value.set_files(sys.argv[4]); page.wait_for_timeout(800)
    results['delivered_backup_total'] = page.locator('.hero .big').inner_text()
    results['delivered_backup_title'] = page.locator('h1.title').inner_text()
    shot(page, 'm-dark-02-patrimoine')
    page.locator('.line').first.click(); page.wait_for_selector('.sheet.open'); shot(page, 'm-dark-03-detail', full=False)
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    for t in ['analyse', 'simuler', 'donnees']:
        tab(page, t); shot(page, f'm-dark-04-{t}')
    ctx.close()

    # ——— Ordinateur, clair et sombre ———
    for scheme in ['light', 'dark']:
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme=scheme)
        page = ctx.new_page(); watch(page)
        page.goto(BASE + '/'); page.wait_for_load_state('networkidle')
        if scheme == 'light': shot(page, f'd-{scheme}-00-vide', full=False)
        with page.expect_file_chooser() as fc:
            page.get_by_role('button', name='Restaurer une sauvegarde').click()
        fc.value.set_files(sys.argv[4]); page.wait_for_timeout(800)
        for t in ['patrimoine', 'analyse', 'simuler', 'donnees']:
            tab(page, t); shot(page, f'd-{scheme}-{t}')
            results[f'overflow_{t}_desktop_{scheme}'] = overflow(page)
        tab(page, 'patrimoine'); page.locator('.line').first.click(); page.wait_for_selector('.sheet.open'); shot(page, f'd-{scheme}-detail', full=False)
        ctx.close()
    # thème forcé via Données
    b.close()

print(json.dumps(results, ensure_ascii=False, indent=1))
print('ERREURS CONSOLE:', errors)
print('REQUÊTES EXTERNES:', sorted(set(external)))
