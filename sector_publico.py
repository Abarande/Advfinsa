import subprocess
import sys

def consulta_dependencia(cedula, fecha):
    """
    Llama al script Node.js y devuelve la línea final con el campo `registro`.
    Si Node falla, captura su stdout/stderr y devuelve "ERROR".
    """
    script = "captcha_solver/index_dependencia_gob.js"
    try:
        proc = subprocess.run(
            ["node", script, cedula, fecha],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8",
            errors="ignore",
            check=False  # we'll handle non-zero ourselves
        )
    except Exception as e:
        print(f"ℹ️ Error al lanzar Node.js: {e}", file=sys.stderr)
        return "ERROR"

    if proc.returncode != 0:
        print(f"❌ Node.js exited {proc.returncode}", file=sys.stderr)
        if proc.stdout:
            print("=== Node stdout ===", file=sys.stderr)
            print(proc.stdout, file=sys.stderr)
        if proc.stderr:
            print("=== Node stderr ===", file=sys.stderr)
            print(proc.stderr, file=sys.stderr)
        return "ERROR"

    # Split stdout into lines, ignore any empty trailing
    lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
    if not lines:
        print("⚠️ Node produced no output", file=sys.stderr)
        return "ERROR"

    # Last non-empty line is our registro
    return lines[-1].strip()

if __name__ == "__main__":
    ejemplos = [
        ("0925647851", "08/12/2002"),
        ("0908890452", "03/11/1977"),
    ]

    for ced, fech in ejemplos:
        print(f"Consultando dependencia para cédula {ced} en fecha {fech}...")
        resultado = consulta_dependencia(ced, fech)
        print("Registro:", resultado)
