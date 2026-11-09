#!/usr/bin/env python3
"""Reject Debian packages that ordinary users cannot traverse or launch."""
import hashlib
import json
import subprocess
import sys
import tarfile


def verify(filename):
    process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', filename], stdout=subprocess.PIPE)
    entries = {}
    errors = []
    actual = {}
    expected = None
    with tarfile.open(fileobj=process.stdout, mode='r|') as archive:
        for entry in archive:
            name = entry.name.removeprefix('./').rstrip('/')
            entries[name] = entry
            if entry.isfile() and name.startswith('opt/inky/resources/app/'):
                data = archive.extractfile(entry).read()
                actual[name.removeprefix('opt/inky/resources/app/')] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            if name == 'opt/inky/resources/app-manifest.json':
                expected = json.load(archive.extractfile(entry))
            if entry.isdir() and entry.mode & 0o005 != 0o005:
                errors.append(f'Directory inaccessible to ordinary users: {name} ({entry.mode:o})')
            if entry.isfile() and not entry.mode & 0o004:
                errors.append(f'File unreadable by ordinary users: {name} ({entry.mode:o})')
            if entry.uid != 0 or entry.gid != 0:
                errors.append(f'Unexpected owner: {name} ({entry.uid}:{entry.gid})')
    if process.wait() != 0:
        errors.append('Could not read package contents')
    if expected is None or actual != expected:
        errors.append('Application content differs from the verified build manifest')
    if 'opt/inky/resources/app.asar' in entries:
        errors.append('Unexpected ASAR in directory-based distribution')
    for name in ['opt/inky/Inky',
                 'opt/inky/resources/app/main-process/ink/inklecate_linux',
                 'opt/inky/resources/app/main-process/ink/inkjs-compatible/inklecate_linux']:
        entry = entries.get(name)
        if entry is None or not entry.isfile() or entry.mode & 0o005 != 0o005:
            errors.append('Required executable is unavailable: ' + name)
    sandbox = entries.get('opt/inky/chrome-sandbox')
    if sandbox is None or sandbox.mode != 0o4755:
        errors.append('Electron sandbox must have mode 4755')
    launcher = entries.get('usr/bin/inky')
    if launcher is None or not launcher.issym() or launcher.linkname != '/opt/inky/Inky':
        errors.append('Application launcher is missing or incorrect')
    if 'usr/share/applications/inky.desktop' not in entries:
        errors.append('Desktop entry is missing')
    if errors:
        raise ValueError('\n'.join(errors))
    return len(entries)

if __name__ == '__main__':
    try:
        print(f'PASS: {verify(sys.argv[1])} package entries checked for SHA256 content, ownership, readability and launch permissions')
    except (ValueError, OSError, tarfile.TarError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
