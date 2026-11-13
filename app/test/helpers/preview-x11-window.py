#!/usr/bin/env python3
"""Maximize or resize only the graphical test window through its window manager."""
import ctypes as C
import sys


class ClientMessage(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int),
                ('display', C.c_void_p), ('window', C.c_ulong), ('message_type', C.c_ulong),
                ('format', C.c_int), ('data', C.c_long * 5)]


class Event(C.Union):
    _fields_ = [('client', ClientMessage), ('padding', C.c_long * 24)]


lib = C.CDLL('libX11.so.6')
lib.XOpenDisplay.restype = C.c_void_p
lib.XDefaultRootWindow.argtypes = [C.c_void_p]
lib.XDefaultRootWindow.restype = C.c_ulong
lib.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
lib.XInternAtom.restype = C.c_ulong
lib.XSendEvent.argtypes = [C.c_void_p, C.c_ulong, C.c_int, C.c_long, C.POINTER(Event)]
lib.XFlush.argtypes = [C.c_void_p]
lib.XCloseDisplay.argtypes = [C.c_void_p]
display = lib.XOpenDisplay(None)
if not display:
    raise RuntimeError('X11 display unavailable')
window = int(sys.argv[1], 0)
atom = lambda name: lib.XInternAtom(display, name.encode(), 0)
event = Event()
event.client.type = 33
event.client.send_event = 1
event.client.display = display
event.client.window = window
event.client.message_type = atom('_NET_WM_STATE')
event.client.format = 32
resize = len(sys.argv) == 4
event.client.data[:] = [0 if resize else 1, atom('_NET_WM_STATE_MAXIMIZED_VERT'), atom('_NET_WM_STATE_MAXIMIZED_HORZ'), 2, 0]
lib.XSendEvent(display, lib.XDefaultRootWindow(display), 0, (1 << 19) | (1 << 20), C.byref(event))
if resize:
    event.client.message_type = atom('_NET_MOVERESIZE_WINDOW')
    event.client.data[:] = [(1 << 10) | (1 << 11) | (2 << 12), 0, 0, int(sys.argv[2]), int(sys.argv[3])]
    lib.XSendEvent(display, lib.XDefaultRootWindow(display), 0, (1 << 19) | (1 << 20), C.byref(event))
lib.XFlush(display)
lib.XCloseDisplay(display)
