import requests
import time
from urllib.parse import urlencode
from retry import retry
from subprocess import TimeoutExpired

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def fetch_declaraciones_juradas(
    ce: str,
    no: str,
    c1: str,
    c2: str,
    session_id: str,
    bigip: str,
    tipo: str = "dj",
    start: int = 0,
    length: int = 20
) -> int:
    """
    Llama al endpoint WFResultados.aspx con los parámetros capturados
    y devuelve el valor de `recordsTotal` del JSON.
    
    Parámetros obligatorios:
      - ce: Cédula
      - no: Nombre (URL-encoded)
      - c1, c2: Tokens anti-bot que ves en DevTools (param c1, c2)
      - session_id, bigip: Cookies de sesión (ASP.NET_SessionId, BIGipServer…)
    Opcionales:
      - tipo: normalmente "dj"
      - start, length: paginación (usualmente 0, 20)
    """
    base_url = "https://www.contraloria.gob.ec/WFResultados.aspx"
    
    # Construir todos los query params tal cual en DevTools
    params = {
        "draw": 5,
        "columns[0][data]": 0,  "columns[0][name]": "", "columns[0][searchable]": "true",
        "columns[0][orderable]": "false", "columns[0][search][value]": "", "columns[0][search][regex]": "false",
        "columns[1][data]": 1,  "columns[1][searchable]": "true", "columns[1][orderable]": "false",
        "columns[1][search][value]": "", "columns[1][search][regex]": "false",
        "columns[2][data]": 2,  "columns[2][searchable]": "true", "columns[2][orderable]": "false",
        "columns[2][search][value]": "", "columns[2][search][regex]": "false",
        "columns[3][data]": 3,  "columns[3][searchable]": "true", "columns[3][orderable]": "false",
        "columns[3][search][value]": "", "columns[3][search][regex]": "false",
        "columns[4][data]": 4,  "columns[4][searchable]": "true", "columns[4][orderable]": "false",
        "columns[4][search][value]": "", "columns[4][search][regex]": "false",
        "start": start,
        "length": length,
        "search[value]": "",
        "search[regex]": "false",
        "tipo": tipo,
        "ce": ce,
        "no": no,
        "ca": "",
        "en": "",
        "c1": c1,
        "c2": c2,
        "ht": "0",
        "_": int(time.time() * 1000)
    }

    headers = {
        "Accept":          "application/json, text/javascript, */*; q=0.01",
        "Referer":         "https://www.contraloria.gob.ec/Consultas/DeclaracionesJuradas",
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With":"XMLHttpRequest",
    }

    cookies = {
        "ASP.NET_SessionId": session_id,
        "BIGipServerPagina_web_DMZ_80": bigip
    }

    resp = requests.get(
        base_url,
        params=params,
        headers=headers,
        cookies=cookies,
        timeout=15,
        verify=False
    )
    resp.raise_for_status()
    data = resp.json()
    print("Respuesta JSON:", data)  # Para depuración
    # recordsTotal es un entero en la raíz
    return data.get("recordsTotal", 0)


if __name__ == "__main__":
    # Ejemplo de uso. Rellena estos valores con lo que veas en DevTools:
    ce = "1709705675"
    no = "Herrera%20Oramas%20Mary%20Paz"
    c1 = "u1844g"
    c2 = "560d14b3e526f7c2498eb513474bc17645605ae89360388fbad095227dfa2d77"
    session_id = "3es132webclnv55s0i1gpq0q"
    bigip = "1796581568.37151.0000"

    total = fetch_declaraciones_juradas(ce, no, c1, c2, session_id, bigip)
    print("recordsTotal =", total)
