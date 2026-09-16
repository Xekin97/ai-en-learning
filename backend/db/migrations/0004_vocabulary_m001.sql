-- The migration runner handles this immutable data migration specially: it verifies
-- assets/vocabulary/english-words.json, imports all entries in one transaction, and
-- only then records this migration version. Keeping the payload as the exact JSON
-- asset avoids maintaining a second 13,860-row SQL representation.

