ALTER TABLE outbox ADD COLUMN last_error TEXT;

CREATE TRIGGER prevent_overlap_update BEFORE UPDATE OF start, end ON slots
WHEN EXISTS(
  SELECT 1 FROM slots
  WHERE id <> OLD.id AND start < NEW.end AND end > NEW.start
)
BEGIN SELECT RAISE(ABORT,'overlap'); END;
