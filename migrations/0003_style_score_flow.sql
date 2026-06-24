-- 如果你已经部署过旧版系统，只需要在原 D1 数据库执行本文件，新增“后台配置款式、前端评分”需要的表。
CREATE TABLE IF NOT EXISTS review_styles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_image TEXT,
  style_code TEXT NOT NULL,
  season TEXT,
  base_price REAL,
  style_remark TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_styles_active ON review_styles(active);
CREATE INDEX IF NOT EXISTS idx_review_styles_sort_order ON review_styles(sort_order);
CREATE INDEX IF NOT EXISTS idx_review_styles_style_code ON review_styles(style_code);
CREATE INDEX IF NOT EXISTS idx_review_styles_deleted_at ON review_styles(deleted_at);

CREATE TABLE IF NOT EXISTS review_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  style_id INTEGER NOT NULL,
  product_image TEXT,
  style_code TEXT NOT NULL,
  season TEXT,
  base_price REAL,
  appearance_score INTEGER NOT NULL DEFAULT 0,
  material_score INTEGER NOT NULL DEFAULT 0,
  craftsmanship_score INTEGER NOT NULL DEFAULT 0,
  capacity_score INTEGER NOT NULL DEFAULT 0,
  comfort_score INTEGER NOT NULL DEFAULT 0,
  score_items_json TEXT,
  total_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT,
  remark TEXT,
  reviewer TEXT NOT NULL,
  review_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(style_id) REFERENCES review_styles(id)
);

CREATE INDEX IF NOT EXISTS idx_review_scores_style_id ON review_scores(style_id);
CREATE INDEX IF NOT EXISTS idx_review_scores_review_date ON review_scores(review_date);
CREATE INDEX IF NOT EXISTS idx_review_scores_reviewer ON review_scores(reviewer);
CREATE INDEX IF NOT EXISTS idx_review_scores_deleted_at ON review_scores(deleted_at);

CREATE TABLE IF NOT EXISTS review_score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(score_id) REFERENCES review_scores(id)
);

CREATE INDEX IF NOT EXISTS idx_review_score_history_score_id ON review_score_history(score_id);
