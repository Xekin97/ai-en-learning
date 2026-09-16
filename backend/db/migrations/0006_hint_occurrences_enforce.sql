DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM wordweave.batch_targets target
    WHERE NOT EXISTS (
      SELECT 1 FROM wordweave.hint_occurrences occurrence WHERE occurrence.target_id = target.id
    ) OR NOT EXISTS (
      SELECT 1 FROM wordweave.passage_occurrences occurrence WHERE occurrence.target_id = target.id
    )
  ) THEN
    RAISE EXCEPTION 'cannot enforce occurrence completeness while a batch target is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM wordweave.batch_targets target
    JOIN wordweave.hint_occurrences occurrence
      ON occurrence.target_id = target.id AND occurrence.occurrence_order = 0
    WHERE occurrence.surface <> target.hint_surface
       OR occurrence.start_offset <> target.hint_start
       OR occurrence.end_offset <> target.hint_end
  ) THEN
    RAISE EXCEPTION 'hint compatibility columns differ from the first canonical occurrence';
  END IF;
END
$validation$;

CREATE OR REPLACE FUNCTION wordweave.validate_batch_completeness() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
DECLARE
  target_count integer;
  missing_hint_count integer;
  missing_passage_count integer;
  expected integer;
  checked_batch uuid;
BEGIN
  IF TG_TABLE_NAME = 'learning_batches' THEN
    checked_batch := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_batch := COALESCE(NEW.batch_id, OLD.batch_id);
  END IF;

  SELECT expected_target_count INTO expected
  FROM wordweave.learning_batches
  WHERE id = checked_batch;
  IF expected IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO target_count
  FROM wordweave.batch_targets
  WHERE batch_id = checked_batch;

  SELECT count(*) INTO missing_hint_count
  FROM wordweave.batch_targets target
  WHERE target.batch_id = checked_batch
    AND NOT EXISTS (
      SELECT 1 FROM wordweave.hint_occurrences occurrence WHERE occurrence.target_id = target.id
    );

  SELECT count(*) INTO missing_passage_count
  FROM wordweave.batch_targets target
  WHERE target.batch_id = checked_batch
    AND NOT EXISTS (
      SELECT 1 FROM wordweave.passage_occurrences occurrence WHERE occurrence.target_id = target.id
    );

  IF target_count <> expected OR missing_hint_count <> 0 OR missing_passage_count <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'learning_batches_targets_complete';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER learning_batches_targets_complete_from_hint_occurrence
AFTER INSERT OR UPDATE OR DELETE ON wordweave.hint_occurrences
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_batch_completeness();

CREATE CONSTRAINT TRIGGER learning_batches_targets_complete_from_passage_occurrence
AFTER INSERT OR UPDATE OR DELETE ON wordweave.passage_occurrences
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_batch_completeness();

