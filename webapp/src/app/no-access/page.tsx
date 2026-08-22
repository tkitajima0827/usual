import { signOut } from "@/auth";

export default function NoAccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-lg font-semibold text-slate-900">
        アクセス可能な事業者がありません
      </h1>
      <p className="max-w-md text-sm text-slate-500">
        管理者にお問い合わせのうえ、事業者への招待を依頼してください。
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
