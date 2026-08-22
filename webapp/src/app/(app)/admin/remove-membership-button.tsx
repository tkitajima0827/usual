"use client";

import { removeMembershipAction } from "./actions";

export default function RemoveMembershipButton({ membershipId }: { membershipId: string }) {
  return (
    <form
      action={async () => {
        if (!confirm("このメンバーの事業者アクセス権を削除しますか？")) return;
        await removeMembershipAction(membershipId);
      }}
    >
      <button type="submit" className="text-xs text-red-600 hover:underline">
        削除
      </button>
    </form>
  );
}
