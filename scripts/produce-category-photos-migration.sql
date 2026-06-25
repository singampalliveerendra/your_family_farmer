-- Card #9: explicit produce category (Vegetables/Fruits/Grains/Leafy) chosen by
-- the farmer in the add-produce form, so search no longer relies only on guessing
-- the category from the crop name.
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS category text;

-- Card #12: multiple photos per produce. image_url stays the cover photo; the
-- full set (cover + extras) is stored here for the consumer gallery.
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS image_urls jsonb;
