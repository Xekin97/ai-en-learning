package migrations

import "embed"

// Files contains the immutable forward-only SQL migrations.
//
//go:embed *.sql
var Files embed.FS
