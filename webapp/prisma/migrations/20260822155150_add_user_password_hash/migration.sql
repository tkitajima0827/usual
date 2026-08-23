/*
  Warnings:

  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

  この移行時点のUserデータはシード投入分のテストデータのみのため、
  passwordHash追加前の既存ユーザーを削除してから列を追加する（`npm run db:seed` で再作成する想定）。
*/
-- DeleteExistingRows (see warning above)
DELETE FROM "User";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT NOT NULL;
