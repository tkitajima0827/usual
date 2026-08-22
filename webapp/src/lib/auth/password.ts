// server-onlyは使わない（prisma/seed.tsなど素のNode.jsスクリプトからも読み込むため）。
// session.tsの補足コメントを参照。
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
