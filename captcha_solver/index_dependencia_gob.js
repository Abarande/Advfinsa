// index_dependencia_gob.js

require('dotenv').config();
const puppeteer = require('puppeteer');

;(async () => {
  const [, , CEDULA, FECHA] = process.argv;
  if (!CEDULA || !FECHA) {
    console.error('Usage: node index_dependencia_gob.js <CEDULA> <DD/MM/YYYY>');
    process.exit(1);
  }


  // 1) Launch headless browser
  const browser = await puppeteer.launch({ headless: true, ignoreHTTPSErrors: true });
  const [page] = await browser.pages();

  // 2) Navigate to the form
  await page.goto('https://calculadoras.trabajo.gob.ec/dependencia', { waitUntil: 'networkidle2' });

  // 3) Inject CryptoJS for decryption
  await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js' });

  // 4) Fill the Cédula field
  await page.click('input[placeholder="Identificación"]');
  await page.keyboard.type(CEDULA);

  // 5) Zero-pad and fill Fecha, then blur + wait
  const parts = FECHA.split('/');
  const safeDate = [
    parts[0].padStart(2, '0'),
    parts[1].padStart(2, '0'),
    parts[2]
  ].join('/');
  await page.$eval('input[placeholder="dd/mm/yyyy"]', el => el.value = '');
  await page.$eval(
    'input[placeholder="dd/mm/yyyy"]',
    (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    },
    safeDate
  );
  await new Promise(r => setTimeout(r, 500)); // allow Angular to pick up

  // 6) Find the “Generar” button
  const buttons = await page.$$('button.btn.btn-primary');
  let generarBtn = null;
  for (const b of buttons) {
    const txt = await page.evaluate(el => el.innerText.trim(), b);
    if (txt === 'Generar') {
      generarBtn = b;
      break;
    }
  }
  if (!generarBtn) {
    console.error('❌ Could not find “Generar”');
    await browser.close();
    process.exit(1);
  }

  // 7) Click “Generar” and wait for the POST response
  const [response] = await Promise.all([
    page.waitForResponse(
      resp => resp.url().includes('/api/v1/calculadora/dependencia/obtenerInformacion') &&
              resp.request().method() === 'POST',
      { timeout: 15000 }
    ),
    generarBtn.click({ force: true })
  ]);

  // 8) Read encrypted payload
  const encrypted = await response.text();

  // 9) Decrypt in–page with CryptoJS
  const result = await page.evaluate(enc => {
    const key = CryptoJS.enc.Utf8.parse("5Z2wuljG8RYk77um16HJug==");
    const iv  = CryptoJS.enc.Utf8.parse("XTaaqYLbohNvyMpj");
    const dec = CryptoJS.AES.decrypt(enc, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    const txt = dec.toString(CryptoJS.enc.Utf8);
    return JSON.parse(txt);
  }, encrypted);


  // 10) Print the registro field
  const reg = result.dependenciaLaboralSectorPublico;
  console.log( reg);

  await browser.close();
})();
