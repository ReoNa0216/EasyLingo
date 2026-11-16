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
  const newsMode = process.argv.includes('--direct-news') ? 'direct' : process.argv.includes('--proxy-news') ? 'proxy' : 'system';
  const newsEnv = newsMode === 'direct' ? { NO_PROXY: '*', no_proxy: '*' } : {};
  if (newsMode === 'proxy') {
    assert.ok(process.env.EASYLINGO_TEST_PROXY, 'Set EASYLINGO_TEST_PROXY for explicit proxy verification');
    Object.assign(newsEnv, { HTTP_PROXY: process.env.EASYLINGO_TEST_PROXY, HTTPS_PROXY: process.env.EASYLINGO_TEST_PROXY,
      ALL_PROXY: process.env.EASYLINGO_TEST_PROXY, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' });
  }
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
  const child = spawn(path.resolve(exe), [], { windowsHide: true, env: { ...process.env, ...newsEnv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9337',
    WEBVIEW2_USER_DATA_FOLDER: path.resolve('artifacts/native-webview')
  } });
  let launchError;
  child.on('error', error => { launchError = error; });
  child.stdout.on('data', chunk => console.log('APP:', String(chunk).trim()));
  child.stderr.on('data', chunk => console.log('APP ERROR:', String(chunk).trim()));
  let browser;
  let connectionError;
  try {
    for (let i = 0; i < 120; i++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Application exited before WebView2 connected: ${child.exitCode}`);
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9337', { timeout: 1500 }); break; }
      catch (error) { connectionError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!browser) throw new Error(`WebView2 debug endpoint did not start (PID ${child.pid}, exit ${child.exitCode}): ${connectionError?.message}`);
    const page = browser.contexts()[0].pages()[0];
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    await page.waitForFunction(() => typeof app !== 'undefined' && app.isReady, { timeout: 20000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(250, 248, 252)');
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
    const japaneseId = await page.evaluate(async () => {
      const entry = { moduleId: 'japanese', type: 'word', original: '学習', translation: '学习', wordType: 'Noun' };
      await dbAdapter.putEntry(entry);
      await app.switchModule('japanese');
      app.switchModuleTab('words');
      return entry.id;
    });
    await page.locator(`#entry-${japaneseId}`).getByText('名词', { exact: true }).waitFor();
    await page.locator(`#entry-${japaneseId} button[title="编辑"]`).click();
    await page.locator('#edit-wordType').fill('名词（サ变）');
    await page.locator('#entry-edit-modal').getByRole('button', { name: '保存', exact: true }).click();
    await page.locator(`#entry-${japaneseId}`).getByText('名词（サ变）', { exact: true }).waitFor();
    assert.equal(await page.evaluate(async id => (await dbAdapter.getEntry(id)).wordType, japaneseId), '名词（サ变）');
    console.log('Native Japanese part-of-speech display and editing passed');
    const restored = await page.evaluate(async () => {
      const data = { version: '2.0' };
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
    if (process.argv.includes('--news') || newsMode !== 'system') {
      const news = await page.evaluate(async () => Promise.all(['bbc', 'guardian', 'npr', 'people', 'zdf', 'chinadaily'].map(async source => {
        let stage = 'list';
        try {
          const category = source === 'npr' ? 'news' : 'world';
          let url;
          if (source === 'chinadaily') {
            url = (await app.desktopFetchChinaDailyNews())[0]?.link;
          } else if (source === 'people') {
            url = (await app.desktopFetchPeopleNews())[0]?.link;
          } else {
            const rss = await app.desktopFetchRSS(source, category);
            const document = new DOMParser().parseFromString(rss, 'text/xml');
            url = document.querySelector('item link')?.textContent?.trim();
          }
          if (!url) return { source, status: 'no-article-links' };
          stage = 'article';
          const article = await app.desktopFetchArticle(source, url, category);
          return { source, url, title: article.title, contentLength: article.content?.length || 0, contentPreview: article.content?.slice(0, 160) };
        } catch (error) { return { source, stage, error: String(error) }; }
      })));
      for (const result of news) {
        if (result.error) { result.ui = { skipped: 'Native request failed' }; continue; }
        result.ui = await page.evaluate(async source => {
          const names = { bbc: 'BBC', guardian: 'Guardian', npr: 'NPR', people: 'People', zdf: 'ZDF', chinadaily: 'ChinaDaily' };
          const suffix = names[source];
          await app.switchModule(source === 'zdf' ? 'german' : source === 'people' ? 'japanese' : 'english');
          app[`fetched${suffix}Feeds`] = [];
          app[`save${suffix}History`]();
          app[`${source}CurrentArticle`] = null;
          const alertsBefore = window.smokeAlerts.length;
          await app[`fetch${suffix}News`]();
          const article = app[`${source}CurrentArticle`];
          return { title: article?.title, contentLength: article?.content?.length || 0,
            historyCount: app[`fetched${suffix}Feeds`].length,
            status: document.getElementById(`${source}-status`)?.textContent,
            alerts: window.smokeAlerts.slice(alertsBefore) };
        }, result.source);
      }
      await page.evaluate(() => { app.switchModuleTab('upload'); app.switchEnglishNewsSource('chinadaily'); });
      await page.locator('#news-import-container').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/news-ui-${newsMode}.png`, fullPage: true });
      fs.writeFileSync('artifacts/native-news.json', JSON.stringify(news, null, 2));
      fs.writeFileSync(`artifacts/native-news-${newsMode}.json`, JSON.stringify({ mode: newsMode, checkedAt: new Date().toISOString(), news }, null, 2));
      console.log('Native news results:', news);
      for (const item of news.filter(item => !item.error && item.ui.contentLength >= 100)) {
        const imported = await page.evaluate(async source => {
          const names = { bbc: 'BBC', guardian: 'Guardian', npr: 'NPR', people: 'People', zdf: 'ZDF', chinadaily: 'ChinaDaily' };
          const moduleId = source === 'people' ? 'japanese' : source === 'zdf' ? 'german' : 'english';
          await app.switchModule(moduleId);
          const sourceUrl = app[`${source}CurrentArticle`].link;
          await app[`process${names[source]}Content`]();
          const materials = (await dbAdapter.getAllMaterials()).filter(m => m.sourceFile === sourceUrl);
          const material = materials.at(-1);
          return { sourceUrl, moduleId, material, entries: material ? await dbAdapter.getEntriesByMaterial(material.id) : [] };
        }, item.source);
        assert.equal(imported.material.status, 'completed');
        assert.equal(imported.material.moduleId, imported.moduleId);
        assert.equal(imported.material.sourceFile, imported.sourceUrl);
        assert.ok(imported.entries.length > 0);
        console.log(`${item.source} → mocked AI → saved entries with original source passed`);
      }
      assert.ok(news.every(item => item.title && item.contentLength >= 100 && item.ui.contentLength >= 100), 'All six news sources must return article text through the native command and UI');
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
