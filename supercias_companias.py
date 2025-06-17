import os, subprocess
from retry import retry
from subprocess import TimeoutExpired
from paths import JS_FOLDER
from utils import run_node 
NODE_SCRIPT = os.path.join(JS_FOLDER, "index_supercias_companias.js")

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def get_supercias_compania(cedula: str) -> str:
    proc = run_node(
        ["node", NODE_SCRIPT, cedula],
        capture_output=True,
        encoding="utf-8",
        text=True,
        timeout=120
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS solver failed: {proc.stderr.strip()}")
    return proc.stdout.strip()

if __name__ == "__main__":
    # assume this Python file lives at .../advfinsa/

    for test_id in ["0990071969001","1391791119001" ]:
        status = get_supercias_compania(test_id)
        print(f"{test_id} → {status}")
