#!/usr/bin/env node

const url = process.argv[2];
if (!url) {
  console.error('Usage: node fetch.js <url> [--scroll N] [--wait MS]');
  process.exit(1);
}

const scrollCount = (() => {
  const i = process.argv.indexOf('--scroll');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 5;
})();

const waitMs = (() => {
  const i = process.argv.indexOf('--wait');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : 5000;
})();

const path = require('path');
const { execSync } = require('child_process');
const skillDir = __dirname;

// Auto-install dependencies if missing
try {
  require.resolve('playwright');
} catch {
  console.error('playwright not found, installing dependencies...');
  execSync('npm install --no-audit --no-fund', { cwd: skillDir, stdio: 'inherit' });
  console.error('Installing Chromium browser...');
  execSync('npx playwright install chromium', { cwd: skillDir, stdio: 'inherit' });
}

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(waitMs);

    for (let i = 0; i < scrollCount; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(1000);
    }

    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
