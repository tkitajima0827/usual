"use client";

import { deleteOpeningBalanceAction } from "./actions";

export default function DeleteButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        if (!confirm("この期首残高を削除しますか？")) return;
        await deleteOpeningBalanceAction(id);
      }}
    >
      <button type="submit" className="text-xs text-red-600 hover:underline">
        削除
      </button>
    </form>
  );
}
