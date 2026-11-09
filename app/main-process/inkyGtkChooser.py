#!/usr/bin/env python3
"""Inky's optional Linux GTK3 file chooser.

Uses Python's standard library and the system GTK3 library; no PyGObject,
compiler or pip package is required. Communicates over JSON stdin/stdout.
Unlike GtkFileChooserNative, GtkFileChooserDialog is an actual GTK window,
so gtk_window_set_icon_from_file can set Inky's title-bar icon explicitly.
"""
import ctypes as C
import ctypes.util
import json
import os
import sys

GTK_RESPONSE_ACCEPT = -3
GTK_RESPONSE_CANCEL = -6
GTK_FILE_CHOOSER_ACTION_OPEN = 0
GTK_FILE_CHOOSER_ACTION_SAVE = 1
GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER = 2

class GSList(C.Structure):
    pass
GSList._fields_ = [('data', C.c_void_p), ('next', C.POINTER(GSList))]

def bind(lib, name, args, ret):
    fn = getattr(lib, name)
    fn.argtypes = args
    fn.restype = ret
    return fn

def txt(value):
    return str(value).encode('utf-8')

def handle_request(request):
    libgtk = ctypes.util.find_library('gtk-3')
    libglib = ctypes.util.find_library('glib-2.0')
    if not libgtk or not libglib:
        raise RuntimeError('GTK3 runtime libraries are unavailable')
    gtk = C.CDLL(libgtk)
    glib = C.CDLL(libglib)
    # Give the dialog Inky's window class rather than 'python3'.
    bind(glib, 'g_set_prgname', [C.c_char_p], None)(b'inky')
    gdk = C.CDLL(ctypes.util.find_library('gdk-3'))
    bind(gdk, 'gdk_set_program_class', [C.c_char_p], None)(b'Inky')
    if not bind(gtk, 'gtk_init_check', [C.c_void_p, C.c_void_p], C.c_int)(None, None):
        raise RuntimeError('GTK3 cannot connect to a graphical display')

    new_dialog = bind(gtk, 'gtk_file_chooser_dialog_new',
                      [C.c_char_p, C.c_void_p, C.c_int], C.c_void_p)
    add_button = bind(gtk, 'gtk_dialog_add_button',
                      [C.c_void_p, C.c_char_p, C.c_int], C.c_void_p)
    set_icon = bind(gtk, 'gtk_window_set_icon_from_file',
                    [C.c_void_p, C.c_char_p, C.c_void_p], C.c_int)
    set_modal = bind(gtk, 'gtk_window_set_modal', [C.c_void_p, C.c_int], None)
    show_all = bind(gtk, 'gtk_widget_show_all', [C.c_void_p], None)
    realize = bind(gtk, 'gtk_widget_realize', [C.c_void_p], None)
    get_window = bind(gtk, 'gtk_widget_get_window', [C.c_void_p], C.c_void_p)
    dialog_run = bind(gtk, 'gtk_dialog_run', [C.c_void_p], C.c_int)
    destroy = bind(gtk, 'gtk_widget_destroy', [C.c_void_p], None)
    set_folder = bind(gtk, 'gtk_file_chooser_set_current_folder',
                      [C.c_void_p, C.c_char_p], C.c_int)
    set_filename = bind(gtk, 'gtk_file_chooser_set_filename',
                        [C.c_void_p, C.c_char_p], C.c_int)
    set_name = bind(gtk, 'gtk_file_chooser_set_current_name',
                    [C.c_void_p, C.c_char_p], None)
    set_multi = bind(gtk, 'gtk_file_chooser_set_select_multiple',
                     [C.c_void_p, C.c_int], None)
    set_overwrite = bind(gtk, 'gtk_file_chooser_set_do_overwrite_confirmation',
                         [C.c_void_p, C.c_int], None)
    get_filename = bind(gtk, 'gtk_file_chooser_get_filename',
                        [C.c_void_p], C.c_void_p)
    get_filenames = bind(gtk, 'gtk_file_chooser_get_filenames',
                         [C.c_void_p], C.POINTER(GSList))
    set_filter = bind(gtk, 'gtk_file_chooser_add_filter',
                      [C.c_void_p, C.c_void_p], None)
    filter_new = bind(gtk, 'gtk_file_filter_new', [], C.c_void_p)
    filter_name = bind(gtk, 'gtk_file_filter_set_name',
                       [C.c_void_p, C.c_char_p], None)
    filter_pattern = bind(gtk, 'gtk_file_filter_add_pattern',
                          [C.c_void_p, C.c_char_p], None)
    free = bind(glib, 'g_free', [C.c_void_p], None)
    free_list = bind(glib, 'g_slist_free', [C.POINTER(GSList)], None)

    mode = request.get('mode', 'open')
    options = request.get('options') or {}
    props = options.get('properties') or []
    if mode == 'save':
        action = GTK_FILE_CHOOSER_ACTION_SAVE
    elif 'openDirectory' in props and 'openFile' not in props:
        action = GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER
    else:
        action = GTK_FILE_CHOOSER_ACTION_OPEN
    title = str(options.get('title') or ('Save File' if mode == 'save' else 'Open File'))
    # GTK's variadic function is terminated with a NULL button label. Buttons
    # are added explicitly below so the ABI call contains no variadic values.
    widget = new_dialog(txt(title), None, action, None)
    if not widget:
        raise RuntimeError('GTK3 could not create the chooser dialog')
    try:
        add_button(widget, txt(options.get('cancelLabel') or '_Cancel'), GTK_RESPONSE_CANCEL)
        add_button(widget, txt(options.get('buttonLabel') or ('_Save' if mode == 'save' else '_Open')), GTK_RESPONSE_ACCEPT)
        icon = request.get('icon')
        if icon and os.path.isfile(icon):
            if not set_icon(widget, txt(icon), None):
                raise RuntimeError('GTK3 rejected Inky window icon')
        parent_xid = request.get('parentXid')
        if parent_xid and os.environ.get('DISPLAY'):
            try:
                realize(widget)
                gdk_window = get_window(widget)
                get_xid = bind(gdk, 'gdk_x11_window_get_xid', [C.c_void_p], C.c_ulong)
                xid = get_xid(gdk_window)
                x11 = C.CDLL(ctypes.util.find_library('X11'))
                xopen = bind(x11, 'XOpenDisplay', [C.c_char_p], C.c_void_p)
                xtransient = bind(x11, 'XSetTransientForHint',
                                  [C.c_void_p, C.c_ulong, C.c_ulong], C.c_int)
                xflush = bind(x11, 'XFlush', [C.c_void_p], C.c_int)
                xclose = bind(x11, 'XCloseDisplay', [C.c_void_p], C.c_int)
                display = xopen(None)
                if display and xid:
                    try:
                        xtransient(display, xid, int(parent_xid))
                        xflush(display)
                        set_modal(widget, 1)
                    finally:
                        xclose(display)
            except (AttributeError, OSError, ValueError):
                # The chooser still works if X11 window parenting is not
                # possible (e.g. Wayland). Never fail solely for this reason.
                pass
        multi = mode == 'open' and 'multiSelections' in props and action == GTK_FILE_CHOOSER_ACTION_OPEN
        if multi:
            set_multi(widget, 1)
        if mode == 'save':
            set_overwrite(widget, 1)
        suggested = options.get('defaultPath')
        if isinstance(suggested, str) and suggested:
            suggested = os.path.abspath(os.path.expanduser(suggested))
            if os.path.isdir(suggested):
                set_folder(widget, txt(suggested))
            elif mode == 'save':
                directory = os.path.dirname(suggested)
                if os.path.isdir(directory):
                    set_folder(widget, txt(directory))
                set_name(widget, txt(os.path.basename(suggested)))
            elif os.path.isfile(suggested):
                set_filename(widget, txt(suggested))
            elif os.path.isdir(os.path.dirname(suggested)):
                set_folder(widget, txt(os.path.dirname(suggested)))

        for item in options.get('filters') or []:
            extensions = item.get('extensions') or []
            if not extensions:
                continue
            filt = filter_new()
            filter_name(filt, txt(item.get('name') or 'Files'))
            for ext in extensions:
                # Electron's filters allow a bare '*' or file extensions.
                ext = str(ext).lstrip('*.')
                filter_pattern(filt, txt('*' if str(ext) == '' else '*.' + ext))
            set_filter(widget, filt)

        show_all(widget)
        response = dialog_run(widget)
        if response != GTK_RESPONSE_ACCEPT:
            return { 'canceled': True, **({'filePath': ''} if mode == 'save' else {'filePaths': []}) }
        if mode == 'save':
            ptr = get_filename(widget)
            filename = C.string_at(ptr).decode('utf-8') if ptr else ''
            if ptr: free(ptr)
            return {'canceled': not bool(filename), 'filePath': filename}
        if multi:
            paths = []
            head = get_filenames(widget)
            node = head
            while node:
                ptr = node.contents.data
                if ptr:
                    paths.append(C.string_at(ptr).decode('utf-8'))
                    free(ptr)
                node = node.contents.next
            if head: free_list(head)
        else:
            ptr = get_filename(widget)
            paths = [C.string_at(ptr).decode('utf-8')] if ptr else []
            if ptr: free(ptr)
        return {'canceled': not bool(paths), 'filePaths': paths}
    finally:
        destroy(widget)

def main():
    try:
        request = json.loads(sys.stdin.read())
        if not isinstance(request, dict):
            raise ValueError('Expected JSON object')
        result = handle_request(request)
        sys.stdout.write(json.dumps(result, ensure_ascii=False) + '\n')
        return 0
    except Exception as error:
        sys.stderr.write('Inky GTK chooser: ' + str(error) + '\n')
        return 2

if __name__ == '__main__':
    sys.exit(main())
