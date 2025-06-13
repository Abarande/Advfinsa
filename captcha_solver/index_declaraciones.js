// index_declaraciones_gob.js

require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch     = require('node-fetch');

async function solveCaptcha(base64) {
  const key = process.env.TWOCAPTCHA_KEY;
  if (!key) throw new Error('Missing TWOCAPTCHA_KEY in .env');

  // 1) Submit to 2Captcha
  let res = await fetch('http://2captcha.com/in.php', {
    method: 'POST',
    body: new URLSearchParams({
      method: 'base64',
      key,
      body:   base64,
      json:   1
    })
  });
  let j = await res.json();
  if (j.status !== 1) throw new Error('2Captcha error: ' + j.request);
  const id = j.request;

  // 2) Poll for solution
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    res = await fetch(`http://2captcha.com/res.php?key=${key}&action=get&id=${id}&json=1`);
    j   = await res.json();
    if (j.status === 1) return j.request;
  }
  throw new Error('2Captcha timed out');
}

;(async () => {
  const [,, cedula, nombre, modo = 'Ultimas'] = process.argv;
  if (!cedula || !nombre) {
    console.error('Usage: node index_declaraciones_gob.js <CEDULA> "<Nombre>" [Ultimas|Historico]');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true });
  const [page]  = await browser.pages();

  // 1) Load page & close splash
  await page.goto('https://www.contraloria.gob.ec/Consultas/DeclaracionesJuradas', {
    waitUntil: 'networkidle2'
  });
  await page.click('button.btn-close').catch(()=>{});
  await new Promise(res => setTimeout(res, 500));

  // 2) Grab the CAPTCHA <img id="captcha"> src
  await page.waitForSelector('img#captcha', { visible: true, timeout: 10000 });
  const dataUrl = await page.$eval('img#captcha', img => img.src);

  // 3) Strip off "data:image/…;base64,"
  const base64img = dataUrl.split(',')[1];

  // 4) Solve via 2Captcha
  let ca;
  try {
    ca = await solveCaptcha(base64img);
  } catch (err) {
    console.error('❌ 2Captcha failed:', err);
    await browser.close();
    process.exit(1);
  }

  // 5) Fill form fields
  await page.click('#txtCedula');
  await page.keyboard.type(cedula);
  await page.click('#txtNombres');
  await page.keyboard.type(nombre);
  await page.click('#x');
  await page.keyboard.type(ca);

  // 6) Submit & wait for JSON response
  await Promise.all([
    page.waitForResponse(resp =>
      resp.url().includes('WFResultados.aspx') &&
      resp.request().method() === 'GET',
      { timeout: 15000 }
    ),
    page.click('#btnBuscar_in', { force: true })
  ]);
  
  
  // 7) Read JSON and print recordsTotal
  const lastResponse = await page.evaluate(async () => {
    // find the latest WFResultados response via performance entries
    const entries = performance.getEntries().filter(e => e.name.includes('WFResultados.aspx'));
    const url = entries[entries.length - 1].name;
    const res = await fetch(url);
    return res.json();
  });



  console.log('recordsTotal =', lastResponse.recordsTotal);

  await browser.close();
})();
