-- HWO Sprint 5.3: 留存与数据观测（埋点 + 留存漏斗 + Grafana 看板）
-- 参见：开发计划.html §6.3
-- 表：AnalyticsEvent（行为埋点）+ DailyActiveSnapshot（日活快照，用于 DAU/留存计算）

-- ─── AnalyticsEvent ───
CREATE TABLE "AnalyticsEvent" (
    "id"         TEXT     NOT NULL,
    "userId"     TEXT,
    "event"      TEXT     NOT NULL,
    "category"   TEXT     NOT NULL,
    "properties" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_userId_occurredAt_idx" ON "AnalyticsEvent"("userId", "occurredAt");
CREATE INDEX "AnalyticsEvent_event_occurredAt_idx" ON "AnalyticsEvent"("event", "occurredAt");
CREATE INDEX "AnalyticsEvent_category_occurredAt_idx" ON "AnalyticsEvent"("category", "occurredAt");

-- 外键：userId 可空，删除 User 时 SetNull（保留事件用于历史分析）
ALTER TABLE "AnalyticsEvent"
    ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

-- ─── DailyActiveSnapshot ───
CREATE TABLE "DailyActiveSnapshot" (
    "id"          TEXT     NOT NULL,
    "userId"      TEXT     NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "paid"        BOOLEAN  NOT NULL DEFAULT false,
    "paidAmount"  INTEGER  NOT NULL DEFAULT 0,
    "actions"     INTEGER  NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyActiveSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyActiveSnapshot_userId_date_key" ON "DailyActiveSnapshot"("userId", "date");
CREATE INDEX "DailyActiveSnapshot_date_idx" ON "DailyActiveSnapshot"("date");

-- 外键：userId 不可空，删除 User 时 Cascade（用户没了快照也没意义）
ALTER TABLE "DailyActiveSnapshot"
    ADD CONSTRAINT "DailyActiveSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
