require('dotenv').config()

const puppeteer       = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Register the “recaptcha” plugin so that page.solveRecaptchas() will work.
// You must have put your 2Captcha API key in a .env file as TWOCAPTCHA_KEY=…
// ──────────────────────────────────────────────────────────────────────────────
puppeteer.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: process.env.TWOCAPTCHA_KEY },
    visualFeedback: false,   // if you want to see green/red checkboxes around solved CAPTCHAs
  })
)

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
  // ────────────────────────────────────────────────────────────────────────────
  // 1) “Constants” and command-line parsing
  // ────────────────────────────────────────────────────────────────────────────
  const SRI_PAGE_URL = 
    'https://appscvsgen.supercias.gob.ec/consultaCompanias/societario/busquedaCompanias.jsf'

  if (process.argv.length < 3) {
    console.error('Usage: node index.js <cédula>')
    process.exit(1)
  }
  const CEDULA = process.argv[2].trim()

  // ────────────────────────────────────────────────────────────────────────────
  // 2) Launch Puppeteer (fresh browser, no prior cookies or state)
  // ────────────────────────────────────────────────────────────────────────────
  //console.log('🚀 Launching browser…')
  const browser = await puppeteer.launch({
    headless: true,              // set true if you do not need to watch the browser
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })
  const [page] = await browser.pages()

  // ────────────────────────────────────────────────────────────────────────────
  // 3) Navigate to SRI page, then immediately clear any existing cookies/storage
  // ────────────────────────────────────────────────────────────────────────────
  //console.log('🌐 Navigating to SRI page…')
  await page.goto(SRI_PAGE_URL, {
    waitUntil: 'networkidle2',
    timeout:   120_000
  })

  // Click RUC
  await page.waitForSelector('label[for="frmBusquedaCompanias:tipoBusqueda:1"]', { visible: true });
  await page.click('label[for="frmBusquedaCompanias:tipoBusqueda:1"]');


  // Espera a que aparezca el input


  const inputSel = 'input#frmBusquedaCompanias\\:parametroBusqueda_input';

  await new Promise(res => setTimeout(res, 2000));
  // 1) Espera y enfoca
  const input = await page.waitForSelector(inputSel, { visible: true });
  
  // 2) Triple-click para seleccionar TODO el valor
  await input.click({ clickCount: 3 });
  
  // 3) Borra
  await input.press('Backspace');
  
  // 4) Escribe despacio
  await input.type(CEDULA, { delay: 100 });
  
  // 2) Esperar a que salga al menos un ítem y seleccionarlo con flecha + Enter
  await page.waitForSelector('.ui-autocomplete-item', { visible: true, timeout: 5000 });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  


    // ─────────────────────────────────────────────
  // 2) CAPTCHA “No soy un robot” (PrimeFaces)
  // ─────────────────────────────────────────────
  
  // 2.1 Espera a que aparezca la imagen del CAPTCHA
  await page.waitForSelector('img#frmBusquedaCompanias\\:captchaImage', {
    visible: true,
    timeout: 10_000
  });
  
  // 2.2 Obtén el base64 de la imagen usando fetch + FileReader
  const base64img = await page.evaluate(async () => {
    const img = document.querySelector('img#frmBusquedaCompanias\\:captchaImage');
    const res = await fetch(img.src);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result es algo como "data:image/png;base64,XXXXXXXX"
        resolve(reader.result.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  });
  
  
  // 2.3 Resuélvelo con 2Captcha (tu función solveCaptcha)
  const ca = await solveCaptcha(base64img);
  
  // 2.4 Escribe la respuesta en el input correspondiente
  const captchaInput = 'input#frmBusquedaCompanias\\:captcha';
  await page.waitForSelector(captchaInput, { visible: true });
  await page.click(captchaInput, { clickCount: 3 });   // selecciona todo
  await page.type(captchaInput, ca, { delay: 50 });
  

  const xpath = "//button[@type='submit' and .//span[normalize-space(text())='Consultar']]";
  
  // (2) Espera hasta que aparezca en el DOM
  await page.waitForFunction(
    xp => !!document
      .evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue,
    { timeout: 10_000 },
    xpath
  );
  
  // (3) Haz click directamente vía evaluate
  await page.evaluate(xp => {
    const btn = document
      .evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue;
    if (!btn) throw new Error("¡Botón “Consultar” no encontrado dentro de page.evaluate!");
    btn.click();
  }, xpath);

  // 1) Espera a que los menús estén renderizados
  await page.waitForSelector('span.ui-menuitem-text', { visible: true, timeout: 10_000 });
  
  // 2) Haz click en “Consulta de cumplimiento” vía evaluate
  await page.evaluate(() => {
    // Busca todos los spans de menú
    const spans = Array.from(document.querySelectorAll('span.ui-menuitem-text'));
    // Filtra el que tenga exactamente el texto deseado
    const target = spans.find(s => s.textContent.trim() === 'Consulta de cumplimiento');
    if (!target) {
      throw new Error('❌ No encontré el ítem de menú "Consulta de cumplimiento"');
    }
    // Sube hasta el <a> contenedor y clickea
    const link = target.closest('a');
    if (!link) {
      throw new Error('❌ El <span> encontrado no está dentro de un <a>');
    }
    link.click();
  });

  try {
    // 1) Espera cortita para ver si aparece el segundo captcha
    const captcha2ImgSel = 'img#frmCaptcha\\:captchaImage';
    await page.waitForSelector(captcha2ImgSel, { visible: true, timeout: 5_000 });
  
    // 2) Sácale el base64
    const base64img2 = await page.evaluate(async sel => {
      const img = document.querySelector(sel);
      const res = await fetch(img.src);
      const blob = await res.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }, captcha2ImgSel);
  
    // 3) Llama a tu solver
    const ca2 = await solveCaptcha(base64img2);
  
    // 4) Escribe la respuesta
    const captcha2Input = 'input#frmCaptcha\\:captcha';
    await page.waitForSelector(captcha2Input, { visible: true });
    await page.click(captcha2Input, { clickCount: 3 });
    await page.keyboard.type(ca2, { delay: 50 });
  
    // 5) Haz click en “Verificar” (XPath porque no podemos usar :contains en CSS)
  // 5) Haz click en “Verificar” buscándolo por su texto
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.trim().includes('Verificar')
      );
      if (!btn) throw new Error("No encontré el botón Verificar");
      btn.click();
    });
    
  
  } catch (err) {
    if (err.name === 'TimeoutError') {
    } else {
      throw err;  // cualquier otro error lo propago
    }
  }

  // ────────────────────────────────────────────────
// 7) Leer texto de “Cumplimiento de obligaciones”
// ────────────────────────────────────────────────
  const cumplimientoSel = 'label#frmInformacionCompanias\\:j_idt890';
  await page.waitForSelector(cumplimientoSel, { visible: true, timeout: 10_000 });
  const cumplimiento = await page.$eval(cumplimientoSel, el => el.innerText.trim());
  console.log( cumplimiento);
  
  await new Promise(res => setTimeout(res, 2000));
  const outDir = path.resolve(__dirname, '..', 'evidencia');
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `${CEDULA}_CCO.png`;
  const filepath = path.join(outDir, filename);
  // justo antes del screenshot, redefine la viewport

  await new Promise(res => setTimeout(res, 500));  // ½ seg para renderizar

  await page.evaluate(() => {
    // ajusta el selector al contenedor que tú ves en DevTools
    const panel = document.querySelector('div#panelDerecho .ui-layout-unit-content');
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  });
  
  // 2) otra pausa corta para que pinte el contenido nuevo
  await new Promise(res => setTimeout(res, 500));
  
  // 3) toma el screenshot de la página entera o sólo del panel
  // a) screenshot fullPage
  await page.screenshot({ path: filepath, fullPage: true });

    
    
  
    // ────────────────────────────────────────────────────────────────────────────
    // 10) Print exactly “Si” or “No” (nothing else) and close the browser
    // ────────────────────────────────────────────────────────────────────────────
  await browser.close()
  process.exit(0)
 
   
})()