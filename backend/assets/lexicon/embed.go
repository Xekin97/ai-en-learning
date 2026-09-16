package lexicon

import "embed"

// Files are built explicitly by cmd/build-lexicon. They are read-only at runtime.
//
//go:embed wordnet31.json.gz manifest.json NOTICE.txt
var Files embed.FS
