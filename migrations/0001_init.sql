CREATE TABLE IF NOT EXISTS review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_image TEXT,
  style_code TEXT NOT NULL,
  season TEXT,
  base_price REAL,
  appearance_score INTEGER NOT NULL DEFAULT 0,
  material_score INTEGER NOT NULL DEFAULT 0,
  craftsmanship_score INTEGER NOT NULL DEFAULT 0,
  capacity_score INTEGER NOT NULL DEFAULT 0,
  comfort_score INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT,
  remark TEXT,
  reviewer TEXT,
  review_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_items_review_date ON review_items(review_date);
CREATE INDEX IF NOT EXISTS idx_review_items_style_code ON review_items(style_code);
CREATE INDEX IF NOT EXISTS idx_review_items_deleted_at ON review_items(deleted_at);

CREATE TABLE IF NOT EXISTS review_item_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(item_id) REFERENCES review_items(id)
);

CREATE INDEX IF NOT EXISTS idx_review_item_history_item_id ON review_item_history(item_id);
