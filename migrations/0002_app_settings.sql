CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value)
VALUES ('score_page_count', '3')
ON CONFLICT(key) DO NOTHING;


INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'score_fields',
  '[{"id":"appearance","label":"外观设计"},{"id":"material","label":"材质触感"},{"id":"craftsmanship","label":"工艺细节"},{"id":"capacity","label":"容量收纳"},{"id":"comfort","label":"背负舒适度"}]',
  datetime('now')
)
ON CONFLICT(key) DO NOTHING;
