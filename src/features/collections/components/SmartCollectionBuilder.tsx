// src/features/collections/components/SmartCollectionBuilder.tsx
import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { useCollections } from "../hooks/useCollections";
import { useVault } from "~/features/watchlist/useVault";
import { evaluateSmartRules } from "../utils/evaluateSmartRules";
import type { SmartRule } from "~/shared/types";

interface SmartCollectionBuilderProps {
  onClose: () => void;
  /** Optional initial rules + name when editing an existing smart
   *  collection. When provided, the submit button reads "Update"
   *  instead of "Create". */
  initial?: { name?: string; rules?: SmartRule[]; combinator?: "and" | "or" };
  collectionId?: string;
}

// Field options — the spec asks for: Genre, Year, Rating, Status,
// Release Date (plus we keep Director, Franchise, Keyword from the
// original implementation since they're already wired through
// evaluateSmartRules).
const FIELD_OPTIONS = [
  { value: "genre", label: "Genre" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
  { value: "status", label: "Status" },
  { value: "release_date", label: "Release Date" },
  { value: "director", label: "Director" },
  { value: "franchise", label: "Franchise" },
  { value: "keyword", label: "Keyword" }
] as const;

const OPERATOR_OPTIONS: Record<string, { value: string; label: string }[]> = {
  genre: [
    { value: "contains", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  year: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "between", label: "between" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  rating: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "between", label: "between" }
  ],
  status: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  release_date: [
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "between", label: "between" }
  ],
  director: [
    { value: "contains", label: "contains" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  franchise: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  keyword: [{ value: "contains", label: "contains" }]
};

const STATUS_OPTIONS = [
  "Planned",
  "Watching",
  "Completed",
  "On Hold",
  "Dropped"
];

/**
 * SmartCollectionBuilder — create rule-based smart collections.
 *
 * v3 redesign:
 *   • AND/OR combinator toggle between rules (was AND-only).
 *   • Value autocomplete via <datalist> — populated from the user's
 *     actual vault data (genres, directors, franchises, years) so
 *     the user picks from real values instead of typing blind.
 *   • Live preview now shows the FIRST FEW matching titles (poster
 *     thumbnails) instead of just a count.
 *   • Added "Release Date" + "is not" operators per spec.
 *
 * Phase 6 Task 1 — FULLY WIRED:
 *   • On CREATE: calls `createSmartCollection(name, rules, combinator)`
 *     which persists both the rules AND the combinator to the
 *     `collections.rules` JSONB column (migration 20260804_add_collections_rules).
 *   • On EDIT (when `collectionId` is provided): calls
 *     `updateSmartRules(collectionId, rules, combinator)` to update the
 *     persisted rules. The `initial` prop hydrates the form from the
 *     collection's existing `smartRules` + `smartRulesCombinator`.
 *   • The combinator is now part of the persisted payload, so an
 *     "OR" collection survives a page refresh.
 */
export default function SmartCollectionBuilder(
  props: SmartCollectionBuilderProps
) {
  const { createSmartCollection, updateSmartRules } = useCollections();
  const { watchlist } = useVault();

  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [rules, setRules] = createSignal<SmartRule[]>(
    props.initial?.rules ?? [
      { field: "genre", operator: "contains", value: "" }
    ]
  );
  const [combinator, setCombinator] = createSignal<"and" | "or">(
    props.initial?.combinator ?? "and"
  );
  const [isSaving, setIsSaving] = createSignal(false);

  // Build autocomplete suggestions from the user's actual vault data.
  // Each field maps to a list of unique values that exist in the vault.
  const suggestions = createMemo<Record<string, string[]>>(() => {
    const items = watchlist();
    const genres = new Set<string>();
    const directors = new Set<string>();
    const franchises = new Set<string>();
    const years = new Set<string>();
    const releaseDates = new Set<string>();

    for (const item of items) {
      // Genres — could be array or comma-separated string
      const g = (item as { genres?: unknown }).genres;
      if (Array.isArray(g)) {
        for (const x of g) genres.add(String(x));
      } else if (typeof g === "string") {
        for (const x of g.split(",")) genres.add(x.trim());
      }
      // Director
      const d = (item as { director?: unknown }).director;
      if (typeof d === "string" && d.trim()) directors.add(d.trim());
      // Franchise
      const f = (item as { franchise?: unknown }).franchise;
      if (typeof f === "string" && f.trim()) franchises.add(f.trim());
      // Year (from release_date / first_air_date)
      const rd =
        (item as { release_date?: string; first_air_date?: string })
          .release_date ?? (item as { first_air_date?: string }).first_air_date;
      if (rd) {
        years.add(rd.slice(0, 4));
        releaseDates.add(rd);
      }
    }

    return {
      genre: Array.from(genres).sort(),
      director: Array.from(directors).sort(),
      franchise: Array.from(franchises).sort(),
      year: Array.from(years).sort(),
      release_date: Array.from(releaseDates).sort(),
      rating: [], // rating is numeric — no autocomplete
      status: STATUS_OPTIONS,
      keyword: [] // free-form
    };
  });

  // Live preview — evaluate the rules against the vault.
  const validRules = createMemo(() =>
    rules().filter(
      (r) => r.value !== "" && r.value !== undefined && r.value !== null
    )
  );

  // Phase 6 Task 1: evaluateSmartRules now accepts the combinator, so the
  // live preview matches what getCollectionProgress / resolveSmartCollection
  // will produce on the collection detail page. The previous OR branch
  // (manual union) is no longer needed.
  const matchedItems = createMemo(() => {
    if (validRules().length === 0) return [];
    return evaluateSmartRules(validRules(), watchlist(), combinator());
  });

  const matchCount = () => matchedItems().length;

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { field: "genre", operator: "contains", value: "" }
    ]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, partial: Partial<SmartRule>) => {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...partial } : r))
    );
  };

  const handleFieldChange = (index: number, newField: string) => {
    const firstOp = OPERATOR_OPTIONS[newField]?.[0]?.value ?? "contains";
    updateRule(index, {
      field: newField as SmartRule["field"],
      operator: firstOp as SmartRule["operator"],
      value: ""
    });
  };

  const handleCreate = async () => {
    const n = name().trim();
    if (!n) return;
    if (validRules().length === 0) return;
    setIsSaving(true);
    try {
      if (isEditing() && props.collectionId) {
        // Edit mode — update the existing smart collection's rules
        // (and combinator). The name is NOT changed here; renaming is
        // done via the FolderEditor / renameCollection.
        await updateSmartRules(
          props.collectionId,
          validRules(),
          combinator()
        );
      } else {
        // Create mode — persist a brand-new smart collection.
        await createSmartCollection(n, validRules(), combinator());
      }
      props.onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Lock body scroll while the modal is open.
  onMount(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  });

  const isEditing = () => !!props.initial;

  return (
    <Portal>
      <div
        class="animate-fade-in fixed inset-0 z-[999997] flex items-end justify-center sm:items-center"
        onClick={() => props.onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div
          class="absolute inset-0"
          style={{
            background: "rgba(0,0,0,0.75)",
            "backdrop-filter": "blur(8px)",
            "-webkit-backdrop-filter": "blur(8px)"
          }}
          aria-hidden="true"
        />
        <div
          class="smart-builder"
          onClick={(e) => e.stopPropagation()}
          style={{ "max-height": "90vh", "overflow-y": "auto" }}
        >
          <div class="folder-editor-header">
            <h3 class="folder-editor-title">
              {isEditing() ? "Edit Smart Collection" : "Smart Collection"}
            </h3>
            <button
              type="button"
              class="folder-editor-close"
              onClick={() => props.onClose()}
              aria-label="Close"
            >
              <span
                class="material-symbols-outlined"
                style={{ "font-size": "20px" }}
                aria-hidden="true"
              >
                close
              </span>
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

          {/* AND / OR combinator toggle */}
          <Show when={rules().length > 1}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--sp-2)",
                "margin-bottom": "var(--sp-3)"
              }}
            >
              <span
                style={{
                  "font-size": "0.6875rem",
                  color: "var(--text-dim)",
                  "font-family": "'Outfit', sans-serif"
                }}
              >
                Match
              </span>
              <div
                role="radiogroup"
                aria-label="Rule combinator"
                style={{
                  display: "inline-flex",
                  background: "var(--glass-bg)",
                  border: "1px solid var(--hairline)",
                  "border-radius": "999px",
                  padding: "2px"
                }}
              >
                <button
                  type="button"
                  class="focus-ring"
                  onClick={() => setCombinator("and")}
                  aria-pressed={combinator() === "and"}
                  style={{
                    padding: "4px 12px",
                    "border-radius": "999px",
                    border: "none",
                    background:
                      combinator() === "and" ? "var(--p)" : "transparent",
                    color: combinator() === "and" ? "#fff" : "var(--text-soft)",
                    "font-family": "'Outfit', sans-serif",
                    "font-size": "0.6875rem",
                    "font-weight": "600",
                    cursor: "pointer"
                  }}
                >
                  ALL (AND)
                </button>
                <button
                  type="button"
                  class="focus-ring"
                  onClick={() => setCombinator("or")}
                  aria-pressed={combinator() === "or"}
                  style={{
                    padding: "4px 12px",
                    "border-radius": "999px",
                    border: "none",
                    background:
                      combinator() === "or" ? "var(--p)" : "transparent",
                    color: combinator() === "or" ? "#fff" : "var(--text-soft)",
                    "font-family": "'Outfit', sans-serif",
                    "font-size": "0.6875rem",
                    "font-weight": "600",
                    cursor: "pointer"
                  }}
                >
                  ANY (OR)
                </button>
              </div>
              <span
                style={{
                  "font-size": "0.6875rem",
                  color: "var(--text-dim)",
                  "font-family": "'Outfit', sans-serif"
                }}
              >
                of the following rules
              </span>
            </div>
          </Show>

          {/* Rules */}
          <div class="smart-builder-rules">
            <For each={rules()}>
              {(rule, index) => (
                <div class="smart-rule-row">
                  <select
                    class="smart-rule-select"
                    value={rule.field}
                    onChange={(e) =>
                      handleFieldChange(index(), e.currentTarget.value)
                    }
                  >
                    <For each={FIELD_OPTIONS}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>

                  <select
                    class="smart-rule-select smart-rule-operator"
                    value={rule.operator}
                    onChange={(e) =>
                      updateRule(index(), {
                        operator: e.currentTarget.value as SmartRule["operator"]
                      })
                    }
                  >
                    <For each={OPERATOR_OPTIONS[rule.field] ?? []}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>

                  <Show
                    when={rule.field === "status"}
                    fallback={
                      <>
                        <input
                          type={
                            rule.field === "year" || rule.field === "rating"
                              ? "number"
                              : "text"
                          }
                          class="smart-rule-input"
                          value={String(rule.value)}
                          onInput={(e) =>
                            updateRule(index(), {
                              value: e.currentTarget.value
                            })
                          }
                          placeholder={
                            rule.field === "year"
                              ? "2024"
                              : rule.field === "rating"
                                ? "8"
                                : "Value…"
                          }
                          list={`smart-rule-suggestions-${rule.field}`}
                        />
                        <Show
                          when={(suggestions()[rule.field] ?? []).length > 0}
                        >
                          <datalist id={`smart-rule-suggestions-${rule.field}`}>
                            <For each={suggestions()[rule.field] ?? []}>
                              {(s) => <option value={s} />}
                            </For>
                          </datalist>
                        </Show>
                      </>
                    }
                  >
                    <select
                      class="smart-rule-select"
                      value={String(rule.value)}
                      onChange={(e) =>
                        updateRule(index(), { value: e.currentTarget.value })
                      }
                    >
                      <option value="">— Select —</option>
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
                    disabled={rules().length === 1}
                  >
                    <span
                      class="material-symbols-outlined"
                      style={{ "font-size": "16px" }}
                      aria-hidden="true"
                    >
                      close
                    </span>
                  </button>
                </div>
              )}
            </For>
          </div>

          <button
            type="button"
            class="smart-builder-add-rule"
            onClick={addRule}
          >
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "16px" }}
              aria-hidden="true"
            >
              add
            </span>
            Add Rule
          </button>

          {/* Live preview — count + first few matching titles */}
          <div class="smart-preview">
            <span class="smart-preview-count">{matchCount()}</span>
            <span class="smart-preview-label">titles match</span>
          </div>

          <Show when={matchedItems().length > 0}>
            <div
              style={{
                display: "flex",
                gap: "6px",
                "flex-wrap": "wrap",
                "margin-top": "var(--sp-2)",
                "max-height": "80px",
                overflow: "hidden"
              }}
            >
              <For each={matchedItems().slice(0, 12)}>
                {(item) => (
                  <Show when={item.poster_path}>
                    <img
                      src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                      style={{
                        width: "32px",
                        height: "48px",
                        "border-radius": "3px",
                        "object-fit": "cover",
                        border: "1px solid var(--hairline)"
                      }}
                      loading="lazy"
                      decoding="async"
                      alt={item.title ?? item.name ?? ""}
                      title={item.title ?? item.name ?? ""}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </Show>
                )}
              </For>
              <Show when={matchedItems().length > 12}>
                <div
                  style={{
                    width: "32px",
                    height: "48px",
                    "border-radius": "3px",
                    background: "var(--glass-bg)",
                    border: "1px solid var(--hairline)",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    color: "var(--text-dim)",
                    "font-size": "0.5625rem",
                    "font-family": "'Azeret Mono', monospace"
                  }}
                >
                  +{matchedItems().length - 12}
                </div>
              </Show>
            </div>
          </Show>

          {/* Create / Update */}
          <button
            type="button"
            class="btn-primary"
            style={{ width: "100%", "margin-top": "var(--sp-3)" }}
            onClick={handleCreate}
            disabled={
              isSaving() ||
              !name().trim() ||
              matchCount() === 0 ||
              (isEditing() ? false : !name().trim())
            }
          >
            {isSaving()
              ? "Saving…"
              : isEditing()
                ? "Update Smart Collection"
                : "Create Smart Collection"}
          </button>
        </div>
      </div>
    </Portal>
  );
}
