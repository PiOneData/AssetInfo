CREATE TABLE IF NOT EXISTS asset_software_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL,
  asset_id varchar NOT NULL,
  software_asset_id varchar NOT NULL,
  created_by varchar,
  created_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, asset_id, software_asset_id),
  CONSTRAINT fk_asset_device FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_software FOREIGN KEY (software_asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_software_links_asset
  ON asset_software_links (asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_software_links_software
  ON asset_software_links (software_asset_id);
