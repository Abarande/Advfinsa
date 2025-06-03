import requests
from datetime import date
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def fetch_impedimentos(cedula: str, fecnac: date):
    # 1) Log in
    login_url = "https://apis.migracion.gob.ec/apiimpedimentos/login"
    login_payload = {"username": "admin", "password": "4dm1n1str4d0rvu3"}
    login_headers = {
        "Content-Type": "application/json",
        "Origin":        "https://impedimentos.migracion.gob.ec",
        "Referer":       "https://impedimentos.migracion.gob.ec/"
    }
    login_resp = requests.post(
        login_url,
        json=login_payload,
        headers=login_headers,
        timeout=5,
        verify=False
    )
    login_resp.raise_for_status()
    token = login_resp.json()["access_token"]

    # 2) Query impedimentos
    simiec_url = "https://apis.migracion.gob.ec/apiimpedimentos/simiec/simiec"
    params = {"documento": cedula, "fecnac": fecnac.isoformat()}
    simiec_headers = {
        "Authorization": f"Bearer {token}",
        "Accept":        "application/json",
        "Referer":       "https://impedimentos.migracion.gob.ec/"
    }
    resp = requests.get(
        simiec_url,
        params=params,
        headers=simiec_headers,
        timeout=10,
        verify=False
    )
    resp.raise_for_status()
    return resp.json()

