const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();
  await page.goto(`file://${__dirname}/blank.html`);
  await page.screenshot({path: `${__dirname}/screenshot.png`});
  await browser.close();
})();
