import pandas as pd
import time
from playwright.sync_api import sync_playwright
import os
import re
from procesos_judiciales import fetch_procesos_judiciales
from migracion import fetch_impedimentos
from deudas_firmes_impugnadas import get_deuda_from_js 
from delitos import fetch_noticias_delito
from sector_publico import consulta_dependencia
from declaraciones import get_records_total
from interpol import check_interpol_red_notice

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
      "Nombres": str,
      "Apellidos": str,
      "tipo_persona": str
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
        nom = row["Nombres"]
        ape= row["Apellidos"]
        fecha = row["Fecha"]
        person_type = row["tipo_persona"]
        # Ejecutar cada módulo y capturar resultados

        #migracion
        if person_type == "Natural":
            try:
                data = fetch_impedimentos(ced, fecha)
                first_item = None
                for sublist in data.get("result", []):
                    if sublist:
                        first_item = sublist[0]
                        break

                # 3) extract the boolean (default False)
                has_imp = False
                if first_item is not None:
                    has_imp = first_item.get("conImpedimentos", False)

                # 4) write "Si" or "No"
                df.at[idx, "migracion"] = "Si" if has_imp else "No"
            except Exception as e:
                df.at[idx, "migracion"] = f"ERROR: {e}"

            #Dependencia del Sector Público
            try:
                # Llamar al script Node.js para obtener el registro
                registro = consulta_dependencia(ced, fecha.strftime("%d/%m/%Y"))
                df.at[idx, "dependencia"] = registro
            except Exception as e:
                df.at[idx, "dependencia"] = f"ERROR: {e}"
            
            #Declaraciones patrimoniales juradas
            try:
                # Llamar a la función para obtener los registros
                full_name = f"{ape} {nom}".strip()
                records = get_records_total(ced, full_name)
                if records != "0":
                    df.at[idx, "declaraciones"] = f"{records} registros encontrados"
                else:
                    df.at[idx, "declaraciones"] = "sin registros"
            except Exception as e:
                df.at[idx, "declaraciones"] = f"ERROR: {e}"
            
            #interpol
            try:
                interpol = check_interpol_red_notice(ape,nom)
                if interpol:
                    df.at[idx, "interpol"] = "ALERTA INTERPOL"
                else:
                    df.at[idx, "interpol"] = "sin alerta"
            except Exception as e:
                df.at[idx, "interpol"] = f"ERROR: {e}"
           

            
        
        # SRI Deudas Firmes  
        try:
            test_id = ced
            status = get_deuda_from_js(test_id)
            df.at[idx, "sri_deudas"] = status
        except Exception as e:
            df.at[idx, "sri_deudas"] = f"ERROR: {e}"

         
        #Fiscalia Noticias del Delito
        try:
            sujetos, html_page = fetch_noticias_delito(ced)

            # Filtrar solo las filas cuya 'cedula' coincida exactamente con la entrada
            sujetos_filtrados = [s for s in sujetos if s["cedula"] == ced]

            # Si no hay ningún sujeto filtrado → "sin delitos"
            if not sujetos_filtrados:
                df.at[idx, "fiscalia"] = "sin delitos"

            else:
                # De los filtrados, ver si alguno es SOSPECHOSO o PROCESADO
                malos = [s for s in sujetos_filtrados if s["estado"] in ("SOSPECHOSO", "PROCESADO")]

                if not malos:
                    # Solo figura como DENUNCIANTE/VICTIMA ⇒ "sin delitos"
                    df.at[idx, "fiscalia"] = "sin delitos"

                else:
                    # Hay al menos un SOSPECHOSO o PROCESADO: extraer Nro. de delito
                    match = re.search(r"NOTICIA DEL DELITO Nro\.\s*([0-9]+)", html_page, re.IGNORECASE)
                    nro_delito = match.group(1) if match else None

                    # Construir output para todos los "malos" (puede ser más de uno, pero mantenemos solo uno si prefieres)
                    textos = []
                    for s_malo in malos:
                        estado = s_malo["estado"]
                        if nro_delito:
                            textos.append(f"Nro. {nro_delito} – {estado}")
                        else:
                            textos.append(f"{estado} (Nro. desconocido)")

                    # Si hay varios, los unimos con “; ”. Ejemplo: "Nro. 0901… – SOSPECHOSO; Nro. 0901… – PROCESADO"
                    df.at[idx, "fiscalia"] = "; ".join(textos)

        except Exception as e:
            df.at[idx, "fiscalia"] = f"ERROR: {e}"

        # Procesos Judiciales
        try:
            procesos = fetch_procesos_judiciales(ced)
            if not procesos:
                df.at[idx, "funcionjudicial"] = "sin procesos"
            else:
                df.at[idx, "funcionjudicial"] = f"{len(procesos)} procesos encontrados"

        except Exception as e:
            df.at[idx, "funcionjudicial"] = f"ERROR: {e}"

        
        # Pequeña pausa
        time.sleep(1)

  

# 4. Guardar resultados
df.to_excel(output_path, index=False)
