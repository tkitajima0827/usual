import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await readSession();
  if (session) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-xl font-semibold">予実管理システム</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">ログインしてください</p>
      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6">
        <LoginForm />
      </div>
    </div>
  );
}
