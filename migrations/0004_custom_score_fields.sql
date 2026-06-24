-- 新增“自定义评分项”支持：评分项由后台配置，评分结果用 JSON 保存每个评分项明细。
-- 如果 ALTER TABLE 提示 duplicate column name，说明你已经执行过本升级，可忽略该条错误。
ALTER TABLE review_scores ADD COLUMN score_items_json TEXT;

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'score_fields',
  '[{"id":"appearance","label":"外观设计"},{"id":"material","label":"材质触感"},{"id":"craftsmanship","label":"工艺细节"},{"id":"capacity","label":"容量收纳"},{"id":"comfort","label":"背负舒适度"}]',
  datetime('now')
)
ON CONFLICT(key) DO NOTHING;
