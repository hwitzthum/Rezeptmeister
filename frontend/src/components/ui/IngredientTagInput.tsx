"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";

interface IngredientTagInputProps {
  selectedIngredients: string[];
  onIngredientsChange: (ingredients: string[]) => void;
  placeholder?: string;
  maxItems?: number;
}

export function IngredientTagInput({
  selectedIngredients,
  onIngredientsChange,
  placeholder = "Zutat eingeben…",
  maxItems = 30,
}: IngredientTagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(inputValue, 300);

  // Fetch autocomplete suggestions
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/ingredients/autocomplete?q=${encodeURIComponent(debouncedQuery)}&limit=10`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const filtered = (data.suggestions as string[]).filter(
          (s) => !selectedIngredients.some((sel) => sel.toLowerCase() === s.toLowerCase()),
        );
        setSuggestions(filtered);
        setShowDropdown(filtered.length > 0);
        setActiveIndex(-1);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedIngredients]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addIngredient = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (selectedIngredients.length >= maxItems) return;
      if (selectedIngredients.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
      onIngredientsChange([...selectedIngredients, trimmed]);
      setInputValue("");
      setSuggestions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [selectedIngredients, onIngredientsChange, maxItems],
  );

  const removeIngredient = useCallback(
    (index: number) => {
      onIngredientsChange(selectedIngredients.filter((_, i) => i !== index));
      inputRef.current?.focus();
    },
    [selectedIngredients, onIngredientsChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          addIngredient(suggestions[activeIndex]);
        } else if (inputValue.trim()) {
          addIngredient(inputValue);
        }
      } else if (e.key === "Backspace" && !inputValue && selectedIngredients.length > 0) {
        removeIngredient(selectedIngredients.length - 1);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
        setActiveIndex(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!showDropdown && suggestions.length > 0) {
          setShowDropdown(true);
        }
        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
      }
    },
    [activeIndex, suggestions, inputValue, selectedIngredients, addIngredient, removeIngredient, showDropdown],
  );

  // Scroll active suggestion into view
  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative" data-testid="ingredient-tag-input">
      {/* Selected chips + input */}
      <div
        className={[
          "flex flex-wrap gap-1.5 items-center",
          "bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-lg",
          "px-3 py-2 min-h-[44px]",
          "focus-within:ring-2 focus-within:ring-terra-500 focus-within:border-terra-500",
          "transition-all duration-150",
        ].join(" ")}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedIngredients.map((ingredient, idx) => (
          <span
            key={`${ingredient}-${idx}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-terra-100 text-terra-700 dark:bg-terra-900/30 dark:text-terra-300"
          >
            {ingredient}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeIngredient(idx);
              }}
              className="ml-0.5 hover:text-terra-900 dark:hover:text-terra-100 transition-colors"
              aria-label={`${ingredient} entfernen`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={selectedIngredients.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder:text-warm-400"
          data-testid="ingredient-input"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          disabled={selectedIngredients.length >= maxItems}
        />
      </div>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <ul
          ref={dropdownRef}
          role="listbox"
          data-testid="autocomplete-dropdown"
          className={[
            "absolute z-20 left-0 right-0 mt-1",
            "bg-[var(--bg-surface)] border border-[var(--border-base)]",
            "rounded-lg shadow-lg overflow-y-auto max-h-48",
          ].join(" ")}
        >
          {suggestions.map((suggestion, idx) => (
            <li
              key={suggestion}
              id={`suggestion-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                addIngredient(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={[
                "px-3 py-2 text-sm cursor-pointer transition-colors",
                idx === activeIndex
                  ? "bg-terra-50 text-terra-700 dark:bg-terra-900/20 dark:text-terra-300"
                  : "text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
              ].join(" ")}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}

      {/* Hint */}
      {selectedIngredients.length === 0 && (
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Geben Sie Zutaten ein, die Sie zu Hause haben. Drücken Sie Enter zum Hinzufügen.
        </p>
      )}
    </div>
  );
}
