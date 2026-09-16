-- CR-040: structural migration only. The explicit offline cutover command owns
-- any authorized cleanup; ordinary migrations must never delete business data.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='wordweave' AND table_name='batch_targets'
        AND column_name='contextual_meaning' AND data_type='text' AND is_nullable='NO') <> 1
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='wordweave' AND table_name='batch_targets' AND column_name='entry_meaning') THEN
    RAISE EXCEPTION 'entry meaning migration requires the verified source column';
  END IF;
  IF EXISTS (SELECT 1 FROM wordweave.generation_drafts) THEN
    RAISE EXCEPTION 'entry meaning migration requires no pre-cutover drafts';
  END IF;
END
$$;

ALTER TABLE wordweave.batch_targets RENAME COLUMN contextual_meaning TO entry_meaning;
