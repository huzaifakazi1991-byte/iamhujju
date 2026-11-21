-- Profile fields for the user profile page
ALTER TABLE "User" ADD COLUMN "birthday" TIMESTAMP(3),
ADD COLUMN "country" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "avatarUrl" TEXT;
