# debug_numpy.py
import os, sys, importlib.util

print("cwd:", os.getcwd())
print("sys.path:")
for p in sys.path:
    print("   ", p)

spec = importlib.util.find_spec("numpy")
print("numpy spec:", spec)
if spec:
    print("numpy origin:", spec.origin)
