-- The account store: every record the account API keeps (see worker/account-api.mjs), one row each.
--   k     the record's name: email/…, user/…, session/…/…, fail/…
--   v     its value, as JSON text
--   etag  changes on every write; a write that names an ETag only lands if it still matches
--   meta  what Netlify Blobs kept beside the value, for records moved from there (JSON), else NULL
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY NOT NULL,
  v TEXT NOT NULL,
  etag TEXT NOT NULL,
  meta TEXT
);
