import os, subprocess

def get_deuda_from_js(cedula: str, script_path: str) -> str:
    proc = subprocess.run(
        ["node", script_path, cedula],
        capture_output=True, text=True, timeout=120
    )
    if proc.returncode != 0:
        raise RuntimeError(f"JS solver failed: {proc.stderr.strip()}")
    return proc.stdout.strip()

if __name__ == "__main__":
    # assume this Python file lives at .../advfinsa/
    base_dir   = os.path.dirname(__file__)
    js_relpath = os.path.join("captcha_solver", "index_deudas.js")
    js_path    = os.path.join(base_dir, js_relpath)

    for test_id in ["0990071969001", "0912345678"]:
        status = get_deuda_from_js(test_id, script_path=js_path)
        print(f"{test_id} → {status}")
