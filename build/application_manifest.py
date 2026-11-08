#!/usr/bin/env python3
"""Record application content before packaging; verify_deb checks the final archive."""
import hashlib
import json
import sys
from pathlib import Path
resources = Path(sys.argv[1])
app = resources / 'app'
assert (app / 'package.json').is_file()
manifest = {}
for path in sorted(app.rglob('*')):
    if path.is_file():
        data = path.read_bytes()
        manifest[path.relative_to(app).as_posix()] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
(resources / 'app-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
