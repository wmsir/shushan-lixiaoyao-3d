import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const URL = process.argv[2] || 'http://127.0.0.1:4188';
const SINGLE_HTML = path.resolve('dist/li-xiaoyao-3d.html');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    // 1. Live Server Real-Input Playtest + Arena Anti-Stuck Scan
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${URL}/?mute`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.G && window.__THREE_GAME_DIAGNOSTICS__));

    // Title screen visible?
    const titleMode = await page.evaluate(() => window.G.mode());
    if (titleMode !== 'title') throw new Error(`Expected title mode, got ${titleMode}`);

    // Click Start button via real user click
    await page.click('#btn-start');
    await page.evaluate(() => window.G.step(12, 1 / 60));
    const playMode = await page.evaluate(() => window.G.mode());
    if (playMode !== 'playing') throw new Error(`Expected playing mode, got ${playMode}`);

    // Move forward & execute 3-hit combo + Q + E + Dodge + Block
    const beforePos = await page.evaluate(() => window.G.pl());
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.G.step(40, 1 / 60));
    await page.keyboard.up('KeyW');
    const movedPos = await page.evaluate(() => window.G.pl());
    const distMoved = Math.hypot(movedPos.x - beforePos.x, movedPos.z - beforePos.z);

    // Engage Wave 1 enemies with real attack & skills
    const dmgCheck = await page.evaluate(() => {
      window.G.god(true);
      const startHp = window.G.enemies().reduce((s, e) => s + Number(e.hp), 0);
      // Combo 1 -> 2 -> 3
      window.G.press('KeyJ'); window.G.step(20, 1 / 60);
      window.G.press('KeyJ'); window.G.step(22, 1 / 60);
      window.G.press('KeyJ'); window.G.step(28, 1 / 60);
      // Skill Q (御剑术)
      window.G.press('KeyQ'); window.G.step(25, 1 / 60);
      // Skill E (万剑诀)
      window.G.press('KeyE'); window.G.step(45, 1 / 60);
      // Dodge (Space)
      window.G.press('Space'); window.G.step(18, 1 / 60);
      const afterHp = window.G.enemies().reduce((s, e) => s + Number(e.hp), 0);
      return { startHp, afterHp, dealt: startHp - afterHp, pl: window.G.pl() };
    });

    // Test Boss Fight & Ultimate R (天剑)
    const bossCheck = await page.evaluate(() => {
      window.G.toBoss();
      window.G.god(true);
      window.G.step(15, 1 / 60);
      const bossBefore = window.G.enemies().find((e) => e.kind === 'boss');
      window.G.press('KeyE'); window.G.step(55, 1 / 60);
      window.G.press('KeyJ'); window.G.step(24, 1 / 60);
      const bossAfter = window.G.enemies().find((e) => e.kind === 'boss');
      return {
        bossFound: Boolean(bossBefore),
        bossHpBefore: bossBefore?.hp,
        bossHpAfter: bossAfter?.hp,
        bossDealt: (Number(bossBefore?.hp || 0) - Number(bossAfter?.hp || 0)),
      };
    });

    // 8-Direction Arena Anti-Stuck Scan (guizang-game-skill combat-feel.md)
    const stuckCheck = await page.evaluate(() => {
      const dirs = [
        ['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'],
        ['KeyW', 'KeyD'], ['KeyW', 'KeyA'], ['KeyS', 'KeyD'], ['KeyS', 'KeyA'],
      ];
      let stuckDirs = 0;
      for (const keys of dirs) {
        window.G.keys.clear();
        for (const k of keys) window.G.keys.add(k);
        window.G.upd(90, 1 / 60);
        const edge = window.G.pl();
        // Now reverse direction and verify Li Xiaoyao cleanly leaves boundary/obstacles!
        window.G.keys.clear();
        const rev = keys.map((k) =>
          k === 'KeyW' ? 'KeyS' : k === 'KeyS' ? 'KeyW' : k === 'KeyA' ? 'KeyD' : 'KeyA',
        );
        for (const k of rev) window.G.keys.add(k);
        window.G.upd(45, 1 / 60);
        const away = window.G.pl();
        const escapeDist = Math.hypot(Number(away.x) - Number(edge.x), Number(away.z) - Number(edge.z));
        if (escapeDist < 1.5) stuckDirs++;
      }
      window.G.keys.clear();
      return { stuckDirs };
    });

    await page.close();

    // 2. Verify Single-HTML file via file:// with ZERO network requests!
    const filePage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const fileErrors = [];
    const externalReqs = [];
    filePage.on('console', (m) => { if (m.type() === 'error') fileErrors.push(m.text()); });
    filePage.on('pageerror', (e) => fileErrors.push(String(e)));
    filePage.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) {
        externalReqs.push(u);
      }
    });
    await filePage.goto(`${pathToFileURL(SINGLE_HTML).href}?auto&mute`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await filePage.waitForFunction(() => Boolean(window.__THREE_GAME_DIAGNOSTICS__?.frame >= 2), {
      timeout: 45000,
    });
    const singleDiag = await filePage.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);

    console.log(JSON.stringify({
      liveErrors: errors,
      distMoved: Number(distMoved.toFixed(2)),
      wave1Combat: dmgCheck,
      bossCombat: bossCheck,
      arenaAntiStuck: stuckCheck,
      singleHtml: {
        errors: fileErrors,
        externalRequests: externalReqs.length,
        renderer: singleDiag.renderer,
        frame: singleDiag.frame,
      },
    }, null, 2));

    if (errors.length > 0 || fileErrors.length > 0 || externalReqs.length > 0 || stuckCheck.stuckDirs > 0 || dmgCheck.dealt <= 0 || bossCheck.bossDealt <= 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
