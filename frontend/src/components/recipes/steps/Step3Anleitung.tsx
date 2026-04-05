"use client";

import { Textarea } from "@/components/ui";

export interface Step3Data {
  instructions: string;
}

interface Props {
  data: Step3Data;
  onChange: (data: Step3Data) => void;
}

export default function Step3Anleitung({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Beschreiben Sie die Zubereitung Schritt für Schritt. Jeder Schritt auf
        einer neuen Zeile oder nummeriert.
      </p>
      <Textarea
        id="instructions"
        label="Zubereitung"
        placeholder={
          "1. Zwiebeln fein würfeln und in heissem Öl glasig dünsten.\n\n2. Fleisch dazugeben und bei mittlerer Hitze anbraten..."
        }
        value={data.instructions}
        onChange={(e) => onChange({ instructions: e.target.value })}
        rows={14}
        className="font-mono text-sm"
      />
      <p className="text-xs text-[var(--text-muted)]">
        Tipp: Nummerieren Sie jeden Schritt für bessere Lesbarkeit im Kochmodus.
      </p>
    </div>
  );
}
