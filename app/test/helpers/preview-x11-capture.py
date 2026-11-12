#!/usr/bin/env python3
"""Capture a TrueColor diagnostic window using XGetImage, without querying colormaps.

Some maximized Electron windows make xwd's color-table query fail with BadColor.
This uses the image's actual RGB masks and writes a standard XWD with no color table.
"""
import ctypes as C
import struct
import sys
from pathlib import Path


class XImage(C.Structure):
    _fields_ = [('width', C.c_int), ('height', C.c_int), ('xoffset', C.c_int),
                ('format', C.c_int), ('data', C.c_void_p), ('byte_order', C.c_int),
                ('bitmap_unit', C.c_int), ('bitmap_bit_order', C.c_int),
                ('bitmap_pad', C.c_int), ('depth', C.c_int), ('bytes_per_line', C.c_int),
                ('bits_per_pixel', C.c_int), ('red_mask', C.c_ulong),
                ('green_mask', C.c_ulong), ('blue_mask', C.c_ulong)]


lib = C.CDLL('libX11.so.6')
lib.XOpenDisplay.restype = C.c_void_p
lib.XGetGeometry.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong),
                            C.POINTER(C.c_int), C.POINTER(C.c_int),
                            C.POINTER(C.c_uint), C.POINTER(C.c_uint),
                            C.POINTER(C.c_uint), C.POINTER(C.c_uint)]
lib.XGetImage.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_int,
                         C.c_uint, C.c_uint, C.c_ulong, C.c_int]
lib.XGetImage.restype = C.POINTER(XImage)
lib.XDestroyImage.argtypes = [C.POINTER(XImage)]
lib.XCloseDisplay.argtypes = [C.c_void_p]
display = lib.XOpenDisplay(None)
if not display:
    raise RuntimeError('X11 display unavailable')
window = int(sys.argv[1], 0)
root, x, y = C.c_ulong(), C.c_int(), C.c_int()
width, height, border, depth = (C.c_uint() for _ in range(4))
if not lib.XGetGeometry(display, window, C.byref(root), C.byref(x), C.byref(y),
                        C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
    raise RuntimeError('XGetGeometry failed')
image = lib.XGetImage(display, window, 0, 0, width.value, height.value, C.c_ulong(-1), 2)
if not image:
    raise RuntimeError('XGetImage failed')
i = image.contents
name = b'Inky diagnostic window\0'
header = [100 + len(name), 7, i.format, i.depth, i.width, i.height, i.xoffset,
          i.byte_order, i.bitmap_unit, i.bitmap_bit_order, i.bitmap_pad,
          i.bits_per_pixel, i.bytes_per_line, 4, i.red_mask, i.green_mask, i.blue_mask,
          8, 256, 0, i.width, i.height, x.value, y.value, border.value]
pixels = C.string_at(i.data, i.bytes_per_line * i.height)
Path(sys.argv[2]).write_bytes(struct.pack('>25I', *header) + name + pixels)
lib.XDestroyImage(image)
lib.XCloseDisplay(display)
