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
    'https://appscvs1.supercias.gob.ec/consultaPersona/consulta_cia_param.zul'

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


  // //   //escribir usuario y contraseña
  // wait until *some* combobox text‐input appears
  await page.waitForSelector('input.z-combobox-inp', { visible: true });
  
  // type right into it
  await page.type('input.z-combobox-inp', CEDULA);
  
  
  // wait until the ZK button‐wrapper is ready in the DOM
  
  await new Promise(res => setTimeout(res, 1000));
  await page.waitForSelector('span.z-button', { visible: true, timeout: 15_000 });
  // click it
  await page.click('span.z-button');

  await new Promise(res => setTimeout(res, 5000));

  const bodies = await page.$$('div.z-listbox-body');
  if (bodies.length < 2) {
    console.log(JSON.stringify(["NO EXISTE INFORMACIÓN PARA ESTA CÉDULA"]));
    console.log(JSON.stringify(["NO EXISTE INFORMACIÓN PARA ESTA CÉDULA"]));
    // optionally screenshot here before exit…
    process.exit(0);
  }

//   const listboxes = await page.$$('div.z-listbox')
  const adminBody = bodies[0]
  let accionistaBody   = bodies[1]
//   const actBox    = listboxes[1]

  // ────────────────────────────────────────────────────────────────────────────
  // 6) Extract “Administración Actual en”
  // ────────────────────────────────────────────────────────────────────────────
  let administracion = await adminBody.$$eval(
    'tbody tr.z-listitem',
    trs => trs.map(tr => {
      const cols = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
      return { nombre: cols[1], cargo: cols[4] }
    })
  )

  if (administracion.length === 0) {
    administracion =[{"nombre":"No hay administracion actual","cargo":"No hay administracion actual"}]
  } 

 

  // after you've located `accionistaBody = bodies[1]`…

  // ─────────────────────────────────────────────
  // figure out how many pages the Accionista box has
  // ─────────────────────────────────────────────
  const pagerHandle = await accionistaBody.evaluateHandle(body => body.nextElementSibling);
  let totalPages = 1;
  if (pagerHandle) {
    totalPages = await pagerHandle.evaluate(p => {
      // pick out all the " / N" spans, take the last one
      const texts = Array.from(p.querySelectorAll('span.z-paging-text'))
                         .map(el => el.innerText.trim())
                         .filter(t => t.startsWith('/'));
      if (texts.length === 0) return 1;
      const m = texts[texts.length - 1].match(/\/\s*(\d+)/);
      return m ? parseInt(m[1], 10) : 1;
    });
  }
//   console.log(`↳ total accionista pages: ${totalPages}`);

  // ─────────────────────────────────────────────
  // now loop pages 1…totalPages
  // ─────────────────────────────────────────────
  let allAccionistas = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    // console.log(`→ Accionista page ${pageNum}`);
    // extract only ACTIVA rows
    const rows = await accionistaBody.$$eval('tbody tr.z-listitem', trs =>
      trs
        .map(tr => {
          const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
          return {
            nombre:           tds[1],
            capitalInvertido: tds[3],
            situacion:        tds[6].toUpperCase()
          };
        })
        .filter(r => r.situacion === 'ACTIVA')
        .map(({ nombre, capitalInvertido }) => ({ nombre, capitalInvertido }))
    );
    allAccionistas.push(...rows);

    const outDir = path.resolve(__dirname, '..', 'evidencia');
    fs.mkdirSync(outDir, { recursive: true });

    const filename = `${CEDULA}Supercias_personas_page${pageNum}.png`;
    const filepath = path.join(outDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    

    if (pageNum < totalPages) {
      // click the “next” button inside this pager
      const nextBtn = await accionistaBody.evaluateHandle(body => {
        const pager = body.nextElementSibling;
        return pager.querySelector('button.z-paging-next:not([disabled])');
      });
      if (!nextBtn) {
        console.warn('↳ no next-page button found, stopping early');
        break;
      }
      await new Promise(r => setTimeout(r, 800));
      await nextBtn.click();
      // allow ZK to re-render
      await new Promise(r => setTimeout(r, 800));
      // re-grab the Accionistas listbox body, since the DOM was replaced
      const newBodies = await page.$$('div.z-listbox-body');
      accionistaBody = newBodies[1];
    }
  }

if (allAccionistas.length === 0) {
    allAccionistas = [{"nombre":"No tiene acciones activas","capitalInvertido":"No tiene acciones activas"}];
  }

console.log(JSON.stringify(administracion));
console.log( JSON.stringify(allAccionistas));



  // ────────────────────────────────────────────────────────────────────────────
  // 9) Tear down
  // ────────────────────────────────────────────────────────────────────────────
  await browser.close()
  process.exit(0)
})()