import subprocess
import shlex
from retry import retry
from subprocess import TimeoutExpired
from paths import JS_FOLDER
import os
from utils import run_node 
NODE_SCRIPT = os.path.join(JS_FOLDER, "index_declaraciones.js")

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(Exception,)
)
def get_records_total(cedula: str, nombre: str) -> int:
    """
    Llama al script Node.js que consultamos en la Contraloría
    y extrae el `recordsTotal` de su salida.
    """

    # Ejecutamos y capturamos stdout/stderr
    proc = run_node(
        ["node", NODE_SCRIPT, cedula, nombre],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="ignore",
        timeout=120
    )

    if proc.returncode != 0:
        raise RuntimeError(
            f"Node.js script failed (exit {proc.returncode}):\n"
            f"STDERR:\n{proc.stderr.strip()}"
        )

    # La última línea debe ser algo como "🎯 recordsTotal = 7"
    lines = [l for l in proc.stdout.splitlines() if l.strip()]
    if not lines:
        raise RuntimeError("No output from Node.js script")
    last = lines[-1]
    # Parseamos la parte numérica
    if "recordsTotal" not in last:
        raise RuntimeError(f"Unexpected output: {last}")
    try:
        total = int(last.split("=")[-1].strip())
    except ValueError:
        raise RuntimeError(f"Cannot parse number from: {last}")
    return total

if __name__ == "__main__":
    # Ejemplo de uso:
    ejemplo = ("1709705675", "Herrera Oramas Mary Paz")
    cedula, nombre = ejemplo
    print(f"Consultando {cedula} – {nombre} …")
    total = get_records_total(cedula, nombre)
    print("📄 recordsTotal =", total)
