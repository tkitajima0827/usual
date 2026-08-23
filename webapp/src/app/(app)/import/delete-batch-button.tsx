"use client";

import { deleteImportBatchAction } from "./actions";

export default function DeleteBatchButton({ id, fileName }: { id: string; fileName: string }) {
  return (
    <form
      action={async () => {
        if (
          !confirm(
            `「${fileName}」の取込を削除しますか？\nこの取込で登録された取引・仕訳もすべて削除され、原価・実現損益が再計算されます。`,
          )
        )
          return;
        await deleteImportBatchAction(id);
      }}
    >
      <button type="submit" className="text-xs text-red-600 hover:underline">
        削除
      </button>
    </form>
  );
}
