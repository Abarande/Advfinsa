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
    'https://srienlinea.sri.gob.ec/sri-en-linea/SriDeclaracionesWeb/ConsultaImpuestoRenta/Consultas/consultaImpuestoRenta'

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



  //escribir usuario y contraseña
  await page.click('input#usuario')
  await page.keyboard.type(process.env.UsuarioSRI)


  await page.click('input#password')
  await page.keyboard.type(process.env.SRIPass)

  //click en el boton de ingresar
  await page.click('input#kc-login');




  //Type the cédula into the #busquedaRucId input

  await page.waitForSelector('#busquedaRucId', { visible: true, timeout: 30_000 })
  await page.click('#busquedaRucId')
  await page.keyboard.type(CEDULA)

//   // Give the page a moment so that its own JavaScript “validates” the cédula
//   // and reveals the “Consultar” button.
  await new Promise(res => setTimeout(res, 3000));

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button'))
              .some(b => b.innerText.trim() === 'Consultar'),
    { timeout: 15_000 }
  )

  const buttons = await page.$$('button')
  let consultHandle = null
  for (const btn of buttons) {
    const txt = await page.evaluate(el => el.innerText.trim(), btn)
    if (txt === 'Consultar') {
      consultHandle = btn
      break
    }
  }
  if (!consultHandle) {
    throw new Error('❌ Could not find the “Consultar” button!')
  }

  //console.log('🖱️ Clicking “Consultar” → triggers Invisible reCAPTCHA…')
  await consultHandle.click({ force: true })


 await new Promise(res => setTimeout(res, 1000));
 
 // 1) Esperar a que la tabla esté lista
  await page.waitForSelector('table tbody tr', { visible: true, timeout: 10_000 });
  
  // 2) Año anterior
  // 1) Calcula el año anterior
  const now = new Date();
  const prevYear = now.getFullYear() - 1;
  
  // 2) Ejecuta la evaluación en el navegador
  const valorAnterior = await page.evaluate(year => {
    // Recojo todas las filas
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.innerText.trim());
      if (cells.length < 3) continue;              // descartamos filas raras
      const textYear = cells[0];
      if (Number(textYear) === year) {
        const mensaje = cells[2];                  // aquí está tu texto
        return `${textYear}: ${mensaje}`;          // devuelvo: "2024: * La Declaración..."
      }
    }
    return null;
  }, prevYear);
  
  // 3) Muéstralo en Node
  if (valorAnterior) {
    console.log(`${valorAnterior}`);
  } else {
    console.log(`⚠️ No encontré valor para el año ${prevYear}`);
  }


  const outDir = path.resolve(__dirname, '..', 'evidencia');
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `${CEDULA}_impuesto_renta.png`;
  const filepath = path.join(outDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });


  await browser.close()
  process.exit(0)
})()
