-- Tabla de errores de faqture-api (multi-cliente)
CREATE TABLE IF NOT EXISTS faqture_errors (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(100) NOT NULL,
  client_name VARCHAR(200),
  error_type VARCHAR(50) NOT NULL,
  document_ref VARCHAR(100),
  error_message TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqture_errors_client ON faqture_errors(client_id);
CREATE INDEX IF NOT EXISTS idx_faqture_errors_resolved ON faqture_errors(client_id, resolved);

-- Tabla de actualizaciones de credenciales pendientes (multi-cliente)
CREATE TABLE IF NOT EXISTS config_updates (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(100) NOT NULL,
  new_token TEXT,
  new_url TEXT,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_updates_client ON config_updates(client_id, applied);

-- Tabla de configuracion de faqture-api (multi-cliente)
CREATE TABLE IF NOT EXISTS faqture_config (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(100) UNIQUE NOT NULL,
  client_name VARCHAR(200),
  paused BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqture_config_client ON faqture_config(client_id);
