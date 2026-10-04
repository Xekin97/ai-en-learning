"""Restore the exact original provider-workspace backup from Git-stored parts."""
from pathlib import Path
import hashlib
import json
import os
import tempfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / "before-archive-parts.json").read_text())
target = root / manifest["original"]

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

if target.exists():
    if target.stat().st_size != manifest["bytes"] or digest(target) != manifest["sha256"]:
        raise SystemExit("Existing archive differs; refusing to overwrite it.")
    print("Original archive already present and verified.")
    raise SystemExit(0)

fd, temporary = tempfile.mkstemp(prefix=".restore-before-", dir=root)
try:
    combined = hashlib.sha256()
    size = 0
    with os.fdopen(fd, "wb") as output:
        for item in manifest["parts"]:
            data = (root / item["file"]).read_bytes()
            if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise SystemExit("Archive part failed verification: " + item["file"])
            output.write(data)
            combined.update(data)
            size += len(data)
    if size != manifest["bytes"] or combined.hexdigest() != manifest["sha256"]:
        raise SystemExit("Combined archive failed verification.")
    os.link(temporary, target)
    print("Restored and verified " + target.name)
finally:
    Path(temporary).unlink(missing_ok=True)
