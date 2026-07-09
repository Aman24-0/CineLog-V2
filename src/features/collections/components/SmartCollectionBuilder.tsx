// src/features/collections/components/SmartCollectionBuilder.tsx
import { createSignal, createMemo, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import { useVault } from "~/features/watchlist/useVault";
import { evaluateSmartRules } from "../utils/evaluateSmartRules";
import type { SmartRule } from "~/shared/types";

interface SmartCollectionBuilderProps {
  onClose: () => void;
}

const FIELD_OPTIONS = [
  { value: "director", label: "Director" },
  { value: "genre", label: "Genre" },
  { value: "franchise", label: "Franchise" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
  { value: "status", label: "Status" },
  { value: "keyword", label: "Keyword" }
] as const;

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  director: [{ value: "contains", label: "contains" }, { value: "is", label: "is" }],
  genre: [{ value: "contains", label: "is" }],
  franchise: [{ value: "is", label: "is" }],
  year: [{ value: "gte", label: "≥" }, { value: "lte", label: "≤" }, { value: "between", label: "between" }],
  rating: [{ value: "gte", label: "≥" }, { value: "lte", label: "≤" }],
  status: [{ value: "is", label: "is" }],
  keyword: [{ value: "contains", label: "contains" }]
};

const STATUS_OPTIONS = ["Planned", "Watching", "Completed"];

/**
 * SmartCollectionBuilder — create rule-based smart collections.
 *
 * Rule builder with live preview of matching vault items count.
 */
export default function SmartCollectionBuilder(props: SmartCollectionBuilderProps) {
  const { createSmartCollection } = useCollections();
  const { watchlist } = useVault();

  const [name, setName] = createSignal("");
  const [rules, setRules] = createSignal<SmartRule[]>([
    { field: "genre", operator: "contains", value: "" }
  ]);

  const addRule = () => {
    setRules((prev) => [...prev, { field: "genre", operator: "contains", value: "" }]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, partial: Partial<SmartRule>) => {
    setRules((prev) => prev.map((r, i) => i === index ? { ...r, ...partial } : r));
  };

  /** Live preview count */
  const matchCount = createMemo(() => {
    const validRules = rules().filter((r) => r.value !== "" && r.value !== undefined);
    if (validRules.length === 0) return 0;
    return evaluateSmartRules(validRules, watchlist()).length;
  });

  const handleCreate = async () => {
    const n = name().trim();
    if (!n) return;
    const validRules = rules().filter((r) => r.value !== "" && r.value !== undefined);
    if (validRules.length === 0) return;
    await createSmartCollection(n, validRules);
    props.onClose();
  };

  return (
    <Portal>
      <div
        class="fixed inset-0 z-[999997] flex items-end justify-center animate-fade-in"
        onClick={props.onClose}
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} aria-hidden="true" />
        <div
          class="smart-builder"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="folder-editor-header">
            <h3 class="folder-editor-title">Smart Collection</h3>
            <button type="button" class="folder-editor-close" onClick={props.onClose} aria-label="Close">
              <span class="material-symbols-outlined" style="font-size: 20px" aria-hidden="true">close</span>
            </button>
          </div>

          {/* Name */}
          <input
            type="text"
            class="folder-editor-name-input"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Collection name…"
            style={{ "margin-bottom": "var(--sp-3)" }}
          />

          {/* Rules */}
          <div class="smart-builder-rules">
            <For each={rules()}>
              {(rule, index) => (
                <div class="smart-rule-row">
                  <select
                    class="smart-rule-select"
                    value={rule.field}
                    onChange={(e) => updateRule(index(), { field: e.currentTarget.value as SmartRule["field"], operator: (OPERATOR_OPTIONS[e.currentTarget.value]?.[0]?.value ?? "contains") as SmartRule["operator"], value: "" })}
                  >
                    <For each={FIELD_OPTIONS}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>

                  <select
                    class="smart-rule-select smart-rule-operator"
                    value={rule.operator}
                    onChange={(e) => updateRule(index(), { operator: e.currentTarget.value as SmartRule["operator"] })}
                  >
                    <For each={OPERATOR_OPTIONS[rule.field] ?? []}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>

                  <Show when={rule.field === "status"} fallback={
                    <input
                      type={rule.field === "year" || rule.field === "rating" ? "number" : "text"}
                      class="smart-rule-input"
                      value={String(rule.value)}
                      onInput={(e) => updateRule(index(), { value: e.currentTarget.value })}
                      placeholder={rule.field === "year" ? "2024" : rule.field === "rating" ? "8" : "Value…"}
                    />
                  }>
                    <select
                      class="smart-rule-select"
                      value={String(rule.value)}
                      onChange={(e) => updateRule(index(), { value: e.currentTarget.value })}
                    >
                      <For each={STATUS_OPTIONS}>
                        {(s) => <option value={s}>{s}</option>}
                      </For>
                    </select>
                  </Show>

                  <button
                    type="button"
                    class="smart-rule-remove"
                    onClick={() => removeRule(index())}
                    aria-label="Remove rule"
                  >
                    <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">close</span>
                  </button>
                </div>
              )}
            </For>
          </div>

          <button type="button" class="smart-builder-add-rule" onClick={addRule}>
            <span class="material-symbols-outlined" style="font-size: 16px" aria-hidden="true">add</span>
            Add Rule
          </button>

          {/* Preview */}
          <div class="smart-preview">
            <span class="smart-preview-count">{matchCount()}</span>
            <span class="smart-preview-label">titles match</span>
          </div>

          {/* Create */}
          <button
            type="button"
            class="btn-primary"
            style={{ width: "100%", "margin-top": "var(--sp-3)" }}
            onClick={handleCreate}
            disabled={!name().trim() || matchCount() === 0}
          >
            Create Smart Collection
          </button>
        </div>
      </div>
    </Portal>
  );
}
