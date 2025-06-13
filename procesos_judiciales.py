import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def fetch_procesos_judiciales(cedula: str, page: int = 1, size: int = 10):
    """
    Consulta la API de la Función Judicial para ver si existen procesos judiciales
    asociados a la cédula (o RUC) indicada.
    
    Parámetros:
      - cedula (str): Cédula o RUC que se va a buscar.
      - page (int): Página de resultados (por defecto 1).
      - size (int): Número de resultados por página (por defecto 10).
    
    Retorna:
      - Una lista (posiblemente vacía) con las coincidencias devueltas por el servidor.
    """
    # 1) Construye la URL con los query params
    url = f"https://api.funcionjudicial.gob.ec/MANTICORE-SERVICE/api/manticore/consulta/coincidencias"
    params = {
        "page": page,
        "size": size
    }

    # 2) Header tal como lo veías en DevTools
    headers = {
        "Accept":        "application/json, text/plain, */*",
        "Content-Type":  "application/json",
        # El campo Origin / Referer pueden ayudar a que el servidor nos devuelva la respuesta correcta
        "Origin":        "https://procesosjudiciales.funcionjudicial.gob.ec",
        "Referer":       "https://procesosjudiciales.funcionjudicial.gob.ec/",
        "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) "
                         "Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
    }

    # 3) Payload: el JSON que viste en “Request Payload”
    body = {
        "texto": cedula,
        "recaptcha": "verdad"
    }

    # 4) Hacer la petición POST
    try:
        resp = requests.post(url, params=params, json=body, headers=headers, timeout=15, verify=False)
        resp.raise_for_status()
    except Exception as e:
        # En caso de error de conexión / timeout / HTTP != 200
        raise RuntimeError(f"Error al conectarse a la API de Función Judicial: {e}")

    # 5) Decodificar la respuesta JSON
    #    La API devuelve algo como: [{ ... }, { ... }, ...] o [] si no hay coincidencias
    try:
        datos = resp.json()
    except ValueError:
        raise RuntimeError(f"La respuesta no es JSON válido: {resp.text}")

    # 6) Devolver la lista (vacía si no hay coincidencias)
    return datos


if __name__ == "__main__":
    # Ejemplo de uso:
    for ced in ["0925647851", "1309022935"]:
        try:
            resultados = fetch_procesos_judiciales(ced)
            if not resultados:
                print(f"{ced} → No hay PROCESOS JUDICIALES para esta cédula.")
            else:
                print(f"{ced} → Encontré {len(resultados)} coincidencia(s):")
                # for idx, item in enumerate(resultados, start=1):
                #     # Imprime por ejemplo el contenido completo o algunos campos:
                #     print(f"  {idx}) {item}")
        except Exception as err:
            print(f"{ced} → ERROR: {err}")
