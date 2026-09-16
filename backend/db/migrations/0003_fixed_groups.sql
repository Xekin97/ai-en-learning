INSERT INTO wordweave.entitlement_groups(code, rolling_quota_limit, max_entries_per_run)
VALUES
  ('visitor', 5, 5),
  ('registered', NULL, 5),
  ('pro', NULL, 5),
  ('plus', NULL, 5);

INSERT INTO wordweave.group_lengths(group_code, length_code)
SELECT group_code, length_code
FROM (VALUES ('visitor'), ('registered'), ('pro'), ('plus')) AS groups(group_code)
CROSS JOIN (VALUES ('short'), ('medium'), ('long'), ('xlong')) AS lengths(length_code);

