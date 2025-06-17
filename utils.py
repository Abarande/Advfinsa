# file: utils.py
import subprocess
import sys

if sys.platform == "win32":
    CREATE_NO_WINDOW = 0x08000000

    def run_node(cmd, **kwargs):
        """
        Like subprocess.run, but hides the child console on Windows.
        """
        kwargs.setdefault("creationflags", CREATE_NO_WINDOW)

        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        kwargs.setdefault("startupinfo", si)

        return subprocess.run(cmd, **kwargs)

else:
    run_node = subprocess.run
