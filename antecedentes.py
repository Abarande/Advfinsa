import time
import re
from playwright.sync_api import sync_playwright

def obtener_antecedentes(cedula: str) -> str:
    """
    Utiliza Playwright para:
    1) Navegar a la página de antecedentes y resolver el WAF.
    2) Hacer el primer POST (code1) a function.php dentro del navegador.
    3) Obtener TFARYA de la respuesta JSON.
    4) Hacer el segundo POST (code2) a index.php dentro del navegador.
    5) Extraer la variable `antecedent` del DOM resultante.
    Devuelve "SI" o "NO".
    """
    with sync_playwright() as p:
        # 1) Iniciar navegador headless (puedes cambiar a headless=False si quieres ver lo que ocurre)
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        
        # 2) Navegar a la página principal para que Incapsula ponga sus cookies
        page.goto("https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/", 
                  wait_until="networkidle")
        
        # Dar un pequeño margen para que carguen todos los scripts y cookies
        time.sleep(1.5)

        # 3) Construir en JS el primer code1 = btoa("WSgetData%<ci>%C%SI%ECU")
        js_code1 = f'''
            (() => {{
                const ci = "{cedula}";
                const tp = "C";    // Cédula
                const ise = "SI";  // Ecuatoriano
                const dp = "ECU";  // País = Ecuador
                const raw1 = `WSgetData%${{ci}}%${{tp}}%${{ise}}%${{dp}}`;
                return btoa(raw1);
            }})();
        '''
        code1 = page.evaluate(js_code1)

        # 4) Hacer el POST a function.php con fetch dentro del navegador
        js_post1 = f'''
            async () => {{
                const response = await fetch("https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/function.php", {{
                    method: "POST",
                    headers: {{
                      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                      "Accept": "application/json, text/javascript, */*; q=0.01",
                      "X-Requested-With": "XMLHttpRequest",
                      "Referer": "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/"
                    }},
                    body: new URLSearchParams({{ code: "{code1}" }})
                }});
                // Devolver el JSON como objeto
                return await response.json();
            }}
        '''
        resultado_json = page.evaluate(js_post1)
        # resultado_json debería ser algo como [{ "error": "", "TFARYA": "6041161336431712" }]
        if not (isinstance(resultado_json, list) and "TFARYA" in resultado_json[0]):
            browser.close()
            raise RuntimeError(f"Esperaba JSON con TFARYA, obtuve: {resultado_json}")
        tfarya = resultado_json[0]["TFARYA"]

        # 5) Construir en JS el segundo code2 = btoa("process%" + TFARYA)
        js_code2 = f'''
            (() => {{
                const raw2 = "process%{tfarya}";
                return btoa(raw2);
            }})();
        '''
        code2 = page.evaluate(js_code2)

        # 6) Hacer el POST final a index.php con fetch dentro del navegador
        js_post2 = f'''
            async () => {{
                const response = await fetch("https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/index.php", {{
                    method: "POST",
                    headers: {{
                      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                      "Accept": "text/html, */*; q=0.01",
                      "X-Requested-With": "XMLHttpRequest",
                      "Referer": "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/"
                    }},
                    body: new URLSearchParams({{ code: "{code2}" }})
                }});
                // Obtener el HTML resultante como texto
                return await response.text();
            }}
        '''
        html_final = page.evaluate(js_post2)

        # 7) Ahora que tenemos el HTML final (el contenido de index.php),
        #    podemos extraer la variable `antecedent = 'SI'` o `'NO'` con regex
        m = re.search(r"antecedent\s*=\s*'([^']+)'", html_final)
        browser.close()
        if not m:
            raise RuntimeError("No encontré 'antecedent' en el HTML final")
        return m.group(1).upper()  # "SI" o "NO"


if __name__ == "__main__":
    # Prueba rápida de varias cédulas
    for ced in ["1309022935", "0925647851"]:
        try:
            ant = obtener_antecedentes(ced)
            print(f"{ced} → Antecedente: {ant}")
        except Exception as e:
            print(f"{ced} → ERROR: {e}")
