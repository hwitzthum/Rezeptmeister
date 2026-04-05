"use client";

import { useState } from "react";
import { Button, Badge } from "@/components/ui";

export interface Step4Data {
  tags: string[];
}

interface Props {
  data: Step4Data;
  onChange: (data: Step4Data) => void;
}

export default function Step4Metadaten({ data, onChange }: Props) {
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const tag = tagInput.trim().replace(/,$/, "");
    if (tag && !data.tags.includes(tag) && data.tags.length < 20) {
      onChange({ tags: [...data.tags, tag] });
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    onChange({ tags: data.tags.filter((t) => t !== tag) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagInput && data.tags.length > 0) {
      removeTag(data.tags[data.tags.length - 1]);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Fügen Sie Tags hinzu, um das Rezept leichter auffindbar zu machen.
      </p>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          Tags
        </label>

        {/* Tag-Badges */}
        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {data.tags.map((tag) => (
              <Badge
                key={tag}
                variant="terra"
                size="sm"
                removable
                onRemove={() => removeTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tag eingeben, Enter oder Komma zum Hinzufügen"
            maxLength={50}
            className={[
              "flex-1 px-3.5 py-2.5 rounded-xl text-sm",
              "bg-[var(--bg-surface)] border border-[var(--border-base)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
              "transition-colors duration-150",
            ].join(" ")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={!tagInput.trim() || data.tags.length >= 20}
          >
            Hinzufügen
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          {data.tags.length}/20 Tags
        </p>
      </div>

      {/* Zusammenfassung */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
        <p className="font-medium text-[var(--text-primary)] mb-1">
          Fast fertig!
        </p>
        <p>
          Klicken Sie auf &quot;Rezept speichern&quot;, um Ihr Rezept zu
          sichern.
        </p>
      </div>
    </div>
  );
}
