import pandas as pd
import numpy as np
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
from impuesto_renta import get_impuesto_from_js
from consulta_ruc import get_consultaRUC_from_js
from supercias_personas import get_supercias_personas
from supercias_companias import get_supercias_compania
from OFAC import get_OFAC
import xlsxwriter
import datetime
import sys
import winsound
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk

# 1. Configuración inicial
# Crea un archivo `input.xlsx` con columnas:
#   - id (cédula o RUC)
#   - name (nombre completo)
#   - person_type ("natural" o "company")
#   - use_interpol (True/False) para indicar si se consulta Interpol
input_path = "input.xlsx"
output_path = "output.xlsx"
HERE = os.path.dirname(sys.argv[0])

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
    "sri_renta", "sri_deudas", "sri_ruc_estado", "sri_ruc_actividad",
    "ofac", "funcionjudicial", "fiscalia",
    "interpol",
    "adm_nombre", "adm_cargo",               # instead of raw JSON
    "acc_nombres", "acc_capital",            # instead of raw JSON
    "supercias_COC",
    "dependencia", "declaraciones"
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
                if registro == 'false':
                    registro = "No"
                elif registro == 'true':
                    registro = "Si"
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

            # Supercias Personas
            try:
                administracion, accionistas = get_supercias_personas(ced)
                # flatten administración (should be a list of 1 dict)
                if administracion and isinstance(administracion, list):
                    adm = administracion[0]
                    df.at[idx, "adm_nombre"] = adm.get("nombre", "")
                    df.at[idx, "adm_cargo"]  = adm.get("cargo", "")
                # flatten accionistas into two multiline cells
                if accionistas and isinstance(accionistas, list):
                    df.at[idx, "acc_nombres"] = "\n".join(a["nombre"]            for a in accionistas)
                    df.at[idx, "acc_capital"] = "\n".join(a["capitalInvertido"]  for a in accionistas)
            except Exception as e:
                df.at[idx, "adm_nombre"]   = f"ERROR: {e}"
                df.at[idx, "adm_cargo"]    = f"ERROR: {e}"
                df.at[idx, "acc_nombres"]  = f"ERROR: {e}"
                df.at[idx, "acc_capital"]  = f"ERROR: {e}"


        
            
        
        # SRI Deudas Firmes  
        try:
            status = get_deuda_from_js(ced)
            df.at[idx, "sri_deudas"] = status
        except Exception as e:
            df.at[idx, "sri_deudas"] = f"ERROR: {e}"

        # SRI RUC
        try:
            if person_type == "Natural":
                test_id = f"{ced}001"  # Añadir "001" para cédulas
            else:
                test_id = ced

            estado, actividad = get_consultaRUC_from_js(test_id)
            df.at[idx, "sri_ruc_estado"] = estado
            df.at[idx, "sri_ruc_actividad"] = actividad
        except Exception as e:
            df.at[idx, "sri_ruc_estado"] = f"ERROR: {e}"
            df.at[idx, "sri_ruc_actividad"] = ""

        # SRI Impuesto a la Renta
        try:
            status = get_impuesto_from_js(ced)
            df.at[idx, "sri_renta"] = status
        except Exception as e:
            df.at[idx, "sri_renta"] = f"ERROR: {e}"


         
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

        # OFAC
        try:
            ofac_info = get_OFAC(ced)
            df.at[idx, "ofac"] = ofac_info
        except Exception as e:
            df.at[idx, "ofac"] = f"ERROR: {e}"


        if person_type == "Juridica":
            # supercias companias
            try:
                compania_info = get_supercias_compania(ced)
                df.at[idx, "supercias_COC"] = compania_info
            except Exception as e:
                df.at[idx, "supercias_COC"] = f"ERROR: {e}"

        
        # Pequeña pausa
        time.sleep(1)

  
df = df.replace([np.inf, -np.inf], np.nan).fillna("")
with pd.ExcelWriter(output_path, engine='xlsxwriter') as writer:
    df.to_excel(writer,
                sheet_name='Resultados',
                index=False,
                startrow=1,
                header=False)

    wb = writer.book
    ws = writer.sheets['Resultados']

    # Formats
    title_fmt = wb.add_format({
        'bold':     True,
        'font_size': 14,
        'align':    'center',
        'valign':   'vcenter'
    })
    header_fmt = wb.add_format({
        'bold':      True,
        'bg_color':  '#BDD7EE',
        'border':    1,
        'border_color':'#000000',
        'align':     'center',
        'valign':    'vcenter',
        'text_wrap': True
    })
    body_fmt = wb.add_format({
        'border':       1,
        'border_color': '#000000',
        'valign':       'top',
        'text_wrap':    True
    })
    date_fmt = wb.add_format({
    'num_format': 'yyyy-mm-dd',
    'border':       1,
    'border_color': '#000000',
    'valign':       'top'
   })


    max_row, max_col = df.shape

    # 1) Report title in row 0
    ws.merge_range(0, 0, 0, max_col-1,
                   "Resumen de Resultados",
                   title_fmt)
    ws.set_row(0, 40)     # make title row tall

    # 2) Header row in row 1
    for col_num, col_name in enumerate(df.columns):
        ws.write(1, col_num,
                 col_name.replace('_',' ').title(),
                 header_fmt)
    ws.set_row(1, 30)     # make header row tall

    # 3) Body rows, apply border+wrap and dynamic height
    #    Data actually starts on worksheet row 2 (zero indexing)
    
    fecha_col = list(df.columns).index("Fecha")
    for row_idx in range(max_row):
        # write each cell with the body format
        for col_idx in range(max_col):
            value = df.iat[row_idx, col_idx]
            fmt = date_fmt if col_idx == fecha_col else body_fmt
        # if it's a datetime.date use write_datetime, else write()
            if col_idx == fecha_col and isinstance(value, (datetime.date, datetime.datetime)):
                ws.write_datetime(row_idx+2, col_idx, value, fmt)
            else:
                ws.write(row_idx+2, col_idx, value, fmt)

        # compute the row’s height from its max line-count
        line_counts = [
            str(df.iat[row_idx, c]).count('\n') + 1
            for c in range(max_col)
        ]
        max_lines = max(line_counts) if line_counts else 1
        height    = max(15 * max_lines, 20)  # at least 20px
        ws.set_row(row_idx+2, height)

    # 4) Auto-size columns
    for i, col in enumerate(df.columns):
        # include header + all values
        series = df[col].astype(str).tolist() + [col]
        max_len = max(len(s) for s in series) + 2
        ws.set_column(i, i, max_len)

    # # 5) Freeze & filter
    # ws.freeze_panes(2, 0)   # title+header stay in place
    # ws.autofilter(1, 0, max_row+1, max_col-1)

# sound and image to notify completion

# 1) Play a WAV notification (non-blocking)
if getattr(sys, "frozen", False):
    # we’re in a PyInstaller bundle
    base_dir = sys._MEIPASS
else:
    # normal Python execution
    base_dir = os.path.dirname(__file__)

try:
    sound_file = os.path.join(base_dir, "complete.wav")
    winsound.PlaySound(sound_file,
                   winsound.SND_FILENAME | winsound.SND_ASYNC)
except Exception as e:
    print("⚠️  Could not play sound:", e)

# 2) Show “All done!” dialog
try:
    root = tk.Tk()
    root.title("¡Listo!")
    root.attributes("-topmost", True)
    root.lift()

    frm = ttk.Frame(root, padding=20)
    frm.pack()
    img_path = os.path.join(base_dir, "complete.jpeg")

    if os.path.exists(img_path):
        img = Image.open(img_path)
        photo = ImageTk.PhotoImage(img)
        ttk.Label(frm, image=photo).pack(pady=(0,10))
    else:
        print("⚠️  complete.jpeg not found at", img_path)

    ttk.Label(frm,
        text="¡El proceso ha terminado correctamente!",
        font=("Segoe UI", 12, "bold")
    ).pack()

    ttk.Button(frm, text="OK", command=root.destroy).pack(pady=(15,0))

    # center on screen
    root.update_idletasks()
    w, h = root.winfo_width(), root.winfo_height()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"{w}x{h}+{x}+{y}")

    root.mainloop()
except Exception as e:
    print("⚠️  Could not show dialog:", e)
