-- PricePin initial schema: PostGIS + restaurants + menu_items (per README & architecture plan)
-- Run in Supabase SQL Editor (region: Singapore).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants: the "pins" on the map (GEOGRAPHY for nearby search)
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  is_vat_inclusive BOOLEAN DEFAULT TRUE,
  service_charge_percent NUMERIC(4, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Menu items: extracted by Mistral AI (category, item_name, variant_name, price, description, image_url)
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  category TEXT,
  item_name TEXT NOT NULL,
  variant_name TEXT,
  price NUMERIC(10, 2) NOT NULL,
  description TEXT,
  image_url TEXT,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spatial index for fast nearby search
CREATE INDEX IF NOT EXISTS idx_restaurants_location
ON restaurants USING GIST (location);

-- Optional: B-tree indexes for dish search and lookups
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_item_name ON menu_items(item_name);

-- RLS: public read; writes via authenticated (including anon) or service role
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "Public read menu_items" ON menu_items FOR SELECT USING (true);
-- Add insert/update policies for anon or service role as needed for your auth setup
