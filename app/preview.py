"""Tkinter stand-in for the SPI display, so the app can run without hardware.

Exposes the same surface the luma device does - .width, .height, .display() -
so display_art.py drives it through exactly the same code path.
"""
import tkinter as tk

from PIL import ImageTk


class PreviewDisplay:
    def __init__(self, width: int, height: int, scale: int = 2):
        self.width = width
        self.height = height
        self.closed = False
        self._scale = scale
        self._photo = None

        self.root = tk.Tk()
        self.root.title(f"Album art preview - {width}x{height}")
        self.root.configure(bg="#14161a")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # Dark bezel around the "panel" so the framing matches the real module.
        frame = tk.Frame(self.root, bg="#000000", bd=0)
        frame.pack(padx=16, pady=(16, 6))
        self._label = tk.Label(frame, bg="#000000", bd=0)
        self._label.pack(padx=6, pady=6)

        self._caption = tk.Label(
            self.root,
            text=f"{width}x{height} - waiting",
            bg="#14161a",
            fg="#7f858f",
            font=("Consolas", 9),
        )
        self._caption.pack(pady=(0, 14))

    def _on_close(self) -> None:
        self.closed = True
        self.root.destroy()

    def display(self, img) -> None:
        if self.closed:
            return
        shown = img.convert("RGB").resize(
            (self.width * self._scale, self.height * self._scale)
        )
        self._photo = ImageTk.PhotoImage(shown)
        self._label.configure(image=self._photo)
        self.pump()

    def caption(self, text: str) -> None:
        if not self.closed:
            self._caption.configure(text=f"{self.width}x{self.height} - {text}")

    def pump(self) -> None:
        if self.closed:
            return
        try:
            self.root.update()
        except tk.TclError:
            self.closed = True
