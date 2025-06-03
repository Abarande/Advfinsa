import base64
import requests
import sys
import time

# ──────────────────────────────────────────────────────────────────────────────
# Helpers to build the “code” parameter in each POST
# ──────────────────────────────────────────────────────────────────────────────
def b64encode_str(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")

def wsgetdata_payload(cedula: str) -> str:
    # “WSgetData<TAB>cedula<TAB>C<TAB>SI<TAB>ECU”
    return b64encode_str(f"WSgetData\t{cedula}\tC\tSI\tECU")

def setmotive_payload(token: str, motivo: str) -> str:
    # “setMotive<TAB>token<TAB>motivo”
    return b64encode_str(f"setMotive\t{token}\t{motivo}")

def fetch_antecedentes(cedula: str, motivo: str="chequeo para UFA") -> str:
    session = requests.Session()

    # ──────────────────────────────────────────────────────────────────────────
    # 1) Define exactly‐matching "browser" headers
    # ──────────────────────────────────────────────────────────────────────────
    BROWSER_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/114.0.0.0 Safari/537.36"
    )
    POST_HEADERS = {
        "User-Agent": BROWSER_UA,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
        # “X-Requested-With: XMLHttpRequest” is critical so Imperva sees it as AJAX
        "X-Requested-With": "XMLHttpRequest",
        # Always set the same Origin/Referer that the real form uses
        "Origin": "https://certificados.ministeriodelinterior.gob.ec",
        "Referer": "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Cache-Control": "no-cache",
    }
    BASE_URL = (
        "https://certificados.ministeriodelinterior.gob.ec/"
        "gestorcertificados/antecedentes/function.php"
    )

    # ──────────────────────────────────────────────────────────────────────────
    # 2) “Warm‐up” Imperva cookies
    #
    #    a) GET the root domain → picks up any global Imperva cookie
    #    b) GET the /antecedentes/ landing page → picks up the page‐specific Imperva cookie
    # ──────────────────────────────────────────────────────────────────────────

    # 2.a) GET root domain to pick up any top‐level Imperva cookie
    r_root = session.get(
        "https://certificados.ministeriodelinterior.gob.ec/",
        headers={
            "User-Agent": BROWSER_UA,
            "Referer": "https://www.google.com/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
        timeout=30
    )
    r_root.raise_for_status()
    # (We do not need to read r_root.text—this is just cookie warm‐up)

    # 2.b) GET the actual “/antecedentes/” page to pick up the second Imperva cookie
    r_landing = session.get(
        "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/",
        headers={
            "User-Agent": BROWSER_UA,
            "Referer": "https://certificados.ministeriodelinterior.gob.ec/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
        timeout=30
    )
    r_landing.raise_for_status()
    # Again, we do not parse the landing HTML. Just making sure Imperva‐set cookies are stored.

    # ──────────────────────────────────────────────────────────────────────────
    # 3) First POST → WSgetData
    #
    #    The server should return a JSON like: [{"error":"","TFARYA":"6041161a38491d1b"}]
    # ──────────────────────────────────────────────────────────────────────────
    payload1 = wsgetdata_payload(cedula)
    r1 = session.post(
        BASE_URL,
        headers=POST_HEADERS,
        data={"code": payload1},
        timeout=30
    )
    r1.raise_for_status()

    # If Imperva still returned HTML (challenge), r1.text will start with "<html…"
    try:
        arr1 = r1.json()
    except ValueError:
        snippet = r1.text[:200].replace("\n", " ").replace("\r", " ")
        raise RuntimeError(
            f"Expected JSON from step #1, but got HTML:\n  {snippet!r}"
        )

    if not isinstance(arr1, list) or "TFARYA" not in arr1[0]:
        raise RuntimeError(f"Unexpected JSON #1 (no TFARYA): {arr1!r}")
    token = arr1[0]["TFARYA"]
    if not token:
        raise RuntimeError(f"Empty TFARYA for cedula={cedula!r}: {arr1!r}")

    # ──────────────────────────────────────────────────────────────────────────
    # 4) Second POST → setMotive
    #
    #    Most back ends return something like [{"error":""}] on success.
    # ──────────────────────────────────────────────────────────────────────────
    payload2 = setmotive_payload(token, motivo)
    r2 = session.post(
        BASE_URL,
        headers=POST_HEADERS,
        data={"code": payload2},
        timeout=30
    )
    r2.raise_for_status()
    # We do not NEED the JSON from step #2—just trusting it succeeded (no exception).

    # ──────────────────────────────────────────────────────────────────────────
    # 5) Third POST (optional) → getResult
    #
    #    If the back end supports it, “getResult” returns a JSON with
    #    { "antecedentes": "SI" } or { "antecedentes": "NO" }.
    # ──────────────────────────────────────────────────────────────────────────
    payload3 = b64encode_str(f"getResult\t{token}")
    r3 = session.post(
        BASE_URL,
        headers=POST_HEADERS,
        data={"code": payload3},
        timeout=30
    )
    # Sometimes r3 is HTML (if that endpoint isn’t supported), so wrap in try/except
    if r3.status_code == 200:
        try:
            arr3 = r3.json()
            if isinstance(arr3, list) and "antecedentes" in arr3[0]:
                val = arr3[0]["antecedentes"].upper().strip()
                if val in ("SI", "NO"):
                    return val
        except ValueError:
            # r3 returned HTML—fall through to the fallback scrape
            pass

    # ──────────────────────────────────────────────────────────────────────────
    # 6) Fallback GET → scrape “index.php” for the “Posee Antecedentes” text.
    # ──────────────────────────────────────────────────────────────────────────
    r4 = session.get(
        "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/index.php",
        headers={
            "User-Agent": BROWSER_UA,
            "Referer": "https://certificados.ministeriodelinterior.gob.ec/gestorcertificados/antecedentes/"
        },
        timeout=30
    )
    r4.raise_for_status()
    page_html = r4.text.lower()
    if "posee antecedentes" in page_html:
        snippet = page_html.split("posee antecedentes", 1)[1][:100]
        # If “posee antecedentes” is followed by “:</b> SI” or similar
        if "si" in snippet and "no" not in snippet:
            return "SI"
        if "no" in snippet and "si" not in snippet:
            return "NO"

    return "NO"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python antecedentes.py <CEDULA>")
        sys.exit(1)

    ced = sys.argv[1].strip()
    try:
        resultado = fetch_antecedentes(ced, motivo="chequeo para UFA")
        print(resultado)   # prints “SI” or “NO”
    except Exception as e:
        print("ERROR:", e)
        sys.exit(1)
