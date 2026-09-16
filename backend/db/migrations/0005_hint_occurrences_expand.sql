CREATE TABLE wordweave.hint_occurrences (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  target_id uuid NOT NULL,
  occurrence_order integer NOT NULL,
  surface text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  CONSTRAINT hint_occurrences_target_fk FOREIGN KEY (batch_id, target_id)
    REFERENCES wordweave.batch_targets(batch_id, id) ON DELETE CASCADE,
  CONSTRAINT hint_occurrences_batch_fk FOREIGN KEY (owner_id, batch_id)
    REFERENCES wordweave.learning_batches(owner_id, id) ON DELETE CASCADE,
  CONSTRAINT hint_occurrences_target_order_unique UNIQUE (target_id, occurrence_order),
  CONSTRAINT hint_occurrences_target_span_unique UNIQUE (target_id, start_offset, end_offset),
  CONSTRAINT hint_occurrences_order_nonnegative CHECK (occurrence_order >= 0),
  CONSTRAINT hint_occurrences_surface_nonempty CHECK (surface <> ''),
  CONSTRAINT hint_occurrences_range CHECK (start_offset >= 0 AND start_offset < end_offset)
);

CREATE INDEX hint_occurrences_target_idx
  ON wordweave.hint_occurrences(target_id, occurrence_order);

CREATE FUNCTION wordweave.validate_hint_occurrence() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, wordweave
AS $$
DECLARE
  source_phrase text;
BEGIN
  SELECT hint_phrase INTO source_phrase
  FROM wordweave.batch_targets
  WHERE id = NEW.target_id AND batch_id = NEW.batch_id;

  IF source_phrase IS NULL
     OR NEW.end_offset > char_length(source_phrase)
     OR substring(source_phrase FROM NEW.start_offset + 1 FOR NEW.end_offset - NEW.start_offset) <> NEW.surface THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hint_occurrences_span_matches';
  END IF;

  IF EXISTS (
    SELECT 1 FROM wordweave.hint_occurrences existing
    WHERE existing.target_id = NEW.target_id
      AND existing.id <> NEW.id
      AND int4range(existing.start_offset, existing.end_offset, '[)') && int4range(NEW.start_offset, NEW.end_offset, '[)')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'hint_occurrences_do_not_overlap';
  END IF;
  RETURN NEW;
END
$$;

CREATE CONSTRAINT TRIGGER hint_occurrences_span_matches
AFTER INSERT OR UPDATE ON wordweave.hint_occurrences
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION wordweave.validate_hint_occurrence();

ALTER TABLE wordweave.hint_occurrences OWNER TO wordweave_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON wordweave.hint_occurrences TO wordweave_app;

INSERT INTO wordweave.hint_occurrences(
  owner_id, batch_id, target_id, occurrence_order, surface, start_offset, end_offset
)
SELECT owner_id, batch_id, id, 0, hint_surface, hint_start, hint_end
FROM wordweave.batch_targets;

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM wordweave.batch_targets target
    LEFT JOIN wordweave.hint_occurrences occurrence
      ON occurrence.target_id = target.id AND occurrence.occurrence_order = 0
    WHERE occurrence.id IS NULL
       OR occurrence.surface <> target.hint_surface
       OR occurrence.start_offset <> target.hint_start
       OR occurrence.end_offset <> target.hint_end
  ) THEN
    RAISE EXCEPTION 'hint occurrence backfill is incomplete or differs from compatibility columns';
  END IF;
END
$validation$;
