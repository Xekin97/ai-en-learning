-- CAP-210 / DATA-205: configuration only; reminder history stays in the browser.
ALTER TABLE wordweave.platform_notices
  ADD COLUMN remind_once boolean NOT NULL DEFAULT false;
