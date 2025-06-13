import os, subprocess
from retry import retry
from subprocess import TimeoutExpired

@retry(
    max_attempts=3,
    initial_delay=2.0,
    backoff_factor=2.0,
    exceptions=(RuntimeError, TimeoutExpired)
)
def get_deuda_from_js(cedula: str) -> str:
    proc = subprocess.run(
        ["node", "captcha_solver/index_deudas.js", cedula],
        capture_output=True, text=True, timeout=120
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS solver failed: {proc.stderr.strip()}")
    return proc.stdout.strip()

if __name__ == "__main__":
    # assume this Python file lives at .../advfinsa/

    for test_id in ["0990071969001", "0912345678"]:
        status = get_deuda_from_js(test_id)
        print(f"{test_id} → {status}")
