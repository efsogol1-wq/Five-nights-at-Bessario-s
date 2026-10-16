# Screenshot / scenario harness: python3 tools/shot.py scenario.json
import asyncio, json, sys, os, subprocess, time, socket
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

async def main(path):
    sc = json.load(open(path))
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', os.path.join(ROOT, 'dist'), '--bind', '127.0.0.1'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    vp = sc.get('viewport', {'width': 932, 'height': 430})
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
            ctx = await b.new_context(viewport=vp, device_scale_factor=sc.get('dpr', 1), has_touch=sc.get('touch', False), is_mobile=sc.get('mobile', False))
            page = await ctx.new_page()
            logs = []
            page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
            page.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
            await page.goto(f'http://127.0.0.1:{port}/index.html' + sc.get('query', ''))
            await page.wait_for_function('window.NS && window.NS.ready', timeout=sc.get('bootTimeout', 90000))
            for st in sc.get('steps', []):
                if 'eval' in st:
                    try:
                        res = await page.evaluate(st['eval'])
                        if res is not None: print('eval ->', json.dumps(res) if st.get('full') else json.dumps(res)[:2000])
                    except Exception as e:
                        print('EVAL ERROR', e)
                if 'wait' in st: await page.wait_for_timeout(st['wait'])
                if 'waitFor' in st:
                    try: await page.wait_for_function(st['waitFor'], timeout=st.get('timeout', 60000))
                    except Exception as e: print('WAITFOR TIMEOUT', st['waitFor'])
                if 'tap' in st:
                    x, y = st['tap']
                    if sc.get('touch'): await page.touchscreen.tap(x, y)
                    else: await page.mouse.click(x, y)
                if 'shot' in st:
                    await page.screenshot(path=os.path.join(ROOT, 'shots', st['shot']))
                    print('shot', st['shot'])
            await b.close()
    finally:
        srv.terminate()
    errs = [l for l in logs if 'error' in l.lower() or 'warn' in l.lower()]
    print('\n'.join(logs[-60:] if sc.get('allLogs') else errs[-40:]))

asyncio.run(main(sys.argv[1]))
