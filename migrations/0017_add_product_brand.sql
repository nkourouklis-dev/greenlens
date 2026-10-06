-- The brand, kept apart from the name. product_name is "Brand Name" as the
-- scan history has always shown it; the brand on its own is what the product
-- page prints under the title. Read from the front photo (identify) or, for
-- products scanned before this column existed, backfilled from the stored
-- front photo by /api/admin/products/backfill-brands.
ALTER TABLE products ADD COLUMN brand TEXT;
