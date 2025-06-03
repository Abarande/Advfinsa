// // index_hcaptcha.js
// //
// // Usage: 
// //    node index_hcaptcha.js
// //
// // This script demonstrates solving a front‐page hCaptcha (inside an Incapsula gate)
// // before proceeding to fill out the “Antecedentes Penales” form.

// // solve_hcaptcha_manual.js
// //
// // This script _only_ passes the front‐page hCaptcha on:
// // https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/
// //
// // Usage:
// //   node solve_hcaptcha_manual.js
// //
// // Make sure your .env contains:
// //   TWOCAPTCHA_KEY=your_2captcha_api_key
// //

// require("dotenv").config();
// const puppeteer = require("puppeteer");
// const fetch     = require("node-fetch"); // v2

// const API_KEY   = process.env.TWOCAPTCHA_KEY;
// if (!API_KEY) {
//   console.error("❌ Please set TWOCAPTCHA_KEY in your .env");
//   process.exit(1);
// }

// ;(async () => {
//   const PAGE_URL = "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/";

//   console.log("🚀 Launching browser…");
//   const browser = await puppeteer.launch({
//     headless: false,
//     ignoreHTTPSErrors: true,
//     args: ["--no-sandbox", "--disable-setuid-sandbox"]
//   });
//   const [ page ] = await browser.pages();

//   // ────────────────────────────────────────────────────────────────────
//   // 1) Navigate to the “Antecedentes Penales” page (Imperva gate)
//   // ────────────────────────────────────────────────────────────────────
//   console.log("🌐 Navigating to the Antecedentes URL…");
//   await page.goto(PAGE_URL, {
//     waitUntil: "networkidle2",
//     timeout: 120_000
//   });

//   // ────────────────────────────────────────────────────────────────────
//   // 2) Wait for Imperva/Incapsula gate’s <iframe id="main-iframe">
//   // ────────────────────────────────────────────────────────────────────
//   let outerHandle;
//   try {
//     outerHandle = await page.waitForSelector("iframe#main-iframe", { timeout: 15_000 });
//     console.log("✅ Found the Incapsula gate iframe (#main-iframe).");
//   } catch {
//     console.error("❌ Timeout: did not see Incapsula “main-iframe”. Exiting.");
//     await browser.close();
//     process.exit(1);
//   }

//   // ────────────────────────────────────────────────────────────────────
//   // 3) Enter that gate’s iframe
//   // ────────────────────────────────────────────────────────────────────
//   const incapsulaFrame = await outerHandle.contentFrame();
//   if (!incapsulaFrame) {
//     console.error("❌ Could not access contentFrame() for Incapsula gate.");
//     await browser.close();
//     process.exit(1);
//   }

//   // ────────────────────────────────────────────────────────────────────
//   // 4) Inside incapsulaFrame, wait for <div class="h-captcha" data-sitekey="…">
//   // ────────────────────────────────────────────────────────────────────
//   let sitekey = null;
//   try {
//     await incapsulaFrame.waitForSelector("div.h-captcha[data-sitekey]", { timeout: 15_000 });
//     sitekey = await incapsulaFrame.$eval("div.h-captcha[data-sitekey]", el => el.getAttribute("data-sitekey"));
//     console.log("🔑 hCaptcha sitekey =", sitekey);
//   } catch {
//     console.error("❌ Could not find <div class=\"h-captcha\" data-sitekey> in 15s. Exiting.");
//     await browser.close();
//     process.exit(1);
//   }

//   // Confirm the <iframe> is present (child of that div), so that hCaptcha is fully loaded.
//   // Sometimes the <div> exists but the <iframe> hasn’t yet attached.
//   try {
//     await incapsulaFrame.waitForSelector("div.h-captcha iframe", {
//       visible: true,
//       timeout: 10_000
//     });
//     console.log("✅ hCaptcha iframe is visible inside that <div>.");
//   } catch {
//     console.error("❌ The hCaptcha <iframe> did not appear inside the <div>. Exiting.");
//     await browser.close();
//     process.exit(1);
//   }

//   // ────────────────────────────────────────────────────────────────────
//   // 5) Send sitekey + page URL to 2Captcha (method=hcaptcha)
//   // ────────────────────────────────────────────────────────────────────
//   console.log("📡 Submitting to 2Captcha…");
//   let inResultRaw;
//   try {
//     const inResponse = await fetch(
//       `http://2captcha.com/in.php?key=${API_KEY}` +
//       `&method=hcaptcha&sitekey=${encodeURIComponent(sitekey)}` +
//       `&pageurl=${encodeURIComponent(PAGE_URL)}&json=1`
//     );
//     inResultRaw = await inResponse.json();
//   } catch (err) {
//     console.error("❌ Network error while sending to 2Captcha:", err);
//     await browser.close();
//     process.exit(1);
//   }

//   if (!inResultRaw || inResultRaw.status !== 1) {
//     console.error("❌ 2Captcha API returned an error at submission:", inResultRaw);
//     await browser.close();
//     process.exit(1);
//   }
//   const captchaId = inResultRaw.request;
//   console.log("✅ 2Captcha recognized request, captchaId =", captchaId);

//   // ────────────────────────────────────────────────────────────────────
//   // 6) Poll 2Captcha’s res.php every 5s (max ~24 attempts → ~120s total)
//   // ────────────────────────────────────────────────────────────────────
//   console.log("⏳ Waiting for 2Captcha to solve hCaptcha (up to ~120s) …");
//   let token = null;
//   for (let attempt = 1; attempt <= 24; attempt++) {
//     await new Promise(r => setTimeout(r, 5000));
//     let resJSON = null;
//     try {
//       const resResp = await fetch(
//         `http://2captcha.com/res.php?key=${API_KEY}` +
//         `&action=get&id=${captchaId}&json=1`
//       );
//       resJSON = await resResp.json();
//     } catch (err) {
//       console.warn(`⚠️ [Attempt ${attempt}] Error polling 2Captcha:`, err);
//       continue;
//     }

//     if (!resJSON) {
//       console.warn(`⚠️ [Attempt ${attempt}] Got empty JSON from 2Captcha.pub`);
//       continue;
//     }
//     if (resJSON.status === 0 && resJSON.request === "CAPCHA_NOT_READY") {
//       console.log(`   → Not ready yet (${attempt}/24)…`);
//       continue;
//     }
//     if (resJSON.status === 1) {
//       token = resJSON.request;
//       console.log("✅ Received solved hCaptcha token!");
//       break;
//     }
//     console.error(`❌ [Attempt ${attempt}] 2Captcha returned error:`, resJSON);
//     break;
//   }

//   if (!token) {
//     console.error("❌ Timed out waiting for hCaptcha token. Exiting.");
//     await browser.close();
//     process.exit(1);
//   }

//   // ────────────────────────────────────────────────────────────────────
//   // 7) Inject the token into <textarea name="h-captcha-response">
//   // ────────────────────────────────────────────────────────────────────
//   console.log("✍️ Injecting the hCaptcha solution into textarea...");
//   await incapsulaFrame.evaluate(tk => {
//     const ta = document.querySelector("textarea[name='h-captcha-response']");
//     if (ta) {
//       ta.value = tk;
//       ta.innerText = tk;
//       ta.dispatchEvent(new Event("change", { bubbles: true }));
//     }
//   }, token);

//   // Attempt to call hcaptcha.execute() in case the site relies on the JS callback:
//   try {
//     await incapsulaFrame.evaluate(() => {
//       if (window.hcaptcha && typeof window.hcaptcha.execute === "function") {
//         window.hcaptcha.execute();
//       }
//     });
//   } catch {
//     console.warn("⚠️ Could not call window.hcaptcha.execute(); maybe not present.");
//   }

//   // Wait a moment for Imperva/Incapsula to lift the gate
//   await new Promise(r => setTimeout(r, 2000));

//   console.log("🎉 Done solving hCaptcha. Imperva gate should now be lifted. Closing browser.");

  

// //   await browser.close();
// //   process.exit(0);
// })().catch(err => {
//   console.error("❌ Uncaught error:", err);
//   process.exit(1);
// });

// index_penal_full.js
//
// Usage:
//    node index_penal_full.js <CEDULA>
// Example:
//    node index_penal_full.js 0925647851
//
// This script only performs the front-page hCaptcha→Imperva solve. After
// the gate drops, it proceeds to click “Aceptar”, fill cédula, fill motivo, etc.
//
// Make sure your .env contains:
//    TWOCAPTCHA_KEY=your_2captcha_api_key
//


// index_penal_full.js
//
// Usage:
//    node index_penal_full.js <CEDULA>
// Example:
//    node index_penal_full.js 0925647851
//
// This script first solves the “I’m human” hCaptcha / Imperva gate. After
// the gate is dropped, it clicks “Aceptar”, fills the cédula, fills the motivo, etc.
//
// Make sure your .env contains:
//    TWOCAPTCHA_KEY=your_2captcha_api_key
//
// index_penal_full.js
//
// Usage:
//    node index_penal_full.js <CEDULA>
//
// This script WILL solve only the FRONT-PAGE hCaptcha
// (hosted behind Imperva/Incapsula) before proceeding to
// the rest of your form.
//
// Make sure you have these in your .env:
//    TWOCAPTCHA_KEY=your_2captcha_api_key
//

// index_penal_full.js
//
// This script “only” solves the front‐page hCaptcha (Imperva/Incapsula).
// Once that gate is dropped, it continues with clicking “Aceptar,” filling CÉDULA,
// solving any invisible reCAPTCHAs, filling “Motivo,” clicking “Visualizar,” and finally
// printing “Si” or “No” based on “Posee Antecedentes…”
//
// Usage:
//    node index_penal_full.js 0925647851
//
// Requirements:
//    • .env containing TWOCAPTCHA_KEY=your_2captcha_api_key
//    • npm install puppeteer node-fetch dotenv puppeteer-extra puppeteer-extra-plugin-recaptcha
//

require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const fs = require("fs");
const path = require("path");
puppeteer.use(
  RecaptchaPlugin({
    provider: { id: "2captcha", token: process.env.TWOCAPTCHA_KEY },
    visualFeedback: false,
  })
);

const debugShots = process.env.DEBUG_SHOTS === "1";
async function snap(page, label) {
  if (!debugShots) return;
  const dir = path.join(__dirname, "debug_screenshots");
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}_${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`🖼️ Saved screenshot: ${file}`);
}

// If you also want to automatically solve in‐page reCAPTCHAs, you can
// re‐add the puppeteer-extra recaptcha plugin here. For now, the code
// will call solveRecaptchas() later for those. If you have that plugin
// installed, you could uncomment the two lines below:
//
// const puppeteerExtra       = require("puppeteer-extra");
// const RecaptchaPlugin      = require("puppeteer-extra-plugin-recaptcha");
// puppeteerExtra.use(
//   RecaptchaPlugin({
//     provider: { id: "2captcha", token: process.env.TWOCAPTCHA_KEY },
//     visualFeedback: true,
//   })
// );
// Then replace `puppeteer.launch(...)` with `puppeteerExtra.launch(...)`
//
// For simplicity here, we assume you call solveRecaptchas() manually.

// ─────────────────────────────────────────────────────────────────────────────
// 1) Get CÉDULA from command line
// ─────────────────────────────────────────────────────────────────────────────
if (process.argv.length < 2) {
  console.error("Usage: node index_penal_full.js <CEDULA>");
  process.exit(1);
}
const CEDULA = process.argv[2].trim();
const MOTIVO = "Chequeo para UFA";

// ─────────────────────────────────────────────────────────────────────────────
// 2) Kick off Puppeteer
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_URL = "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/";
const API_KEY  = process.env.TWOCAPTCHA_KEY;
if (!API_KEY) {
  console.error("❌ Please set TWOCAPTCHA_KEY in your .env");
  process.exit(1);
}

;(async () => {
  console.log("🚀 Launching browser…");
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });
  const [page] = await browser.pages();

  // ───────────────────────────────────────────────────────────────────────────
  // 3) Goto the Antecedentes Penales page
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🌐 Navigating to the Antecedentes URL…");
  await page.goto(PAGE_URL, {
    waitUntil: "networkidle2",
    timeout: 120_000
  });
  await snap(page, 'after-goto');

  // ───────────────────────────────────────────────────────────────────────────
  // 4) Wait for Incapsula gate’s <iframe id="main-iframe">
  // ───────────────────────────────────────────────────────────────────────────
  let outerHandle;
  try {
    outerHandle = await page.waitForSelector("iframe#main-iframe", {
      timeout: 15_000
    });
    console.log("✅ Found the Incapsula gate iframe (#main-iframe).");
  } catch {
    console.error("❌ Timeout: did not see \"iframe#main-iframe\". Exiting.");
    await browser.close();
    process.exit(1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5) Enter that gate’s iframe (contentFrame)
  // ───────────────────────────────────────────────────────────────────────────
  const incapsulaFrame = await outerHandle.contentFrame();
  if (!incapsulaFrame) {
    console.error("❌ Could not access contentFrame() for Incapsula gate.");
    await browser.close();
    process.exit(1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6) Inside incapsulaFrame, wait for <div class="h-captcha" data-sitekey="…">
  // ───────────────────────────────────────────────────────────────────────────
  let sitekey = null;
  try {
    await incapsulaFrame.waitForSelector("div.h-captcha[data-sitekey]", {
      timeout: 15_000
    });
    sitekey = await incapsulaFrame.$eval(
      "div.h-captcha[data-sitekey]",
      el => el.getAttribute("data-sitekey")
    );
    console.log("🔑 hCaptcha sitekey =", sitekey);
  } catch {
    console.error("❌ Could not find <div.h-captcha data-sitekey> in 15s. Exiting.");
    await browser.close();
    process.exit(1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7) Confirm that the actual hCaptcha <iframe> is visible
  // ───────────────────────────────────────────────────────────────────────────
  try {
    await incapsulaFrame.waitForSelector("div.h-captcha iframe", {
      visible: true,
      timeout: 10_000
    });
    console.log("✅ hCaptcha iframe is visible inside <div.h-captcha>.");
  } catch {
    console.error("❌ The inner hCaptcha <iframe> did not appear in time. Exiting.");
    await browser.close();
    process.exit(1);
  }

  const userAgent = await page.evaluate(() => navigator.userAgent);

  // ───────────────────────────────────────────────────────────────────────────
  // 8) Send sitekey + page URL to 2Captcha via HTTPS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("📡 Submitting sitekey+pageurl to 2Captcha (HTTPS)…");
  let inResponseJSON;
  try {
    const inResponse = await fetch(
      `https://2captcha.com/in.php?key=${API_KEY}` +
      `&method=hcaptcha&sitekey=${encodeURIComponent(sitekey)}` +
      `&pageurl=${encodeURIComponent(PAGE_URL)}` +
      `&json=1&userAgent=${encodeURIComponent(userAgent)}`
    );
    inResponseJSON = await inResponse.json();
  } catch (err) {
    console.error("❌ Network error while sending to 2Captcha:", err);
    await browser.close();
    process.exit(1);
  }

  if (!inResponseJSON || inResponseJSON.status !== 1) {
    console.error("❌ 2Captcha API returned an error at submission:", inResponseJSON);
    await browser.close();
    process.exit(1);
  }
  const captchaId = inResponseJSON.request;
  console.log("✅ 2Captcha recognized request, captchaId =", captchaId);

  // ───────────────────────────────────────────────────────────────────────────
  // 9) Poll https://2captcha.com/res.php every 5s (max 24 attempts ~120s)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("⏳ Waiting for 2Captcha to solve the hCaptcha (up to ~120s) …");
  let token = null;
  for (let attempt = 1; attempt <= 24; attempt++) {
    await new Promise(r => setTimeout(r, 5000));

    let resJSON = null;
    try {
      const resResp = await fetch(
        `https://2captcha.com/res.php?key=${API_KEY}` +
        `&action=get&id=${captchaId}&json=1`
      );
      resJSON = await resResp.json();
    } catch (err) {
      console.warn(`⚠️ [Attempt ${attempt}] Error polling 2Captcha:`, err);
      continue;
    }

    if (!resJSON) {
      console.warn(`⚠️ [Attempt ${attempt}] Empty JSON from 2Captcha.`);
      continue;
    }
    if (resJSON.status === 0 && resJSON.request === "CAPCHA_NOT_READY") {
      console.log(`   → Not ready yet (${attempt}/24)…`);
      continue;
    }
    if (resJSON.status === 1) {
      token = resJSON.request;
      console.log("✅ Received solved hCaptcha token from 2Captcha!");
      break;
    }
    console.error(`❌ [Attempt ${attempt}] 2Captcha returned error:`, resJSON);
    break;
  }

  if (!token) {
    console.error("❌ Timed out waiting for hCaptcha token. Exiting.");
    await browser.close();
    process.exit(1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 10) Inject the token into <textarea name="h-captcha-response"> both in the
  //     main page and inside incapsulaFrame
  // ───────────────────────────────────────────────────────────────────────────
  console.log("✍️ Injecting the hCaptcha solution into textarea...");

  // Update/create textareas on the main page
  await page.evaluate(resolvedToken => {
    let ta = document.querySelector("textarea[name='h-captcha-response']");
    if (!ta) {
      ta = document.createElement('textarea');
      ta.name = 'h-captcha-response';
      ta.style.display = 'none';
      document.body.appendChild(ta);
    }
    ta.value = resolvedToken;
    ta.innerText = resolvedToken;
    ta.dispatchEvent(new Event('change', { bubbles: true }));

    let ga = document.querySelector("textarea[name='g-recaptcha-response']");
    if (!ga) {
      ga = document.createElement('textarea');
      ga.name = 'g-recaptcha-response';
      ga.style.display = 'none';
      document.body.appendChild(ga);
    }
    ga.value = resolvedToken;
    ga.innerText = resolvedToken;
    ga.dispatchEvent(new Event('change', { bubbles: true }));
  }, token);

  const frameValid = await incapsulaFrame.evaluate(tk => {
    try {
      return !!(window.hcaptcha && window.hcaptcha.getResponse() === tk);
    } catch (_) { return false; }
  }, token);
  const pageValid = await page.evaluate(tk => {
    try {
      return !!(window.hcaptcha && window.hcaptcha.getResponse() === tk);
    } catch (_) { return false; }
  }, token);
  console.log("✅ hcaptcha.getResponse() check →", { frameValid, pageValid });

  await incapsulaFrame.evaluate(resolvedToken => {
    let ta = document.querySelector("textarea[name='h-captcha-response']");
    if (!ta) {
      ta = document.createElement('textarea');
      ta.name = 'h-captcha-response';
      ta.style.display = 'none';
      document.body.appendChild(ta);
    }
    ta.value = resolvedToken;
    ta.innerText = resolvedToken;
    ta.dispatchEvent(new Event('change', { bubbles: true }));

    let ga = document.querySelector("textarea[name='g-recaptcha-response']");
    if (!ga) {
      ga = document.createElement('textarea');
      ga.name = 'g-recaptcha-response';
      ga.style.display = 'none';
      document.body.appendChild(ga);
    }
    ga.value = resolvedToken;
    ga.innerText = resolvedToken;
    ga.dispatchEvent(new Event('change', { bubbles: true }));

    if (window.hcaptcha && typeof window.hcaptcha.execute === 'function') {
      try { window.hcaptcha.execute(); } catch (_) { /* ignore */ }
    }
  }, token);
  await snap(page, 'after-token');

  // ───────────────────────────────────────────────────────────────────────────

  // 11) Force‐click the hCaptcha “I am human” checkbox (inside same frame)
  // ───────────────────────────────────────────────────────────────────────────
  try {
    await incapsulaFrame.waitForSelector("div.h-captcha", {
      visible: true,
      timeout: 10_000
    });
    const checkboxContainer = await incapsulaFrame.$("div.h-captcha");
    if (checkboxContainer) {
      await checkboxContainer.click({ force: true });
      console.log("🖱️ Clicked the hCaptcha checkbox to finalize the solve.");
    }
  } catch (err) {
    console.warn("⚠️ Unable to click the hCaptcha checkbox. Are selectors correct?", err);
  }

  // Wait for the Incapsula overlay iframe to disappear
  // Give Imperva ample time to drop the gate after solving the hCaptcha
  await page.waitForSelector('iframe#main-iframe', {
    hidden: true,
    // the solve might take a while, so wait up to three minutes
    timeout: 180_000
  });
  console.log("🎉 Done solving hCaptcha. Imperva gate should now be lifted.");
  await snap(page, 'after-gate');

  // ───────────────────────────────────────────────────────────────────────────
  // 12) Now proceed with “Aceptar” → Fill CÉDULA → solve in‐page reCAPTCHAs → etc.
  // ───────────────────────────────────────────────────────────────────────────
  // (12A) Click “Aceptar” on Terms & Conditions, if present:
  try {
    await page.waitForFunction(
      () => {
        return Array.from(document.querySelectorAll("button")).some(btn => {
          const sp = btn.querySelector("span.ui-button-text");
          return sp && sp.innerText.trim() === "Aceptar";
        });
      },
      { timeout: 10_000 }
    );

    let aceptarHandle = null;
    for (const btn of await page.$$("button")) {
      const txt = await page.evaluate(el => {
        const sp = el.querySelector("span.ui-button-text");
        return sp ? sp.innerText.trim() : "";
      }, btn);
      if (txt === "Aceptar") {
        aceptarHandle = btn;
        break;
      }
    }

    if (aceptarHandle) {
      await aceptarHandle.click({ force: true });
      await page.waitForTimeout(500);
      console.log("✅ Clicked “Aceptar” on Terms & Conditions");
    }
  } catch {
    console.warn("⚠️ No Terms & Conditions dialog appeared (skipping “Aceptar”).");
  }

  // (12B) Wipe cookies/storage
  await page.evaluate(() => {
    document.cookie
      .split(";")
      .forEach(c => {
        const n = c.split("=")[0].trim();
        document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13) Fill “Número de Documento” (cédula) & solve any invisible reCAPTCHA
  // ───────────────────────────────────────────────────────────────────────────
  await page.waitForSelector(
    'input[id="cedula"], input[name="cedula"], input[type="text"]',
    { visible: true, timeout: 30_000 }
  );
  console.log(`✍️ Filling CÉDULA: ${CEDULA}`);
  await page.click('input[id="cedula"], input[name="cedula"], input[type="text"]');
  await page.keyboard.type(CEDULA);

  // Let the page’s JS validate, then disable pointer‐events on any reCAPTCHA
  await new Promise(res => setTimeout(res, 1000));
  await page.addStyleTag({
    content: `iframe[title*="reCAPTCHA"]{ pointer-events:none!important; }`
  });

  // Wait for Step 1 button (“Siguiente” / “Consultar”) to appear
  await page.waitForFunction(
    () => {
      return Array.from(document.querySelectorAll("button")).some(b => {
        const txt = b.innerText.trim();
        return txt === "Siguiente" || txt === "Consultar";
      });
    },
    { timeout: 15_000 }
  );
  let step1Btn = null;
  for (const b of await page.$$("button")) {
    const txt = await page.evaluate(el => el.innerText.trim(), b);
    if (txt === "Siguiente" || txt === "Consultar") {
      step1Btn = b;
      break;
    }
  }
  if (!step1Btn) {
    console.error("❌ Could not find Step 1 (“Siguiente”/“Consultar”) button!");
    await browser.close();
    process.exit(1);
  }
  console.log("🖱️ Clicking Step 1 button (“Siguiente”/“Consultar”)…");
  await step1Btn.click({ force: true });

  // Wait 0.5s, then solve invisible reCAPTCHA if present
  await new Promise(res => setTimeout(res, 500));
  const iframe1 = await page.$('iframe[src*="api2/anchor"], iframe[src*="api2/bframe"]');
  if (iframe1) {
    console.log("🤖 Solving Step 1 reCAPTCHA…");
    let { solved, error, codes } = await page.solveRecaptchas();
    if (solved.length === 0) {
      await new Promise(res => setTimeout(res, 1000));
      const retry1 = await page.solveRecaptchas();
      solved = retry1.solved || [];
      error  = retry1.error  || null;
      codes  = retry1.codes  || null;
    }
    console.log("✔️ Step 1 reCAPTCHA solved:", solved);
    if (error) console.error("❌ Step 1 reCAPTCHA error:", error);
  } else {
    console.log("ℹ️ No Step 1 reCAPTCHA appeared.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14) Wait for “Motivo de Consulta” textarea → fill → solve any reCAPTCHA
  // ───────────────────────────────────────────────────────────────────────────
  await page.waitForSelector("textarea", { visible: true, timeout: 30_000 });
  console.log("✍️ Filling “Motivo de Consulta”…");
  await page.click("textarea");
  await page.keyboard.type(MOTIVO);

  // Clear cookies/storage again (just in case)
  await page.evaluate(() => {
    document.cookie
      .split(";")
      .forEach(c => {
        const n = c.split("=")[0].trim();
        document.cookie = `${n}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
      });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Disable pointer-events on any new reCAPTCHA
  await new Promise(res => setTimeout(res, 500));
  await page.addStyleTag({
    content: `iframe[title*="reCAPTCHA"]{ pointer-events:none!important; }`
  });

  // Wait for Step 2 (“Visualizar Certificado”) button
  await page.waitForFunction(
    () => {
      return Array.from(document.querySelectorAll("button")).some(b => {
        const txt = b.innerText.trim();
        return (
          txt === "Siguiente" ||
          txt === "Visualizar Certificado" ||
          txt === "Generar Certificado"
        );
      });
    },
    { timeout: 15_000 }
  );
  let step2Btn = null;
  for (const b of await page.$$("button")) {
    const txt = await page.evaluate(el => el.innerText.trim(), b);
    if (
      txt === "Siguiente" ||
      txt === "Visualizar Certificado" ||
      txt === "Generar Certificado"
    ) {
      step2Btn = b;
      break;
    }
  }
  if (!step2Btn) {
    console.error("❌ Could not find Step 2 (“Visualizar Certificado”) button!");
    await browser.close();
    process.exit(1);
  }
  console.log("🖱️ Clicking Step 2 button (“Visualizar Certificado”)…");
  await step2Btn.click({ force: true });

  // Wait 0.5s, then solve invisible reCAPTCHA if present
  await new Promise(res => setTimeout(res, 500));
  const iframe2 = await page.$('iframe[src*="api2/anchor"], iframe[src*="api2/bframe"]');
  if (iframe2) {
    console.log("🤖 Solving Step 2 reCAPTCHA…");
    let { solved, error, codes } = await page.solveRecaptchas();
    if (solved.length === 0) {
      await new Promise(res => setTimeout(res, 1000));
      const retry2 = await page.solveRecaptchas();
      solved = retry2.solved || [];
      error  = retry2.error  || null;
      codes  = retry2.codes  || null;
    }
    console.log("✔️ Step 2 reCAPTCHA solved:", solved);
    if (error) console.error("❌ Step 2 reCAPTCHA error:", error);
  } else {
    console.log("ℹ️ No Step 2 reCAPTCHA appeared.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 15) Wait for final “Posee Antecedentes : SÍ/NO” → print result
  // ───────────────────────────────────────────────────────────────────────────
  await page.waitForFunction(
    () => {
      return Array.from(document.querySelectorAll("div, span, b")).some(el => {
        return el.innerText.trim().startsWith("Posee Antecedentes");
      });
    },
    { timeout: 30_000 }
  );
  const resultadoText = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("div, span, b"));
    for (const el of els) {
      const txt = el.innerText.trim();
      if (txt.startsWith("Posee Antecedentes")) {
        return txt;
      }
    }
    return "";
  });

  let salida = "No";
  if (resultadoText.toLowerCase().includes("sí")) {
    salida = "Si";
  }
  console.log("🎯 Resultado final →", salida);

  // ───────────────────────────────────────────────────────────────────────────
  // 16) Close & exit
  // ───────────────────────────────────────────────────────────────────────────
  await browser.close();
  process.exit(0);

})().catch(err => {
  console.error("❌ Uncaught error:", err);
  process.exit(1);
});
