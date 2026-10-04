# Provider-workspace historical backup

The original `before.tar.gz` is preserved unchanged in the local workspace.
Git stores it as four binary parts to keep each archive file at most 32 MiB.
These parts preserve the exact compressed bytes; no evidence was removed or
repacked. `before-archive-parts.json` records the size and SHA-256 of the original
and every part.

To restore the archive after cloning, run from this directory:

```sh
python3 restore-before-archive.py
```

The script validates all parts and the combined archive before replacing the
temporary output. It leaves an existing matching archive untouched and refuses
to overwrite an existing archive with a different digest. The restored archive
is ignored by Git. Existing historical evidence references to `before.tar.gz`
continue to refer to exactly the same content.
