-- Admin DM → WhatsApp relay
ALTER TABLE "User" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "whatsappNotify" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "whatsappPendingPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappCodeExpires" TIMESTAMP(3);

CREATE INDEX "User_whatsappCodeHash_idx" ON "User"("whatsappCodeHash");
CREATE INDEX "User_whatsappPhone_idx" ON "User"("whatsappPhone");
