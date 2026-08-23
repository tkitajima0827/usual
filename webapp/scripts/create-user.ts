// ログイン用ユーザー(User)を作成するCLI。実際の顧客・事務所スタッフ向けの
// アカウント発行に使う（シードスクリプトはテスト株式会社のデモ用のみ）。
//
// 使い方:
//   npx tsx scripts/create-user.ts --email "foo@example.com" --name "山田太郎" \
//     --role FIRM_STAFF --password "初期パスワード" [--client-id <clientId>]
//
// --role が CLIENT_ADMIN / CLIENT_USER の場合は --client-id が必須。
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const VALID_ROLES = ["FIRM_ADMIN", "FIRM_STAFF", "CLIENT_ADMIN", "CLIENT_USER"] as const;
type Role = (typeof VALID_ROLES)[number];

function parseArgs(argv: string[]) {
  const result: { email?: string; name?: string; role?: string; password?: string; clientId?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") result.email = argv[++i];
    if (argv[i] === "--name") result.name = argv[++i];
    if (argv[i] === "--role") result.role = argv[++i];
    if (argv[i] === "--password") result.password = argv[++i];
    if (argv[i] === "--client-id") result.clientId = argv[++i];
  }
  return result;
}

async function main() {
  const { email, name, role, password, clientId } = parseArgs(process.argv.slice(2));

  if (!email || !name || !role || !password) {
    console.error(
      '使い方: npx tsx scripts/create-user.ts --email "foo@example.com" --name "氏名" --role <FIRM_ADMIN|FIRM_STAFF|CLIENT_ADMIN|CLIENT_USER> --password "初期パスワード" [--client-id <clientId>]',
    );
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role as Role)) {
    console.error(`--role は ${VALID_ROLES.join(" / ")} のいずれかを指定してください`);
    process.exit(1);
  }
  const isClientRole = role === "CLIENT_ADMIN" || role === "CLIENT_USER";
  if (isClientRole && !clientId) {
    console.error("CLIENT_ADMIN / CLIENT_USER には --client-id の指定が必要です");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("パスワードは8文字以上にしてください");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.error(`既にこのメールアドレスのユーザーが存在します: ${email} (${existing.id})`);
      process.exit(1);
    }

    if (isClientRole) {
      const client = await prisma.client.findUnique({ where: { id: clientId! } });
      if (!client) {
        console.error(`clientId が見つかりません: ${clientId}`);
        process.exit(1);
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role: role as Role,
        passwordHash,
        clientId: isClientRole ? clientId : null,
      },
    });
    console.log(`作成しました: ${user.name} <${user.email}> (${user.role}, id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
