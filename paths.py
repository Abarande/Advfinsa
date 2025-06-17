# paths.py
import sys, os

if getattr(sys, "frozen", False):
    # Estamos corriendo dentro del bundle onefile,
    # argv[0] es la ruta al exe desplegado en dist/
    PROJECT_ROOT = os.path.dirname(sys.argv[0])
else:
    # Modo desarrollo: ruta al script fuente
    PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

JS_FOLDER = os.path.join(PROJECT_ROOT, "captcha_solver")
