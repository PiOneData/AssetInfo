-- Migration: Add network monitoring tables
-- Description: Creates tables for WiFi device tracking, network alerts, and agent API keys
-- Date: 2025-12-09

-- WiFi Devices Table
CREATE TABLE IF NOT EXISTS wifi_devices (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR NOT NULL,
  mac_address VARCHAR NOT NULL,
  ip_address VARCHAR NOT NULL,
  hostname TEXT,
  manufacturer TEXT,
  asset_id VARCHAR,
  asset_name TEXT,
  is_authorized BOOLEAN DEFAULT false,
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  connection_duration INTEGER DEFAULT 0,
  device_type TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Network Alerts Table
CREATE TABLE IF NOT EXISTS network_alerts (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR NOT NULL,
  mac_address VARCHAR NOT NULL,
  ip_address VARCHAR NOT NULL,
  hostname TEXT,
  manufacturer TEXT,
  detected_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  device_info JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Network Agent API Keys Table
CREATE TABLE IF NOT EXISTS network_agent_keys (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  api_key VARCHAR NOT NULL UNIQUE,
  agent_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for wifi_devices
CREATE INDEX IF NOT EXISTS idx_wifi_devices_tenant ON wifi_devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wifi_devices_mac ON wifi_devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_wifi_devices_active ON wifi_devices(tenant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wifi_devices_tenant_mac ON wifi_devices(tenant_id, mac_address);

-- Create indexes for network_alerts
CREATE INDEX IF NOT EXISTS idx_network_alerts_tenant ON network_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_network_alerts_status ON network_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_network_alerts_detected ON network_alerts(detected_at);

-- Create indexes for network_agent_keys
CREATE INDEX IF NOT EXISTS idx_network_agent_keys_tenant ON network_agent_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_network_agent_keys_api_key ON network_agent_keys(api_key);

-- Add comments
COMMENT ON TABLE wifi_devices IS 'Tracks WiFi devices detected on the network';
COMMENT ON TABLE network_alerts IS 'Network security alerts for unauthorized devices';
COMMENT ON TABLE network_agent_keys IS 'API keys for network monitoring agents';

COMMENT ON COLUMN wifi_devices.mac_address IS 'Device MAC address';
COMMENT ON COLUMN wifi_devices.is_authorized IS 'Whether device is authorized to be on network';
COMMENT ON COLUMN wifi_devices.connection_duration IS 'Total connection time in seconds';

COMMENT ON COLUMN network_alerts.status IS 'Alert status: new, acknowledged, resolved';
