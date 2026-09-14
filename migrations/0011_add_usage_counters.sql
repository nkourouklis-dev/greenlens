-- What the app spent, counted where it spends it.
--
-- Three calls cost money on a scan of a product nobody has scanned before:
-- one Azure Read transaction, one Workers AI vision call to identify the
-- product, one Workers AI text call to analyse the label. A scan of a
-- barcode already in the catalogue costs nothing — it is answered from D1
-- before a photo is ever requested.
--
-- Nobody could see any of that. The Cloudflare and Azure dashboards bill
-- the account, not the feature, and they say what was spent after it was
-- spent. This table is the app's own count, per service, per day, so an
-- alarm can fire while there is still free allowance left to protect.
--
-- One row per day per service rather than one row per call: the question
-- being asked is "how much of this month's allowance is gone", never "which
-- request was it", and a row-per-call table for a free-tier app is a table
-- that grows for no reader.
--
-- Days are UTC, matching how both providers reset their allowances, so a
-- month here is the same month they bill.

CREATE TABLE IF NOT EXISTS usage_counters (
  -- YYYY-MM-DD, UTC.
  day TEXT NOT NULL,
  -- azure_ocr | workers_ai_vision | workers_ai_text
  service TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, service)
);

-- Every read is "this day" or "this month", both of which are a range scan
-- over the leading key column, so the primary key already serves them.
