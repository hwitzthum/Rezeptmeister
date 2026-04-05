"use client";

import { Input, Textarea, Select } from "@/components/ui";
import { KATEGORIEN, KUECHEN } from "@/lib/units";

export interface Step1Data {
  title: string;
  description: string;
  category: string;
  cuisine: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  difficulty: string;
}

interface Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
  errors: Partial<Record<keyof Step1Data, string>>;
}

export default function Step1Grunddaten({ data, onChange, errors }: Props) {
  function set<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    onChange({ ...data, [key]: value });
  }

  return (
    <div className="space-y-5">
      {/* Titel */}
      <Input
        id="title"
        label="Rezepttitel *"
        placeholder="z.B. Zürcher Geschnetzeltes"
        value={data.title}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title}
        autoFocus
      />

      {/* Beschreibung */}
      <Textarea
        id="description"
        label="Kurzbeschreibung"
        placeholder="Eine kurze Beschreibung des Rezepts..."
        value={data.description}
        onChange={(e) => set("description", e.target.value)}
        error={errors.description}
        rows={3}
      />

      {/* Kategorie & Küche */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
          >
            Kategorie
          </label>
          <input
            id="category"
            list="category-list"
            value={data.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="z.B. Mittagessen"
            className={[
              "w-full px-3.5 py-2.5 rounded-xl text-sm",
              "bg-[var(--bg-surface)] border border-[var(--border-base)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
              "transition-colors duration-150",
            ].join(" ")}
          />
          <datalist id="category-list">
            {KATEGORIEN.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>

        <div>
          <label
            htmlFor="cuisine"
            className="block text-sm font-medium text-[var(--text-primary)] mb-1.5"
          >
            Küche
          </label>
          <input
            id="cuisine"
            list="cuisine-list"
            value={data.cuisine}
            onChange={(e) => set("cuisine", e.target.value)}
            placeholder="z.B. Schweizer"
            className={[
              "w-full px-3.5 py-2.5 rounded-xl text-sm",
              "bg-[var(--bg-surface)] border border-[var(--border-base)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
              "transition-colors duration-150",
            ].join(" ")}
          />
          <datalist id="cuisine-list">
            {KUECHEN.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Portionen & Schwierigkeit */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="servings"
          label="Portionen *"
          type="number"
          min={1}
          max={999}
          value={data.servings}
          onChange={(e) => set("servings", e.target.value)}
          error={errors.servings}
        />

        <Select
          id="difficulty"
          label="Schwierigkeitsgrad"
          value={data.difficulty}
          onChange={(e) => set("difficulty", e.target.value)}
          error={errors.difficulty}
        >
          <option value="">— wählen —</option>
          <option value="einfach">Einfach</option>
          <option value="mittel">Mittel</option>
          <option value="anspruchsvoll">Anspruchsvoll</option>
        </Select>
      </div>

      {/* Zeiten */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="prepTimeMinutes"
          label="Vorbereitung (Min.)"
          type="number"
          min={0}
          max={9999}
          placeholder="z.B. 15"
          value={data.prepTimeMinutes}
          onChange={(e) => set("prepTimeMinutes", e.target.value)}
        />
        <Input
          id="cookTimeMinutes"
          label="Kochzeit (Min.)"
          type="number"
          min={0}
          max={9999}
          placeholder="z.B. 30"
          value={data.cookTimeMinutes}
          onChange={(e) => set("cookTimeMinutes", e.target.value)}
        />
      </div>

      {(data.prepTimeMinutes || data.cookTimeMinutes) && (
        <p className="text-xs text-[var(--text-muted)] -mt-2">
          Gesamtzeit:{" "}
          {(parseInt(data.prepTimeMinutes || "0") || 0) +
            (parseInt(data.cookTimeMinutes || "0") || 0)}{" "}
          Min.
        </p>
      )}
    </div>
  );
}
