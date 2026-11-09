import { chromium } from '@playwright/test';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const ctx = b.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const probe = await page.evaluate(() => ({
  url: location.href,
  composer: !!document.querySelector('#prompt-textarea, [contenteditable="true"]'),
  login: [...document.querySelectorAll('a,button')].some((e) => /log in|sign up/i.test(e.textContent ?? '')),
}));
console.log(JSON.stringify(probe));
await page.screenshot({ path: '.playwright-mcp/gpt-cdp.png' });
