import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStorage } from './sqlite-storage.js';
const temp=mkdtempSync(join(tmpdir(),'rating-vps-test-'));
const storage=createSqliteStorage({DB_PATH:join(temp,'rating.sqlite')});
const getFuture=()=>new Date(Date.now()+48*3600000+8*3600000).toISOString().replace('T',' ').slice(0,19);
const date=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const gradeScores=(styleId,code,reviewer)=>({style_id:styleId,reviewer,review_link_code:code,
  review_date:date(),scores:{appearance:8,material:8,craftsmanship:8,capacity:8,comfort:8}});
test('空库、款式、链接、草稿、提交、进度状态和重复提交',async()=>{
  assert.equal((await storage.listStyles()).length,0);
  const s=await storage.createStyle({style_code:'TEST-A',season:'春夏',base_price:99});
  assert.ok(s.id);
  const link=await storage.createReviewLinkFast({name:'测试链接',style_ids:[s.id],expires_at:getFuture()});
  assert.ok(link.code);
  await storage.markReviewStarted(link.code,'张三');
  assert.equal((await storage.listReviewProgress(link.code))[0].status,'in_progress');
  await storage.savePublicDraft({reviewer:'张三',review_link_code:link.code,drafts:[{style_id:s.id,scores:{appearance:3}}]});
  assert.equal((await storage.getPublicDraft('张三',link.code)).drafts.length,1);
  const response=await storage.submitScoresFast([gradeScores(s.id,link.code,'张三')],{
    reviewer:'张三',review_date:date(),review_link_code:link.code});
  assert.equal(response.scores.length,1);
  assert.equal((await storage.listScores({review_link_code:link.code})).length,1);
  const rows=await storage.listReviewProgress(link.code);
  assert.equal(rows[0].status,'completed');
  assert.ok(rows[0].submitted_at);
  assert.equal(await storage.getPublicDraft('张三',link.code),null);
  await assert.rejects(()=>storage.submitScoresFast([gradeScores(s.id,link.code,'张三')],{
    reviewer:'张三',review_date:date(),review_link_code:link.code}),e=>e.status===409);
  assert.equal((await storage.listScores({review_link_code:link.code})).length,1);
  await storage.markReviewStarted(link.code,'张三');
  assert.equal((await storage.listReviewProgress(link.code))[0].status,'completed');
});
test('批量导入事务和删除',async()=>{
 const results=await storage.upsertImportedStyles([{style_code:'B',season:'秋冬',base_price:'32'}, {style_code:'C',base_price:'20'}]);
 assert.equal(results.length,2);
 const update=await storage.upsertImportedStyles([{style_code:'B',season:'夏',base_price:'30'}]);
 assert.equal(update[0].action,'updated');
 assert.equal((await storage.listStyles()).length,3);
 const remove=await storage.deleteStyleKeys([results[1].id]);
 assert.equal(remove.deleted_count,1);
 assert.equal((await storage.listStyles()).length,2);
});
