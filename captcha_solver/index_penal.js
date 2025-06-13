// antecedentes_puppeteer_hcaptcha_fixed.js
//
// Uso:
//    node antecedentes_puppeteer_hcaptcha_fixed.js <CEDULA>
// Ejemplo:
//    node antecedentes_puppeteer_hcaptcha_fixed.js 1309022935
//
// Asegúrate de tener en .env:
//    TWOCAPTCHA_KEY=TU_API_KEY_2CAPTCHA
//
// Librerías necesarias:
//    npm install puppeteer-extra puppeteer-extra-plugin-recaptcha node-fetch dotenv

require("dotenv").config();
const puppeteer     = require("puppeteer-extra");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const fetch         = require("node-fetch"); // v2
const fs            = require("fs");
const path          = require("path");

const API_KEY = process.env.TWOCAPTCHA_KEY;
if (!API_KEY) {
  console.error("❌ Debes definir TWOCAPTCHA_KEY en tu .env");
  process.exit(1);
}

// Para capturas de pantalla en modo depuración (activar DEPURAR=1 en variables de entorno)
const DEPURAR = process.env.DEPURAR === "1";
async function snap(page, label) {
  if (!DEPURAR) return;
  const carpeta = path.join(__dirname, "debug_screenshots");
  await fs.promises.mkdir(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${Date.now()}_${label}.png`);
  await page.screenshot({ path: archivo, fullPage: true });
  console.log(`🖼️ Screenshot guardado: ${archivo}`);
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Uso: node antecedentes_puppeteer_hcaptcha_fixed.js <CEDULA>");
    process.exit(1);
  }
  const CEDULA = process.argv[2].trim();
  const PAGE_URL = "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/";

  // 1) Iniciar Puppeteer-extra
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const [page] = await browser.pages();

  // 2) Ir a la página principal
  console.log("🔎 Navegando a la página principal de Antecedentes…");
  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise(r => setTimeout(r, 1000));  // <--- Reemplazo aquí
  await snap(page, "antes-gate");

  // 3) Esperar al <iframe id="main-iframe"> (Incapsula gate)
  console.log("⏳ Buscando iframe#main-iframe (Incapsula)…");
  let outerHandle;
  try {
    outerHandle = await page.waitForSelector("iframe#main-iframe", { timeout: 15000 });
  } catch {
    console.error("❌ No apareció el iframe#main-iframe. Quizá el gate ya no está activo.");
    await browser.close();
    process.exit(1);
  }

  // 4) Obtener contentFrame() del iframe
  const incapsulaFrame = await outerHandle.contentFrame();
  if (!incapsulaFrame) {
    console.error("❌ No pude acceder a contentFrame() del iframe Incapsula.");
    await browser.close();
    process.exit(1);
  }

  // 5) Dentro del incapsulaFrame, esperar el <div class="h-captcha" data-sitekey="...">
  console.log("🔑 Buscando div.h-captcha[data-sitekey]…");
  let sitekey;
  try {
    await incapsulaFrame.waitForSelector("div.h-captcha[data-sitekey]", { timeout: 15000 });
    sitekey = await incapsulaFrame.$eval("div.h-captcha[data-sitekey]", el => el.getAttribute("data-sitekey"));
    console.log("✅ hCaptcha sitekey =", sitekey);
  } catch {
    console.error("❌ No encontré el div.h-captcha con data-sitekey en 15 s.");
    await browser.close();
    process.exit(1);
  }

  // 6) Esperar a que el iframe de hCaptcha esté cargado
  console.log("⏳ Esperando a que el <iframe> de hCaptcha esté listo…");
  try {
    await incapsulaFrame.waitForSelector("div.h-captcha iframe", { visible: true, timeout: 10000 });
    console.log("✅ El iframe de hCaptcha está visible en el DOM.");
  } catch {
    console.error("❌ El <iframe> de hCaptcha NO apareció dentro de la div.h-captcha.");
    await browser.close();
    process.exit(1);
  }

  // 7) Enviar sitekey + pageurl a 2Captcha
  console.log("📡 Enviando sitekey y pageUrl a 2Captcha…");
  let inJSON;
  try {
    const respIn = await fetch(
      `https://2captcha.com/in.php?key=${API_KEY}` +
      `&method=hcaptcha&sitekey=${encodeURIComponent(sitekey)}` +
      `&pageurl=${encodeURIComponent(PAGE_URL)}&json=1`
    );
    inJSON = await respIn.json();
  } catch (err) {
    console.error("❌ Error de red al enviar a 2Captcha:", err);
    await browser.close();
    process.exit(1);
  }
  if (!inJSON || inJSON.status !== 1) {
    console.error("❌ 2Captcha devolvió error al enviar:", inJSON);
    await browser.close();
    process.exit(1);
  }
  const captchaId = inJSON.request;
  console.log("🆔 2Captcha returned captchaId =", captchaId);

  // 8) Polling a 2Captcha hasta 120 s
  console.log("⏳ Esperando a que 2Captcha resuelva (máx ~120 s)…");
  let token = null;
  for (let i = 1; i <= 24; i++) {
    await new Promise(r => setTimeout(r, 5000));  // <--- Reemplazo aquí
    let resJSON = null;
    try {
      const respRes = await fetch(
        `https://2captcha.com/res.php?key=${API_KEY}&action=get&id=${captchaId}&json=1`
      );
      resJSON = await respRes.json();
    } catch (err) {
      console.warn(`⚠️ [Intento ${i}] Error al poll a 2Captcha:`, err);
      continue;
    }
    if (!resJSON) {
      console.warn(`⚠️ [Intento ${i}] 2Captcha devolvió JSON vacío`);
      continue;
    }
    if (resJSON.status === 0 && resJSON.request === "CAPCHA_NOT_READY") {
      console.log(`   → Todavía no está listo (${i}/24)…`);
      continue;
    }
    if (resJSON.status === 1) {
      token = resJSON.request;
      console.log("✅ Token de hCaptcha recibido:", token);
      break;
    }
    console.error(`❌ [Intento ${i}] 2Captcha devolvió error:`, resJSON);
    break;
  }
  if (!token) {
    console.error("❌ Timeout esperando token de hCaptcha. Saliendo.");
    await browser.close();
    process.exit(1);
  }

  // 9) Inyectar token en textarea[name="h-captcha-response"] dentro del incapsulaFrame
  console.log("✍️ Inyectando token en textarea[name='h-captcha-response']…");
  await incapsulaFrame.evaluate(resolvedToken => {
    let ta = document.querySelector("textarea[name='h-captcha-response']");
    if (!ta) {
      ta = document.createElement("textarea");
      ta.name = "h-captcha-response";
      ta.style.display = "none";
      document.body.appendChild(ta);
    }
    ta.value = resolvedToken;
    ta.innerText = resolvedToken;
    ta.dispatchEvent(new Event("change", { bubbles: true }));
  }, token);

  // 10) Click en el checkbox de hCaptcha / ejecutar hcaptcha.execute()
  console.log("🖱️ Haciendo click en el checkbox de hCaptcha o invocando hcaptcha.execute()");
  try {
    await incapsulaFrame.click("div.h-captcha", { force: true });
  } catch {
    console.warn("⚠️ No pude hacer click directo en div.h-captcha. Intento hcaptcha.execute().");
  }
  await incapsulaFrame.evaluate(() => {
    if (window.hcaptcha && typeof window.hcaptcha.execute === "function") {
      try { window.hcaptcha.execute(); } catch (_) { }
    }
  });

  // 11) Esperar a que el gate de Incapsula desaparezca (iframe#main-iframe oculto)
  console.log("⏳ Esperando a que desaparezca iframe#main-iframe (gate)...");
  try {
    await page.waitForSelector("iframe#main-iframe", { hidden: true, timeout: 180000 });
    console.log("✅ El iframe#main-iframe ya no está visible.");
  } catch {
    console.error("❌ Timeout esperando a que desaparezca iframe#main-iframe.");
    await browser.close();
    process.exit(1);
  }
  await snap(page, "gate-desbloqueado");

  // 12) Clicar “Aceptar” (si existe)
  console.log("🔲 Buscando botón “Aceptar” y haciendo click si aparece…");
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(b => b.innerText.trim() === "Aceptar"),
      { timeout: 10000 }
    );
    const botones = await page.$$("button");
    for (const btn of botones) {
      const txt = await page.evaluate(e => e.innerText.trim(), btn);
      if (txt === "Aceptar") {
        await btn.click({ force: true });
        console.log("✅ Hice click en “Aceptar”.");
        break;
      }
    }
    // Pequeña pausa para que desaparezca el modal
    await new Promise(r => setTimeout(r, 500));  // <--- Reemplazo aquí
  } catch {
    console.log("ℹ️ No apareció diálogo de Términos, se omite “Aceptar”.");
  }
  await snap(page, "después-aceptar");

  // 13) Limpiar cookies / localStorage
  await page.evaluate(() => {
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // 14) Rellenar campo “Número de Documento” (cédula)
  console.log("✍️ Rellenando Cédula…");
  await page.waitForSelector('input[name="cedula"], input[id="cedula"], input[type="text"]', {
    visible: true,
    timeout: 30000
  });
  const inputCedula = await page.$('input[name="cedula"], input[id="cedula"], input[type="text"]');
  await inputCedula.click({ force: true });
  await inputCedula.type(CEDULA, { delay: 100 });

  // 15) Deshabilitar pointer-events sobre un posible reCAPTCHA
  await page.addStyleTag({
    content: `iframe[title*="reCAPTCHA"] { pointer-events: none !important; }`
  });

  // 16) Pulsar botón “Consultar” / “Siguiente”
  console.log("🖱️ Buscando botón “Consultar” o “Siguiente” (Paso 1)…");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some(b => {
      const t = b.innerText.trim();
      return t === "Consultar" || t === "Siguiente";
    }),
    { timeout: 15000 }
  );
  let btnPaso1 = null;
  for (const btn of await page.$$("button")) {
    const t = await page.evaluate(e => e.innerText.trim(), btn);
    if (t === "Consultar" || t === "Siguiente") {
      btnPaso1 = btn;
      break;
    }
  }
  if (!btnPaso1) {
    console.error("❌ No pude encontrar el botón “Consultar”/“Siguiente” en el paso 1.");
    await browser.close();
    process.exit(1);
  }
  await btnPaso1.click({ force: true });
  console.log("✅ Clic en Paso 1 (“Consultar”/“Siguiente”).");
  await new Promise(r => setTimeout(r, 500));  // <--- Reemplazo aquí

  // 17) Resolver reCAPTCHA de Paso 1 (si aparece)
  const iframeRec1 = await page.$('iframe[src*="api2/anchor"], iframe[src*="api2/bframe"]');
  if (iframeRec1) {
    console.log("🤖 Resolviendo reCAPTCHA invisible de Paso 1…");
    const { solved, error } = await page.solveRecaptchas();
    if (error) console.warn("⚠️ Error al resolver reCAPTCHA paso 1:", error);
    console.log("✔️ reCAPTCHA paso 1 solucionado:", solved);
  } else {
    console.log("ℹ️ No apareció reCAPTCHA invisible en Paso 1.");
  }

  // 18) Rellenar “Motivo de Consulta” (textarea)
  console.log("✍️ Rellenando textarea “Motivo de Consulta”…");
  await page.waitForSelector("textarea", { visible: true, timeout: 30000 });
  const textarea = await page.$("textarea");
  await textarea.click({ force: true });
  await textarea.type("Chequeo para UFA", { delay: 50 });
  await new Promise(r => setTimeout(r, 300));  // <--- Reemplazo aquí

  // 19) Limpiar cookies/localStorage otra vez
  await page.evaluate(() => {
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // 20) Deshabilitar pointer-events sobre reCAPTCHA en Paso 2
  await page.addStyleTag({
    content: `iframe[title*="reCAPTCHA"] { pointer-events: none !important; }`
  });

  // 21) Pulsar “Visualizar Certificado” / “Generar Certificado” / “Siguiente” (Paso 2)
  console.log("🖱️ Buscando botón “Visualizar Certificado” o “Siguiente” (Paso 2)…");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some(b => {
      const t = b.innerText.trim();
      return t === "Visualizar Certificado" || t === "Siguiente" || t === "Generar Certificado";
    }),
    { timeout: 15000 }
  );
  let btnPaso2 = null;
  for (const btn of await page.$$("button")) {
    const t = await page.evaluate(e => e.innerText.trim(), btn);
    if (t === "Visualizar Certificado" || t === "Siguiente" || t === "Generar Certificado") {
      btnPaso2 = btn;
      break;
    }
  }
  if (!btnPaso2) {
    console.error("❌ No pude encontrar el botón “Visualizar Certificado”/“Siguiente” en el paso 2.");
    await browser.close();
    process.exit(1);
  }
  await btnPaso2.click({ force: true });
  console.log("✅ Clic en Paso 2 (“Visualizar Certificado”/“Siguiente”).");
  await new Promise(r => setTimeout(r, 500));  // <--- Reemplazo aquí

  // 22) Resolver reCAPTCHA de Paso 2 (si aparece)
  const iframeRec2 = await page.$('iframe[src*="api2/anchor"], iframe[src*="api2/bframe"]');
  if (iframeRec2) {
    console.log("🤖 Resolviendo reCAPTCHA invisible de Paso 2…");
    const { solved, error } = await page.solveRecaptchas();
    if (error) console.warn("⚠️ Error al resolver reCAPTCHA paso 2:", error);
    console.log("✔️ reCAPTCHA paso 2 solucionado:", solved);
  } else {
    console.log("ℹ️ No apareció reCAPTCHA invisible en Paso 2.");
  }

  // 23) Esperar a que aparezca el texto “Posee Antecedentes” en pantalla
  console.log("⏳ Esperando el resultado final “Posee Antecedentes”…");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("div, span, b")).some(el => {
      return el.innerText.trim().startsWith("Posee Antecedentes");
    }),
    { timeout: 30000 }
  );
  const textoFinal = await page.evaluate(() => {
    const nodos = Array.from(document.querySelectorAll("div, span, b"));
    for (const el of nodos) {
      const t = el.innerText.trim();
      if (t.startsWith("Posee Antecedentes")) {
        return t;
      }
    }
    return "";
  });

  let resultado = "No";
  if (textoFinal.toLowerCase().includes("sí")) resultado = "Si";
  console.log("🎯 Resultado final:", resultado);

  // 24) Cerrar navegador y salir
  await browser.close();
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error no controlado:", err);
  process.exit(1);
});
