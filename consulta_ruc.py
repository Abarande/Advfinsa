import subprocess
from retry import retry
from subprocess import TimeoutExpired
from typing import Tuple
import os
from paths import JS_FOLDER
from utils import run_node 


NODE_SCRIPT = os.path.join(JS_FOLDER, "index_consulta_ruc.js")
# keep track of which cédulas we've retried for 'REVISAR'
_REVISAR_RETRIED: dict[str, bool] = {}

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def get_consultaRUC_from_js(cedula: str) -> Tuple[str, str]:
    proc = run_node(
        ["node", NODE_SCRIPT, cedula],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS solver failed: {proc.stderr.strip()}")

    lines = proc.stdout.strip().splitlines()
    if not lines:
        raise RuntimeError("JS solver returned no output")

    estado    = lines[0].strip()
    actividad = lines[1].strip() if len(lines) > 1 else ""

    # if it's "REVISAR" and we haven't retried this cedula yet → retry once
    if estado.upper() == "REVISAR":
        # need to mutate the module‐level dict
        global _REVISAR_RETRIED  
        if not _REVISAR_RETRIED.get(cedula, False):
            _REVISAR_RETRIED[cedula] = True
            raise RuntimeError("JS returned Estado=REVISAR → retrying once…")
        # otherwise fall through and return the "REVISAR"

    return estado, actividad


if __name__ == "__main__":
    for test_id in ["0908890452001", "1309022935"]:
        try:
            estado, actividad = get_consultaRUC_from_js(test_id)
            print(f"{test_id} → Estado: {estado!r}, Actividad: {actividad!r}")
        except Exception as e:
            print(f"{test_id} → ERROR: {e}")
