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
    'https://srienlinea.sri.gob.ec/' +
    'sri-en-linea/SriPagosWeb/ConsultaDeudasFirmesImpugnadas/Consultas/' +
    'consultaDeudasFirmesImpugnadas'

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

  // Immediately wipe out all cookies + localStorage + sessionStorage
  // so that SRI definitely issues a fresh reCAPTCHA
  await page.evaluate(() => {
    document.cookie
      .split(';')
      .forEach(cookie => {
        const name = cookie.split('=')[0].trim()
        // Overwrite the cookie with an “expires” in the past
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`
      })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  // ────────────────────────────────────────────────────────────────────────────
  // 4) Type the cédula into the #busquedaRucId input
  // ────────────────────────────────────────────────────────────────────────────
  //console.log(`✍️  Typing cédula: ${CEDULA}`)
  await page.waitForSelector('#busquedaRucId', { visible: true, timeout: 30_000 })
  await page.click('#busquedaRucId')
  await page.keyboard.type(CEDULA)

  // Give the page a moment so that its own JavaScript “validates” the cédula
  // and reveals the “Consultar” button.
  await new Promise(res => setTimeout(res, 3000));

  // ────────────────────────────────────────────────────────────────────────────
  // 5) Inject CSS that disables pointer‐events on *any* reCAPTCHA iframe
  //    → This ensures our click on “Consultar” does not accidentally land on
  //      the invisible reCAPTCHA checkbox, but on the button instead.
  // ────────────────────────────────────────────────────────────────────────────
  await page.addStyleTag({
    content: `iframe[title*="reCAPTCHA"] { pointer-events: none !important; }`
  })

  // ────────────────────────────────────────────────────────────────────────────
  // 6) Wait up to 15s for a <button> whose text is exactly “Consultar”.
  //    Then grab that buttonHandle and click it.  (That click will trigger the
  //    Invisible reCAPTCHA to pop up in the background.)
  // ────────────────────────────────────────────────────────────────────────────
  //console.log('⏳ Waiting up to 15s for the “Consultar” button to appear…')
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

  // ────────────────────────────────────────────────────────────────────────────
  // 7) Wait up to 10s for the Invisible reCaptcha <iframe> to appear in the DOM.
  //    If it never appears, we skip straight to “No” (no debts).
  // ────────────────────────────────────────────────────────────────────────────
  let solved = [], error = null, codes = null
  try {
    //console.log('⏳ Waiting up to 10s for reCAPTCHA iframe to appear…')
    await page.waitForSelector(
      'iframe[src*="api2/bframe"]',   // Google’s Invisible-reCAPTCHA “challenge” iframe lives here
      { timeout: 10_000 }
    )
  } catch {
    // If no iframe appears at all, the site may have skipped the CAPTCHA because
    // it already knows your session or because “no hay deudas” can be returned
    // without a challenge.  In that case, `solved.length` will stay at 0.
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 8) If we did see a reCAPTCHA iframe, call page.solveRecaptchas() to let the plugin do its work.
  //    Do a quick “retry once” if the first call returns solved.length===0.
  // ────────────────────────────────────────────────────────────────────────────
  if (await page.$('iframe[src*="api2/bframe"]') !== null) {
    //console.log('🤖 Solving reCAPTCHA now…')
    let result = await page.solveRecaptchas()
    solved = result.solved || []
    error  = result.error  || null
    codes  = result.codes  || null

    // If the plugin did not return any “solved” entries, maybe the iframe
    // had not fully loaded its internals yet—so we wait 1s and retry:
    if (solved.length === 0) {
      //console.log('⏳ First attempt returned no solved entries—waiting 1s & retrying…')
      await new Promise(res => setTimeout(res, 1000));
      const retryResult = await page.solveRecaptchas()
      solved = retryResult.solved || []
      error  = retryResult.error  || null
      codes  = retryResult.codes  || null
    }

    //console.log('✔️ solved:', solved)
    if (error) console.error('❌ plugin error:', error)
    if (codes) console.log('🔑 raw codes:', codes)
  } else {
    // If no reCAPTCHA iframe ever showed up, we can skip solveRecaptchas() entirely.
    // console.log('ℹ️ No reCAPTCHA iframe found—skipping page.solveRecaptchas()')
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9) Finally: Determine whether “Ver detalle” (i.e. “Sí, hay deudas”) appears.
  //    * If we actually solved at least one reCAPTCHA, wait up to 10s for “Ver detalle.”
  //    * If solved.length===0 (no CAPTCHA saw), that means “No” immediately.
  // ────────────────────────────────────────────────────────────────────────────
  let deuda = 'No'
  if (solved.length > 0) {
    // console.log('🔍 Waiting up to 10s for the “Ver detalle” button…')
    try {
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('button'))
                  .some(b => b.innerText.trim() === 'Ver detalle'),
        { timeout: 10_000 }
      )
      deuda = 'Si'
    } catch {
      deuda = 'No'
    }
  } else {
    // No CAPTCHA was shown (solved.length===0) ⇒ immediately “No” debts
    deuda = 'error'
  }

  await new Promise(res => setTimeout(res, 4000));
  if (deuda === 'Si') {
    const outDir = path.resolve(__dirname, '..', 'evidencia');
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `${CEDULA}_sri_deuda.png`;
    const filepath = path.join(outDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 10) Print exactly “Si” or “No” (nothing else) and close the browser
  // ────────────────────────────────────────────────────────────────────────────
  console.log(deuda)
  await browser.close()
  process.exit(0)
})()
