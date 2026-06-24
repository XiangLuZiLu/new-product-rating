-- 图片存储配置改为后台页面管理。
-- 注意：如果你已经在后台保存过图片配置，再执行本 SQL 不会覆盖已有配置。
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'image_storage_settings',
  '{"driver":"url","image_max_size_mb":10,"image_key_prefix":"review-images","public_image_base_url":"","s3_endpoint":"","s3_bucket":"","s3_region":"us-east-1","s3_access_key_id":"","s3_secret_access_key":"","s3_force_path_style":true}',
  datetime('now')
)
ON CONFLICT(key) DO NOTHING;
