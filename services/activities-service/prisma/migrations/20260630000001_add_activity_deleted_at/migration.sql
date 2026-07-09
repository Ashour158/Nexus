-- AlterTable: add soft-delete column to Activity
ALTER TABLE "Activity" ADD COLUMN "deletedAt" TIMESTAMP(3);
