-- Model capabilities + provider health tracking (Freelmapi-style multi-capability gateway)

ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "capability" TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lastTestAt" TIMESTAMP(3);
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lastTestOk" BOOLEAN;
ALTER TABLE "Provider" ADD COLUMN IF NOT EXISTS "lastTestDetail" TEXT;

-- Classify known model families so image/video models surface in the right mode.
UPDATE "Model" SET "capability" = 'image' WHERE slug ~ '(^|[-_])imagen|(^|[-_])dall-e|flux|stable-diffusion|sd3|sdxl|seedream|recraft';
UPDATE "Model" SET "capability" = 'video' WHERE slug ~ '(^|[-_])veo|sora|kling|runway|luma|pika|minimax-video|wan-';
