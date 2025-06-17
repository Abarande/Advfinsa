import subprocess, json, sys
from subprocess import TimeoutExpired
from retry import retry
from paths import JS_FOLDER
import os
from utils import run_node 

NODE_SCRIPT = os.path.join(JS_FOLDER,"index_supercias_personas.js")

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def get_supercias_personas(cedula: str):
    """
    Calls the Node scraper which now prints exactly two lines:
      1) JSON array of administracion
      2) JSON array of accionistas
    Returns a tuple: (administracion_list, accionista_list)
    Raises RuntimeError if output isn’t exactly two JSON arrays.
    """
    proc = run_node(
        ["node", NODE_SCRIPT, cedula],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=120
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS scraper failed:\n{proc.stderr.strip()}")

    # split out only non-empty lines
    lines = [l for l in proc.stdout.splitlines() if l.strip()]
    if len(lines) != 2:
        raise RuntimeError(
            f"Unexpected scraper output (expected 2 lines, got {len(lines)}):\n"
            + proc.stdout
        )

    try:
        administracion = json.loads(lines[0])
        accionistas    = json.loads(lines[1])
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON from scraper:\n{e}\nOutput:\n{proc.stdout}")

    return administracion, accionistas


if __name__ == "__main__":
    for test_id in ["0914788245", "0925647851"]:
        try:
            adm, acc = get_supercias_personas(test_id)
            print(f"{test_id} → Admin: {adm}")
            print(f"{test_id} → Accionistas: {acc}")
        except Exception as e:
            print(f"{test_id} → ERROR: {e}", file=sys.stderr)
            sys.exit(1)
