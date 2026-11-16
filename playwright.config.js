module.exports = {
  testDir: './tests/ui', workers: 1,
  use: { browserName: 'chromium', channel: 'msedge', headless: true, viewport: { width: 1280, height: 800 } },
  webServer: { command: 'node scripts/serve.cjs 1427', url: 'http://127.0.0.1:1427', reuseExistingServer: false },
};
