import subprocess
import shlex
from retry import retry
from subprocess import TimeoutExpired

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def get_records_total(cedula: str, nombre: str) -> int:
    """
    Llama al script Node.js que consultamos en la Contraloría
    y extrae el `recordsTotal` de su salida.
    """

    # Ejecutamos y capturamos stdout/stderr
    proc = subprocess.run(
        ["node", "captcha_solver/index_declaraciones.js", cedula, nombre],
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
