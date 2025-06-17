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

;(async () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1) “Constants” and command-line parsing
  // ────────────────────────────────────────────────────────────────────────────
  const SRI_PAGE_URL = 
    'https://sanctionssearch.ofac.treas.gov/'

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

    const idSel = '#ctl00_MainContent_txtID'
  await page.waitForSelector(idSel, { visible: true })

  // 3) Rellena los campos que quieras. En este ejemplo solo pongo el ID,
  //    pero podrías rellenar Name, Address, City, Country, etc. de la misma manera:

  // ID # / Digital Currency Address
  await page.click(idSel, { clickCount: 3 })
  await page.type(idSel, CEDULA)  

  const searchBtn = '#ctl00_MainContent_btnSearch'
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click(searchBtn),
  ])



  // 2) Ahora espero o bien filas o bien el mensaje de “no results”
  const rowSel   = '#gvSearchResults tbody tr';
  const errorSel = 'span.errormessage'; // coincide con <span id="ctl00_MainContent_lblMessage" class="errormessage">
  
  let outcome;
  try {
    outcome = await Promise.race([
      // si sale esto, hay al menos una fila
      page.waitForSelector(rowSel,   { visible: true, timeout: 5000 }).then(() => 'OK'),
      // si sale esto, es el mensaje de “no results”
      page.waitForSelector(errorSel, { visible: true, timeout: 5000 }).then(() => 'EMPTY'),
    ]);
  } catch (e) {
    throw new Error('Ni filas ni mensaje de “no results” aparecieron tras la búsqueda');
  }
  
  // 3) Si vino "EMPTY", no hay resultados
  if (outcome === 'EMPTY') {
    const outDir = path.resolve(__dirname, '..', 'evidencia');
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `${CEDULA}_OFAC.png`;
    const filepath = path.join(outDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });  
    console.log('SIN RESULTADOS');
    process.exit(0);
  }
  
  // 4) Si vino "OK", recojo la columna de Program(s) de cada fila
  const programs = await page.$$eval(rowSel, rows =>
    rows.map(tr => {
      // la columna Program(s) es la 4ª <td>
      const td = tr.querySelector('td:nth-child(4)');
      return td ? td.innerText.trim() : '';
    })
  );
  
  // 5) Muestro por consola
  if (programs.length === 0) {
    console.log('SIN RESULTADOS');
  } else {
    console.log( programs);
  }


  const outDir = path.resolve(__dirname, '..', 'evidencia');
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `${CEDULA}_OFAC.png`;
  const filepath = path.join(outDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  
  
  await browser.close()
  process.exit(0)
})()