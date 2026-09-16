-- name: SearchVocabulary :many
SELECT entry
FROM wordweave.vocabulary_entries
WHERE snapshot_id = (SELECT id FROM wordweave.vocabulary_snapshots WHERE version = 'm001')
  AND lower(entry) LIKE '%' || lower(sqlc.arg(query)) || '%'
ORDER BY
  CASE WHEN lower(entry) LIKE lower(sqlc.arg(query)) || '%' THEN 0 ELSE 1 END,
  length(entry),
  entry
LIMIT sqlc.arg(result_limit);

-- name: GetVocabularySnapshot :one
SELECT id, version, btrim(sha256)::text AS sha256, byte_size, entry_count, imported_at
FROM wordweave.vocabulary_snapshots
WHERE version = 'm001';

-- name: ResolveVocabularyEntries :many
SELECT id, entry
FROM wordweave.vocabulary_entries
WHERE snapshot_id = (SELECT id FROM wordweave.vocabulary_snapshots WHERE version = 'm001')
  AND entry = ANY(sqlc.arg(entries)::text[])
ORDER BY array_position(sqlc.arg(entries)::text[], entry);

