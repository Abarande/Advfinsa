import pandas as pd
import time
from playwright.sync_api import sync_playwright
from migracion import fetch_impedimentos
from deudas_firmes_impugnadas import get_deuda_from_js 
import os



# 1. Configuración inicial
# Crea un archivo `input.xlsx` con columnas:
#   - id (cédula o RUC)
#   - name (nombre completo)
#   - person_type ("natural" o "company")
#   - use_interpol (True/False) para indicar si se consulta Interpol
input_path = "input.xlsx"
output_path = "output.xlsx"

SRI_PAGE_URL = (
    "https://srienlinea.sri.gob.ec/"
    "sri-en-linea/SriPagosWeb/"
    "ConsultaDeudasFirmesImpugnadas/Consultas/"
    "consultaDeudasFirmesImpugnadas"
)

df = pd.read_excel(
    "input.xlsx",
    header=1,               # second row has your column names
    parse_dates=["Fecha"],  # turn “Fecha” into a Timestamp
    dtype={                 # force these other columns to str
      "ID": str,
      "Nombre": str,
      "tipo_persona": str,
      "interpol": str
    }
)

# 2) Convert the Timestamp into a plain date
df["Fecha"] = df["Fecha"].dt.date


# Columnas de resultados
result_columns = [
    "antecedentes", "migracion", 
    "sri_renta", "sri_deudas", "sri_ruc",
    "ofac", "funcionjudicial", "fiscalia",
    "interpol", "supercias", "trabajo", "contraloria"
]
for col in result_columns:
    df[col] = ""


# 3. Ejecutar la automatización
with sync_playwright() as p:
    for idx, row in df.iterrows():
        ced = row["ID"]
        nom = row["Nombre"]
        fecha = row["Fecha"]
        person_type = row["tipo_persona"]
        # Ejecutar cada módulo y capturar resultados

        #migracion
        # if person_type == "Natural":
        #     try:
        #         data = fetch_impedimentos(ced, fecha)
        #         first_item = None
        #         for sublist in data.get("result", []):
        #             if sublist:
        #                 first_item = sublist[0]
        #                 break

        #         # 3) extract the boolean (default False)
        #         has_imp = False
        #         if first_item is not None:
        #             has_imp = first_item.get("conImpedimentos", False)

        #         # 4) write "Si" or "No"
        #         df.at[idx, "migracion"] = "Si" if has_imp else "No"
        #     except Exception as e:
        #         df.at[idx, "migracion"] = f"ERROR: {e}"
        
        # SRI Deudas Firmes 
        
        try:
            base_dir   = os.path.dirname(__file__)
            js_relpath = os.path.join("captcha_solver", "index_deudas.js")
            js_path    = os.path.join(base_dir, js_relpath)
            test_id = ced
            status = get_deuda_from_js(test_id, script_path=js_path)
            df.at[idx, "sri_deudas"] = status
        except Exception as e:
            df.at[idx, "sri_deudas"] = f"ERROR: {e}"

        # try:
        #     df.at[idx, "sri_renta"] = check_sri_renta(page, ced)
        # except: df.at[idx, "sri_renta"] = ""
        # try:
        #     df.at[idx, "sri_deudas"] = check_sri_deudas(page, ced)
        # except: df.at[idx, "sri_deudas"] = ""
        # try:
        #     df.at[idx, "sri_ruc"] = check_sri_ruc(page, ced)
        # except: df.at[idx, "sri_ruc"] = ""
        # try:
        #     df.at[idx, "ofac"] = check_ofac(page, nom)
        # except: df.at[idx, "ofac"] = ""
        # try:
        #     df.at[idx, "funcionjudicial"] = check_funcionjudicial(page, ced)
        # except: df.at[idx, "funcionjudicial"] = ""
        # try:
        #     df.at[idx, "fiscalia"] = check_fiscalia(page, ced)
        # except: df.at[idx, "fiscalia"] = ""
        # # Interpol condicional
        # if row.get("use_interpol", False):
        #     try:
        #         df.at[idx, "interpol"] = check_interpol(page, nom)
        #     except: df.at[idx, "interpol"] = ""
        # try:
        #     df.at[idx, "supercias"] = check_supercias(page, ced)
        # except: df.at[idx, "supercias"] = ""
        # try:
        #     df.at[idx, "trabajo"] = check_trabajo(page, ced)
        # except: df.at[idx, "trabajo"] = ""
        # try:
        #     df.at[idx, "contraloria"] = check_contraloria(page, ced)
        # except: df.at[idx, "contraloria"] = ""

        # Pequeña pausa
        time.sleep(1)

  

# 4. Guardar resultados
df.to_excel(output_path, index=False)
