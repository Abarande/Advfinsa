import re
import requests
import urllib3
from bs4 import BeautifulSoup

# Suprimir el warning de “certificate verify failed”
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def fetch_noticias_delito(cedula: str):
    """
    Consulta el módulo de 'noticias del delito' para una cédula específica (sin fecha
    de nacimiento) y devuelve una tupla:
      - Listado de diccionarios con los campos:
          * 'cedula':   la cédula encontrada
          * 'nombre':   el nombre completo
          * 'estado':   (DENUNCIANTE, VICTIMA, SOSPECHOSO, PROCESADO, etc.)
      - El HTML completo de la respuesta (para buscar el Nro. de delito)
    
    Si no existen coincidencias, retorna ([], html).
    """
    longitud = len(cedula)
    businfo_php = f'a:1:{{i:0;s:{longitud}:"{cedula}";}}'

    url = "https://www.gestiondefiscalias.gob.ec/siaf/comunes/noticiasdelito/info_mod.php"
    params = {"businfo": businfo_php}

    session = requests.Session()
    headers = {
        "Accept":     "*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/136.0.0.0 Safari/537.36",
        "Referer":    "https://www.gestiondefiscalias.gob.ec/"
                      "siaf/informacion/web/noticiasdelito/index.php",
        "Host":       "www.gestiondefiscalias.gob.ec",
    }

    # Uso verify=False para evitar el error SSL
    resp = session.get(url, params=params, headers=headers, timeout=15, verify=False)
    resp.raise_for_status()
    html = resp.text

    # Si no hay coincidencias de ningún tipo:
    if "No existen coincidencias para los criterios ingresados" in html:
        return [], html

    # Parsear con BeautifulSoup para extraer todos los sujetos de la página:
    soup = BeautifulSoup(html, "html.parser")
    resultados = []
    for table in soup.find_all("table"):
        thead = table.find("thead")
        if not thead:
            continue
        th_texts = [th.get_text(strip=True).upper() for th in thead.find_all("th")]
        if any("SUJETOS" in txt for txt in th_texts):
            tbody = table.find("tbody")
            if not tbody:
                continue
            for row in tbody.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) >= 3:
                    cedula_td = cols[0].get_text(strip=True)
                    nombre_td = cols[1].get_text(" ", strip=True)
                    estado_td = cols[2].get_text(strip=True)
                    resultados.append({
                        "cedula": cedula_td,
                        "nombre": nombre_td,
                        "estado": estado_td.upper()
                    })
    return resultados, html


if __name__ == "__main__":
    # Prueba con varias cédulas
    for ced in ["0925647851", "1309022935", "0914788245"]:
        # 1) Llamamos a la función
        sujetos, html_page = fetch_noticias_delito(ced)

        # 2) Filtramos sólo aquellas filas donde la 'cedula' coincida exactamente con la entrada
        sujetos_filtrados = [s for s in sujetos if s["cedula"] == ced]

        # 3) Si, después de filtrar, no hay ningún sujeto con esa cédula → “sin delitos”
        if not sujetos_filtrados:
            print(f"{ced}: sin delitos")
            print("-" * 40)
            continue

        # 4) De los filtrados, vemos si alguno es SOSPECHOSO o PROCESADO
        malos = [s for s in sujetos_filtrados if s["estado"] in ("SOSPECHOSO", "PROCESADO")]
        if not malos:
            # 4a) Si existe al menos un sujeto filtrado pero ninguno es SOSPECHOSO/PROCESADO,
            #      significa que sólo figura como DENUNCIANTE o VÍCTIMA => “sin delitos”
            print(f"{ced}: sin delitos")
            print("-" * 40)
            continue

        # 5) Si hay al menos un SOSPECHOSO o PROCESADO, extraemos el número de noticia
        match = re.search(r"NOTICIA DEL DELITO Nro\.\s*([0-9]+)", html_page, re.IGNORECASE)
        nro_delito = match.group(1) if match else None

        # 6) Imprimimos para cada sujeto “malo” (SOSPECHOSO/PROCESADO)
        for s in malos:
            estado = s["estado"]
            if nro_delito:
                print(f"{ced}: Nro. {nro_delito} – {estado}")
            else:
                print(f"{ced}: {estado} (Nro. desconocido)")
        print("-" * 40)

