-- ============================================================================
-- 头像功能测试数据（facesjs  face 字段）
--
-- 目的：验证球员头像（facesjs）在数据库 → API → 前端的完整链路。
-- 前提：已执行迁移 prisma/migrations/20261013000000_add_player_face。
--
-- 用法：
--   psql "$DATABASE_URL" -f test-avatar-faces.sql
--
-- 内容分三段：
--   §1 为空 face 的存量球员批量分配头像（幂等，可重复执行）
--   §2 插入一支独立测试球队 + 8 名球员（每人一张不同的头像），
--      便于用 GET /api/teams/test-face-team 直接验证
--   §3 校验查询 + 清理脚本（清理段默认注释）
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- §1 存量球员批量补头像：为所有 face IS NULL 的球员循环分配头像池中的数据
--    头像池由 facesjs 真实生成，均为合法 FaceConfig。
-- ────────────────────────────────────────────────────────────────────────────
WITH face_pool AS (
  SELECT ARRAY[
    '{"fatness":0.1,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#f2d6cb","size":0.97},"jersey":{"id":"football5"},"ear":{"id":"ear3","size":1.21},"head":{"id":"head13","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line1"},"smileLine":{"id":"none","size":1.01},"miscLine":{"id":"chin1"},"facialHair":{"id":"fullgoatee2"},"eye":{"id":"eye4","angle":-6},"eyebrow":{"id":"eyebrow6","angle":-5},"hair":{"id":"emo","color":"#2C1608","flip":false},"mouth":{"id":"smile-closed","flip":true},"nose":{"id":"nose12","flip":true,"size":1.17},"glasses":{"id":"none"},"accessories":{"id":"headband-high"}}'::jsonb,
    '{"fatness":0.11,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#74453d","size":0.95},"jersey":{"id":"jersey5"},"ear":{"id":"ear2","size":1.5},"head":{"id":"head18","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"none"},"smileLine":{"id":"line3","size":0.3},"miscLine":{"id":"forehead5"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye14","angle":14},"eyebrow":{"id":"eyebrow19","angle":13},"hair":{"id":"messy-short","color":"#272421","flip":true},"mouth":{"id":"mouth7","flip":true},"nose":{"id":"nose4","flip":true,"size":0.87},"glasses":{"id":"none"},"accessories":{"id":"eye-black"}}'::jsonb,
    '{"fatness":0.42,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#fedac7","size":1.01},"jersey":{"id":"football2"},"ear":{"id":"ear2","size":1.27},"head":{"id":"head8","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line6"},"smileLine":{"id":"none","size":1.77},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye1","angle":12},"eyebrow":{"id":"eyebrow2","angle":4},"hair":{"id":"fauxhawk-fade","color":"#272421","flip":false},"mouth":{"id":"closed","flip":false},"nose":{"id":"nose3","flip":true,"size":1.1},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.4,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body4","color":"#a67358","size":1.04},"jersey":{"id":"hockey"},"ear":{"id":"ear3","size":1.43},"head":{"id":"head18","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line6"},"smileLine":{"id":"line3","size":1.11},"miscLine":{"id":"none"},"facialHair":{"id":"harly3-sb-1"},"eye":{"id":"eye16","angle":12},"eyebrow":{"id":"eyebrow18","angle":6},"hair":{"id":"short-bald","color":"#272421","flip":false},"mouth":{"id":"mouth8","flip":true},"nose":{"id":"small","flip":false,"size":0.63},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.96,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#74453d","size":0.98},"jersey":{"id":"jersey5"},"ear":{"id":"ear1","size":0.61},"head":{"id":"head3","shave":"rgba(0,0,0,0.2)"},"eyeLine":{"id":"line5"},"smileLine":{"id":"line3","size":0.3},"miscLine":{"id":"freckles2"},"facialHair":{"id":"fullgoatee"},"eye":{"id":"eye15","angle":-3},"eyebrow":{"id":"eyebrow14","angle":-14},"hair":{"id":"bald","color":"#272421","flip":true},"mouth":{"id":"mouth4","flip":false},"nose":{"id":"nose6","flip":false,"size":0.51},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.19,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#aa816f","size":0.96},"jersey":{"id":"jersey4"},"ear":{"id":"ear3","size":0.7},"head":{"id":"head3","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line1"},"smileLine":{"id":"line1","size":0.95},"miscLine":{"id":"forehead3"},"facialHair":{"id":"mustache1SB2"},"eye":{"id":"eye13","angle":9},"eyebrow":{"id":"eyebrow7","angle":11},"hair":{"id":"spike3","color":"#272421","flip":false},"mouth":{"id":"mouth","flip":false},"nose":{"id":"pinocchio","flip":false,"size":0.61},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.96,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ad6453","size":1.01},"jersey":{"id":"baseball4"},"ear":{"id":"ear2","size":0.59},"head":{"id":"head3","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line3"},"smileLine":{"id":"line2","size":1.93},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye12","angle":-8},"eyebrow":{"id":"eyebrow5","angle":-6},"hair":{"id":"high","color":"#272421","flip":true},"mouth":{"id":"closed","flip":false},"nose":{"id":"nose11","flip":true,"size":0.57},"glasses":{"id":"glasses1-secondary"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.41,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ad6453","size":0.96},"jersey":{"id":"jersey4"},"ear":{"id":"ear1","size":0.75},"head":{"id":"head1","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line2"},"smileLine":{"id":"none","size":1.91},"miscLine":{"id":"forehead1"},"facialHair":{"id":"neckbeard2SB1"},"eye":{"id":"eye1","angle":-5},"eyebrow":{"id":"eyebrow5","angle":-15},"hair":{"id":"bald","color":"#272421","flip":true},"mouth":{"id":"angry","flip":true},"nose":{"id":"small","flip":true,"size":0.85},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.53,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body","color":"#f2d6cb","size":1.04},"jersey":{"id":"jersey4"},"ear":{"id":"ear3","size":0.54},"head":{"id":"head4","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line1"},"smileLine":{"id":"none","size":2.16},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye1","angle":7},"eyebrow":{"id":"eyebrow9","angle":-9},"hair":{"id":"curlyFade1","color":"#e9c67b","flip":false},"mouth":{"id":"mouth7","flip":false},"nose":{"id":"nose7","flip":true,"size":1.03},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.15,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#a67358","size":0.99},"jersey":{"id":"football4"},"ear":{"id":"ear3","size":1.27},"head":{"id":"head12","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"none"},"smileLine":{"id":"none","size":0.75},"miscLine":{"id":"forehead2"},"facialHair":{"id":"goatee4"},"eye":{"id":"eye14","angle":15},"eyebrow":{"id":"eyebrow17","angle":-9},"hair":{"id":"juice","color":"#1c1008","flip":false},"mouth":{"id":"smile3","flip":true},"nose":{"id":"nose8","flip":false,"size":1.1},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.99,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"longHair"},"body":{"id":"body2","color":"#ddb7a0","size":1.04},"jersey":{"id":"hockey4"},"ear":{"id":"ear1","size":0.82},"head":{"id":"head12","shave":"rgba(0,0,0,0.18)"},"eyeLine":{"id":"line3"},"smileLine":{"id":"line3","size":2.17},"miscLine":{"id":"none"},"facialHair":{"id":"mustache1SB2"},"eye":{"id":"eye4","angle":-6},"eyebrow":{"id":"eyebrow3","angle":-11},"hair":{"id":"shaggy2","color":"#3D2314","flip":true},"mouth":{"id":"mouth3","flip":true},"nose":{"id":"nose6","flip":true,"size":0.9},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
    '{"fatness":0.15,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body4","color":"#eab687","size":0.99},"jersey":{"id":"football3"},"ear":{"id":"ear2","size":0.66},"head":{"id":"head13","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line2"},"smileLine":{"id":"line2","size":2.14},"miscLine":{"id":"none"},"facialHair":{"id":"chin-strap"},"eye":{"id":"eye4","angle":4},"eyebrow":{"id":"eyebrow4","angle":-9},"hair":{"id":"afro","color":"#0f0902","flip":true},"mouth":{"id":"mouth8","flip":true},"nose":{"id":"nose2","flip":false,"size":0.53},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb
  ] AS faces
),
target AS (
  SELECT id, (row_number() OVER (ORDER BY id))::int AS rn
  FROM "Player"
  WHERE face IS NULL
)
UPDATE "Player" p
SET face = fp.faces[((t.rn - 1) % array_length(fp.faces, 1)) + 1]
FROM target t, face_pool fp
WHERE p.id = t.id;


-- ────────────────────────────────────────────────────────────────────────────
-- §2 独立测试球队（8 名球员，头像各不相同）
--    幂等：id 冲突时更新 face。
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO "Team" (id, name, chemistry, "createdAt", "updatedAt")
VALUES ('test-face-team', '头像测试队 Avatar Test', 60, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW();

INSERT INTO "Player" (
  id, "teamId", name, position, abilities, traits, face,
  age, salary, potential, status, "createdAt", "updatedAt"
) VALUES
  ('test-face-p1', 'test-face-team', '林锋', 'PG',
   '{"three":48,"midrange":55,"inside":62,"drive":48,"postup":55,"passing":62,"ballHandle":48,"perimeterD":55,"interiorD":62,"steal":48,"block":55,"speed":62,"strength":48,"jumping":55,"stamina":62,"iq":48,"clutch":55}'::jsonb, '[]'::jsonb, '{"fatness":0.1,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#f2d6cb","size":0.97},"jersey":{"id":"football5"},"ear":{"id":"ear3","size":1.21},"head":{"id":"head13","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line1"},"smileLine":{"id":"none","size":1.01},"miscLine":{"id":"chin1"},"facialHair":{"id":"fullgoatee2"},"eye":{"id":"eye4","angle":-6},"eyebrow":{"id":"eyebrow6","angle":-5},"hair":{"id":"emo","color":"#2C1608","flip":false},"mouth":{"id":"smile-closed","flip":true},"nose":{"id":"nose12","flip":true,"size":1.17},"glasses":{"id":"none"},"accessories":{"id":"headband-high"}}'::jsonb,
   22, 200, 25, 'good', NOW(), NOW()),
  ('test-face-p2', 'test-face-team', '陈锐', 'SG',
   '{"three":52,"midrange":59,"inside":66,"drive":52,"postup":59,"passing":66,"ballHandle":52,"perimeterD":59,"interiorD":66,"steal":52,"block":59,"speed":66,"strength":52,"jumping":59,"stamina":66,"iq":52,"clutch":59}'::jsonb, '[]'::jsonb, '{"fatness":0.11,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#74453d","size":0.95},"jersey":{"id":"jersey5"},"ear":{"id":"ear2","size":1.5},"head":{"id":"head18","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"none"},"smileLine":{"id":"line3","size":0.3},"miscLine":{"id":"forehead5"},"facialHair":{"id":"goatee3"},"eye":{"id":"eye14","angle":14},"eyebrow":{"id":"eyebrow19","angle":13},"hair":{"id":"messy-short","color":"#272421","flip":true},"mouth":{"id":"mouth7","flip":true},"nose":{"id":"nose4","flip":true,"size":0.87},"glasses":{"id":"none"},"accessories":{"id":"eye-black"}}'::jsonb,
   23, 260, 25, 'good', NOW(), NOW()),
  ('test-face-p3', 'test-face-team', '赵川', 'SF',
   '{"three":56,"midrange":63,"inside":70,"drive":56,"postup":63,"passing":70,"ballHandle":56,"perimeterD":63,"interiorD":70,"steal":56,"block":63,"speed":70,"strength":56,"jumping":63,"stamina":70,"iq":56,"clutch":63}'::jsonb, '[]'::jsonb, '{"fatness":0.42,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body3","color":"#fedac7","size":1.01},"jersey":{"id":"football2"},"ear":{"id":"ear2","size":1.27},"head":{"id":"head8","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line6"},"smileLine":{"id":"none","size":1.77},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye1","angle":12},"eyebrow":{"id":"eyebrow2","angle":4},"hair":{"id":"fauxhawk-fade","color":"#272421","flip":false},"mouth":{"id":"closed","flip":false},"nose":{"id":"nose3","flip":true,"size":1.1},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
   24, 320, 25, 'good', NOW(), NOW()),
  ('test-face-p4', 'test-face-team', '黄磊', 'PF',
   '{"three":60,"midrange":67,"inside":74,"drive":60,"postup":67,"passing":74,"ballHandle":60,"perimeterD":67,"interiorD":74,"steal":60,"block":67,"speed":74,"strength":60,"jumping":67,"stamina":74,"iq":60,"clutch":67}'::jsonb, '[]'::jsonb, '{"fatness":0.4,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body4","color":"#a67358","size":1.04},"jersey":{"id":"hockey"},"ear":{"id":"ear3","size":1.43},"head":{"id":"head18","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line6"},"smileLine":{"id":"line3","size":1.11},"miscLine":{"id":"none"},"facialHair":{"id":"harly3-sb-1"},"eye":{"id":"eye16","angle":12},"eyebrow":{"id":"eyebrow18","angle":6},"hair":{"id":"short-bald","color":"#272421","flip":false},"mouth":{"id":"mouth8","flip":true},"nose":{"id":"small","flip":false,"size":0.63},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
   25, 380, 25, 'good', NOW(), NOW()),
  ('test-face-p5', 'test-face-team', '周航', 'C',
   '{"three":64,"midrange":71,"inside":78,"drive":64,"postup":71,"passing":78,"ballHandle":64,"perimeterD":71,"interiorD":78,"steal":64,"block":71,"speed":78,"strength":64,"jumping":71,"stamina":78,"iq":64,"clutch":71}'::jsonb, '[]'::jsonb, '{"fatness":0.96,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body5","color":"#74453d","size":0.98},"jersey":{"id":"jersey5"},"ear":{"id":"ear1","size":0.61},"head":{"id":"head3","shave":"rgba(0,0,0,0.2)"},"eyeLine":{"id":"line5"},"smileLine":{"id":"line3","size":0.3},"miscLine":{"id":"freckles2"},"facialHair":{"id":"fullgoatee"},"eye":{"id":"eye15","angle":-3},"eyebrow":{"id":"eyebrow14","angle":-14},"hair":{"id":"bald","color":"#272421","flip":true},"mouth":{"id":"mouth4","flip":false},"nose":{"id":"nose6","flip":false,"size":0.51},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
   26, 440, 25, 'good', NOW(), NOW()),
  ('test-face-p6', 'test-face-team', '吴博', 'SG',
   '{"three":68,"midrange":75,"inside":82,"drive":68,"postup":75,"passing":82,"ballHandle":68,"perimeterD":75,"interiorD":82,"steal":68,"block":75,"speed":82,"strength":68,"jumping":75,"stamina":82,"iq":68,"clutch":75}'::jsonb, '[]'::jsonb, '{"fatness":0.19,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#aa816f","size":0.96},"jersey":{"id":"jersey4"},"ear":{"id":"ear3","size":0.7},"head":{"id":"head3","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line1"},"smileLine":{"id":"line1","size":0.95},"miscLine":{"id":"forehead3"},"facialHair":{"id":"mustache1SB2"},"eye":{"id":"eye13","angle":9},"eyebrow":{"id":"eyebrow7","angle":11},"hair":{"id":"spike3","color":"#272421","flip":false},"mouth":{"id":"mouth","flip":false},"nose":{"id":"pinocchio","flip":false,"size":0.61},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
   27, 500, 25, 'good', NOW(), NOW()),
  ('test-face-p7', 'test-face-team', '徐洋', 'PF',
   '{"three":72,"midrange":79,"inside":86,"drive":72,"postup":79,"passing":86,"ballHandle":72,"perimeterD":79,"interiorD":86,"steal":72,"block":79,"speed":86,"strength":72,"jumping":79,"stamina":86,"iq":72,"clutch":79}'::jsonb, '[]'::jsonb, '{"fatness":0.96,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ad6453","size":1.01},"jersey":{"id":"baseball4"},"ear":{"id":"ear2","size":0.59},"head":{"id":"head3","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line3"},"smileLine":{"id":"line2","size":1.93},"miscLine":{"id":"none"},"facialHair":{"id":"none"},"eye":{"id":"eye12","angle":-8},"eyebrow":{"id":"eyebrow5","angle":-6},"hair":{"id":"high","color":"#272421","flip":true},"mouth":{"id":"closed","flip":false},"nose":{"id":"nose11","flip":true,"size":0.57},"glasses":{"id":"glasses1-secondary"},"accessories":{"id":"none"}}'::jsonb,
   28, 560, 25, 'good', NOW(), NOW()),
  ('test-face-p8', 'test-face-team', '孙野', 'C',
   '{"three":76,"midrange":83,"inside":90,"drive":76,"postup":83,"passing":90,"ballHandle":76,"perimeterD":83,"interiorD":90,"steal":76,"block":83,"speed":90,"strength":76,"jumping":83,"stamina":90,"iq":76,"clutch":83}'::jsonb, '[]'::jsonb, '{"fatness":0.41,"teamColors":["#89bfd3","#7a1319","#07364f"],"hairBg":{"id":"none"},"body":{"id":"body2","color":"#ad6453","size":0.96},"jersey":{"id":"jersey4"},"ear":{"id":"ear1","size":0.75},"head":{"id":"head1","shave":"rgba(0,0,0,0)"},"eyeLine":{"id":"line2"},"smileLine":{"id":"none","size":1.91},"miscLine":{"id":"forehead1"},"facialHair":{"id":"neckbeard2SB1"},"eye":{"id":"eye1","angle":-5},"eyebrow":{"id":"eyebrow5","angle":-15},"hair":{"id":"bald","color":"#272421","flip":true},"mouth":{"id":"angry","flip":true},"nose":{"id":"small","flip":true,"size":0.85},"glasses":{"id":"none"},"accessories":{"id":"none"}}'::jsonb,
   29, 620, 25, 'good', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET face = EXCLUDED.face, "updatedAt" = NOW();


-- ────────────────────────────────────────────────────────────────────────────
-- §3 校验
-- ────────────────────────────────────────────────────────────────────────────
-- 全库 face 覆盖率：应无 face IS NULL 的球员
SELECT
  count(*)                               AS total_players,
  count(face)                            AS with_face,
  count(*) - count(face)                 AS missing_face
FROM "Player";

-- 测试球队球员 + 头像是否存在
SELECT id, name, position,
       (face IS NOT NULL) AS has_face,
       face->'hair'->>'color' AS hair_color,
       face->'body'->>'color' AS skin_color
FROM "Player"
WHERE "teamId" = 'test-face-team'
ORDER BY id;


-- ────────────────────────────────────────────────────────────────────────────
-- §4 清理（需要时取消注释执行）
-- ────────────────────────────────────────────────────────────────────────────
-- DELETE FROM "Player" WHERE "teamId" = 'test-face-team';
-- DELETE FROM "Team"   WHERE id = 'test-face-team';
-- -- 清空所有球员头像（回到未填充状态）：
-- UPDATE "Player" SET face = NULL;
