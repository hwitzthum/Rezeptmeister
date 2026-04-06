"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import toast from "react-hot-toast";

interface Props {
  recipeId: string;
  recipeTitle: string;
}

export default function AddToShoppingListButton({ recipeId, recipeTitle }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/shopping-list/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) throw new Error();
      const data: { added: number; merged: number; total: number } = await res.json();
      toast.success(
        `${data.added} Zutat(en) hinzugefügt, ${data.merged} zusammengeführt.`,
      );
    } catch {
      toast.error(`Zutaten von "${recipeTitle}" konnten nicht hinzugefügt werden.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "..." : "Zur Einkaufsliste"}
    </Button>
  );
}
