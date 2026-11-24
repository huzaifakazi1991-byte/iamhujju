-- Purgeable catalog: usage history must survive model deletion.
ALTER TABLE "UsageRecord" ALTER COLUMN "modelId" DROP NOT NULL;
ALTER TABLE "UsageRecord" ADD COLUMN "modelSlug" TEXT;
