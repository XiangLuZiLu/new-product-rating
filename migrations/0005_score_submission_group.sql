-- 评分提交分组字段：用于把同一评分人一次最终提交的多个款式聚合成一组显示
ALTER TABLE review_scores ADD COLUMN submission_id TEXT;
ALTER TABLE review_scores ADD COLUMN submitted_at TEXT;
