import sys
import requests

def check_interpol_red_notice(apellidos: str, nombres: str) -> bool:
    url = "https://ws-public.interpol.int/notices/v1/red"
    # Observa que incluimos page y resultPerPage, igual que hace la web
    params = {
        "name": apellidos,
        "forename": nombres,
        "page": 1,
        "resultPerPage": 20,
    }
    headers = {
        "Accept":             "*/*",
        "User-Agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
        "Origin":             "https://www.interpol.int",
        "Referer":            "https://www.interpol.int/es/Como-trabajamos/"
                              "Notificaciones/Notificaciones-rojas/"
                              "Ver-las-notificaciones-rojas",
        "X-Requested-With":   "XMLHttpRequest",
        "Connection":         "keep-alive",
        "Sec-Fetch-Site":     "same-site",
        "Sec-Fetch-Mode":     "cors",
        "Sec-Fetch-Dest":     "empty",
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    notices = data.get("_embedded", {}).get("notices", [])
    return len(notices) > 0

if __name__ == "__main__":
    ejemplos = [
        ("Barandearan Gutierrez", "Alfredo Gustavo"),
        ("Macias Villamar",     "Jose Adolfo"),
    ]

    for apellidos, nombres in ejemplos:
        print(f"\nConsultando Red Notices para: {apellidos} / {nombres} …")
        try:
            alarma = check_interpol_red_notice(apellidos, nombres)
        except Exception as e:
            print("❌ Error al llamar a la API de Interpol:", e)
            continue

        if alarma:
            print("🚨 ALARM: ¡Hay al menos una Notificación Roja!")
        else:
            print("✔️  No hay Notificaciones Rojas.")
