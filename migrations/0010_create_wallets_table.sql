CREATE TABLE wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_commission NUMERIC(12,2) DEFAULT 0,      -- Total commission earned
  available_balance NUMERIC(12,2) DEFAULT 0,     -- 40% immediately withdrawable
  retention_balance NUMERIC(12,2) DEFAULT 0,       -- 60% retained until release
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
