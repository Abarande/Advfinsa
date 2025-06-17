import sys
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import os
import winsound

HERE = os.path.dirname(sys.argv[0])

# 1) Play a WAV notification (non-blocking)
try:
    sound_file = os.path.join(os.path.dirname(sys.argv[0]), "complete.wav")
    winsound.PlaySound(sound_file,
                   winsound.SND_FILENAME | winsound.SND_ASYNC)
except Exception as e:
    print("⚠️  Could not play sound:", e)

# 2) Show “All done!” dialog
try:
    root = tk.Tk()
    root.title("¡Listo!")
    root.attributes("-topmost", True)
    root.lift()

    frm = ttk.Frame(root, padding=20)
    frm.pack()

    img_path = os.path.join(HERE, "complete.jpeg")
    if os.path.exists(img_path):
        img = Image.open(img_path)
        photo = ImageTk.PhotoImage(img)
        ttk.Label(frm, image=photo).pack(pady=(0,10))
    else:
        print("⚠️  complete.jpeg not found at", img_path)

    ttk.Label(frm,
        text="¡El proceso ha terminado correctamente!",
        font=("Segoe UI", 12, "bold")
    ).pack()

    ttk.Button(frm, text="OK", command=root.destroy).pack(pady=(15,0))

    # center on screen
    root.update_idletasks()
    w, h = root.winfo_width(), root.winfo_height()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"{w}x{h}+{x}+{y}")

    root.mainloop()
except Exception as e:
    print("⚠️  Could not show dialog:", e)
