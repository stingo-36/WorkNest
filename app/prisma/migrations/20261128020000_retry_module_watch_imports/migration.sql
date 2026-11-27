-- The previous parser recorded these issues as processed without adding resources.
-- Let the new parser retry them while preserving successful and undone imports.
DELETE FROM "GmailImport"
WHERE "added" = 0
  AND NOT "undone"
  AND "subject" ~* '^Drupal Module Watch(\M|$)';
