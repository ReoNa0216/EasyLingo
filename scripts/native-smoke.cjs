// Run only against an isolated audit build, or a fresh CI account.
const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const exe = process.argv[2];
  if (!exe) throw new Error('Pass the audit executable path');
  if (!fs.existsSync(exe)) throw new Error(`Executable does not exist: ${exe}`);
  fs.mkdirSync('artifacts', { recursive: true });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const request = JSON.parse(body);
      assert.equal(req.headers.authorization, 'Bearer smoke-test-key');
      assert.ok(request.messages.length);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify([{ type: 'word', original: 'hello', translation: '你好', explanation: 'greeting', example: 'Hello there!' }]) }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(path.resolve(exe), [], { windowsHide: true, env: { ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9337',
    WEBVIEW2_USER_DATA_FOLDER: path.resolve('artifacts/native-webview')
  } });
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9337'); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!browser) throw new Error('WebView2 debug endpoint did not start');
    const page = browser.contexts()[0].pages()[0];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    await page.waitForFunction(() => typeof app !== 'undefined' && app.isReady, { timeout: 20000 });
    const database = await page.evaluate(() => dbAdapter.select('PRAGMA database_list'));
    if (!process.env.CI) assert.match(database[0].file, /easylingo\.audit/i);
    console.log('Native startup and SQLite ready:', database[0].file);
    await page.getByRole('button', { name: '帮助与关于' }).click();
    await page.screenshot({ path: 'artifacts/native-about.png' });
    assert.match(await page.locator('#about-modal').innerText(), /开发者：陈挚/);
    await page.locator('#about-modal button').click();
    await page.evaluate(() => { window.smokeAlerts = []; window.alert = message => window.smokeAlerts.push(message); app.alertDialog = async message => window.smokeAlerts.push(message); app.confirmDialog = async () => true; });
    const port = server.address().port;
    await page.evaluate(async port => {
      await dbAdapter.putSetting({ id: 'apiUrl', value: `http://127.0.0.1:${port}/v1` });
      await dbAdapter.putSetting({ id: 'apiKey', value: 'smoke-test-key' });
      await dbAdapter.putSetting({ id: 'model', value: 'test-model' });
      await app.switchModule('english');
      await app.saveMaterial('native.txt', 'Hello world.');
    }, port);
    const result = await page.evaluate(async () => ({ materials: await dbAdapter.getAllMaterials(), entries: await dbAdapter.getAllEntries() }));
    assert.equal(result.materials.at(-1).status, 'completed');
    assert.equal(result.entries.at(-1).original, 'hello');
    console.log('Native HTTP → AI JSON → SQLite → UI passed');
    for (const extension of ['pdf', 'docx']) {
      const bytes = [...fs.readFileSync(`tests/fixtures/sample.${extension}`)];
      const text = await page.evaluate(async ({ bytes, extension }) => app.parseFile(new File([new Uint8Array(bytes)], `sample.${extension}`)), { bytes, extension });
      assert.match(text, /Hello EasyLingo/);
    }
    console.log('Native PDF/DOCX parsing passed');
    const restored = await page.evaluate(async () => {
      const data = { version: '2.0.1' };
      const tables = ['modules', 'materials', 'entries', 'cards', 'tests', 'records', 'settings'];
      for (const table of tables) data[table] = await dbAdapter.select(`SELECT * FROM ${table}`);
      await dbAdapter.restoreBackup(data);
      for (const table of tables) {
        const after = await dbAdapter.select(`SELECT * FROM ${table}`);
        if (JSON.stringify(after) !== JSON.stringify(data[table])) return false;
      }
      return true;
    });
    assert.equal(restored, true);
    console.log('Native SQLite backup transaction round trip passed');
    assert.deepEqual(errors, []);
    if (process.argv.includes('--news')) {
      const news = await page.evaluate(async () => Promise.all(['bbc', 'guardian', 'npr', 'asahi', 'zdf'].map(async source => {
        try {
          const rss = await app.desktopFetchRSS(source, 'world');
          const document = new DOMParser().parseFromString(rss, 'text/xml');
          const item = document.querySelector('item');
          const url = item?.querySelector('link')?.textContent?.trim();
          if (!url) return { source, status: 'no-article-links' };
          const article = await app.desktopFetchArticle(source, url, 'world');
          return { source, url, title: article.title, contentLength: article.content?.length || 0 };
        } catch (error) { return { source, error: String(error) }; }
      })));
      fs.writeFileSync('artifacts/native-news.json', JSON.stringify(news, null, 2));
      console.log('Native news results:', news);
    }
    if (process.argv.includes('--export')) {
      console.log('Waiting for native Save dialog selection');
      await page.evaluate(() => app.exportData());
      const alerts = await page.evaluate(() => window.smokeAlerts);
      console.log('Native export messages:', alerts);
      assert.ok(alerts.some(message => message.includes('数据导出成功')), 'Export must confirm a successful write');
    }
    console.log('NATIVE_SMOKE_PASS');
  } finally {
    if (browser) await browser.close();
    child.kill();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
