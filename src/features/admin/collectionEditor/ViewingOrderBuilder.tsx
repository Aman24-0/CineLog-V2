// src/features/admin/collectionEditor/ViewingOrderBuilder.tsx
//
// CineLog V2 — Admin Viewing Order Builder (Phase 9 Chunk 5a)
// ---------------------------------------------------------------------
// Admin-defined custom viewing orders for a curated universe.
//
// Each viewing order is a named sequence of entry IDs (e.g. "Release
// Order", "Chronological Order", "Machete Order"). Users see these as
// a dropdown on the universe hub and can switch between them to
// reorder the entry grid.
//
// Features:
//   • List existing viewing orders with name, description, default flag
//   • Create new order (name + description + is_default checkbox)
//   • Edit order metadata inline
//   • Delete order (cascade)
//   • Set as default (only one default per universe)
//   • Reorder entries within an order using up/down buttons
//     (mobile-friendly — no drag-and-drop required)
//   • Preview the order with entry posters + titles
//
// Mobile-responsive: stacks to 1 column on small screens.

import {
  createSignal,
  For,
  Show,
  type Component,
  type Accessor
} from "solid-js";
import {
  type AdminEntry,
  type AdminViewingOrder
} from "./types";
import {
  cardStyle,
  inputStyle,
  btnPrimaryStyle,
  btnSecondaryStyle
} from "./editorStyles";
import {
  createViewingOrder,
  updateViewingOrder,
  deleteViewingOrder,
  reorderViewingOrderEntries
} from "./collectionEditorApi";
import { posterUrl } from "./types";

interface ViewingOrderBuilderProps {
  universeId: string;
  entries: Accessor<AdminEntry[]> | AdminEntry[];
  orders: AdminViewingOrder[];
  onOrdersChange: (orders: AdminViewingOrder[]) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}

interface NewOrderForm {
  name: string;
  description: string;
  is_default: boolean;
}

const ViewingOrderBuilder: Component<ViewingOrderBuilderProps> = (props) => {
  // Resolve entries — accept either an Accessor or a plain array.
  const entriesList = () =>
    Array.isArray(props.entries)
      ? (props.entries as AdminEntry[])
      : (props.entries as Accessor<AdminEntry[]>)();

  const [expandedOrderId, setExpandedOrderId] = createSignal<string | null>(
    null
  );
  const [newOrder, setNewOrder] = createSignal<NewOrderForm>({
    name: "",
    description: "",
    is_default: false
  });
  const [creating, setCreating] = createSignal(false);
  const [busyOrderId, setBusyOrderId] = createSignal<string | null>(null);

  // Build a quick lookup of entry by row ID.
  const entryById = () => {
    const map = new Map<string, AdminEntry>();
    for (const e of entriesList()) {
      map.set(e.id, e);
    }
    return map;
  };

  const handleCreate = async () => {
    const form = newOrder();
    if (!form.name.trim()) {
      props.showToast("Order name is required", "error");
      return;
    }
    setCreating(true);
    try {
      // Default to all entries in their current position order.
      const entryIds = entriesList().map((e) => e.id);
      const created = await createViewingOrder(props.universeId, {
        name: form.name,
        description: form.description,
        is_default: form.is_default,
        entry_ids: entryIds
      });
      // If this was set as default, demote other orders locally.
      let updated = props.orders;
      if (form.is_default) {
        updated = updated.map((o) => ({ ...o, is_default: false }));
      }
      props.onOrdersChange([
        ...updated,
        { ...created, entry_ids: entryIds }
      ]);
      setNewOrder({ name: "", description: "", is_default: false });
      props.showToast(`Created "${created.name}"`, "success");
      setExpandedOrderId(created.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create order";
      props.showToast(msg, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefault = async (order: AdminViewingOrder) => {
    setBusyOrderId(order.id);
    try {
      await updateViewingOrder(order.id, { is_default: true });
      // Demote all others locally.
      props.onOrdersChange(
        props.orders.map((o) => ({
          ...o,
          is_default: o.id === order.id
        }))
      );
      props.showToast(`"${order.name}" is now the default`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to set default";
      props.showToast(msg, "error");
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleDelete = async (order: AdminViewingOrder) => {
    if (
      !confirm(
        `Delete "${order.name}"? This removes the order and its entry sequence.`
      )
    ) {
      return;
    }
    setBusyOrderId(order.id);
    try {
      await deleteViewingOrder(order.id);
      props.onOrdersChange(props.orders.filter((o) => o.id !== order.id));
      if (expandedOrderId() === order.id) setExpandedOrderId(null);
      props.showToast(`Deleted "${order.name}"`, "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete order";
      props.showToast(msg, "error");
    } finally {
      setBusyOrderId(null);
    }
  };

  const moveEntry = async (
    order: AdminViewingOrder,
    fromIdx: number,
    toIdx: number
  ) => {
    if (toIdx < 0 || toIdx >= order.entry_ids.length) return;
    const newIds = [...order.entry_ids];
    const [moved] = newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, moved);
    // Optimistic update.
    props.onOrdersChange(
      props.orders.map((o) =>
        o.id === order.id ? { ...o, entry_ids: newIds } : o
      )
    );
    try {
      await reorderViewingOrderEntries(order.id, newIds);
    } catch (err) {
      // Revert on error.
      props.onOrdersChange(
        props.orders.map((o) =>
          o.id === order.id ? { ...o, entry_ids: order.entry_ids } : o
        )
      );
      const msg = err instanceof Error ? err.message : "Failed to reorder";
      props.showToast(msg, "error");
    }
  };

  return (
    <div
      style={{
        ...cardStyle,
        "margin-top": "var(--sp-5)",
        padding: "var(--sp-4) var(--sp-5)"
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "baseline",
          "justify-content": "space-between",
          "flex-wrap": "wrap",
          gap: "var(--sp-2)",
          "margin-bottom": "var(--sp-3)"
        }}
      >
        <h3
          style={{
            margin: 0,
            "font-size": "1rem",
            color: "var(--text)"
          }}
        >
          Viewing Orders
        </h3>
        <span
          style={{
            "font-size": "0.7rem",
            color: "var(--text-muted)",
            "text-transform": "uppercase",
            "letter-spacing": "0.08em"
          }}
        >
          {props.orders.length}{" "}
          {props.orders.length === 1 ? "order" : "orders"}
        </span>
      </div>
      <p
        style={{
          "font-size": "0.8rem",
          color: "var(--text-muted)",
          "line-height": "1.5",
          "margin-top": 0,
          "margin-bottom": "var(--sp-4)"
        }}
      >
        Build custom viewing orders for this universe (e.g. "Release Order",
        "Chronological Order", "Machete Order"). Users see these as a dropdown
        on the universe hub. Only one order can be the default.
      </p>

      {/* Create new order form */}
      <div
        style={{
          padding: "var(--sp-3)",
          "border-radius": "var(--radius-md)",
          background: "var(--glass-bg, rgba(255,255,255,0.02))",
          border: "1px solid var(--hairline)",
          "margin-bottom": "var(--sp-4)"
        }}
      >
        <div
          style={{
            display: "grid",
            "grid-template-columns": "1fr",
            gap: "var(--sp-2)",
            "margin-bottom": "var(--sp-2)"
          }}
          class="md:grid-cols-2"
        >
          <input
            style={inputStyle}
            placeholder="Order name (e.g. Release Order)"
            value={newOrder().name}
            onInput={(e) =>
              setNewOrder({ ...newOrder(), name: e.currentTarget.value })
            }
          />
          <input
            style={inputStyle}
            placeholder="Description (optional)"
            value={newOrder().description}
            onInput={(e) =>
              setNewOrder({
                ...newOrder(),
                description: e.currentTarget.value
              })
            }
          />
        </div>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--sp-3)",
            "flex-wrap": "wrap"
          }}
        >
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--sp-1)",
              "font-size": "0.8rem",
              color: "var(--text-muted)",
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={newOrder().is_default}
              onChange={(e) =>
                setNewOrder({
                  ...newOrder(),
                  is_default: e.currentTarget.checked
                })
              }
            />
            Set as default
          </label>
          <button
            type="button"
            onClick={handleCreate}
            style={btnPrimaryStyle}
            disabled={creating() || !newOrder().name.trim()}
          >
            {creating() ? "Creating…" : "+ Create order"}
          </button>
        </div>
      </div>

      {/* Orders list */}
      <Show
        when={props.orders.length > 0}
        fallback={
          <div
            style={{
              padding: "var(--sp-4)",
              "text-align": "center",
              color: "var(--text-muted)",
              "font-size": "0.85rem"
            }}
          >
            No viewing orders yet. Create one above to let users switch
            between different watch sequences.
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            "flex-direction": "column",
            gap: "var(--sp-2)"
          }}
        >
          <For each={props.orders}>
            {(order) => {
              const expanded = () => expandedOrderId() === order.id;
              const lookup = entryById();
              return (
                <div
                  style={{
                    border: "1px solid var(--hairline)",
                    "border-radius": "var(--radius-md)",
                    background: order.is_default
                      ? "color-mix(in srgb, var(--p, #7c3aed) 6%, transparent)"
                      : "transparent",
                    overflow: "hidden"
                  }}
                >
                  {/* Header row */}
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--sp-2)",
                      padding: "var(--sp-2) var(--sp-3)",
                      "flex-wrap": "wrap"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId(expanded() ? null : order.id)
                      }
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        "font-size": "0.9rem",
                        padding: "0 var(--sp-1)"
                      }}
                      aria-label={expanded() ? "Collapse" : "Expand"}
                    >
                      {expanded() ? "▼" : "▶"}
                    </button>
                    <strong
                      style={{
                        "font-size": "0.9rem",
                        color: "var(--text)",
                        flex: 1,
                        "min-width": 0,
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap"
                      }}
                    >
                      {order.name}
                    </strong>
                    <Show when={order.is_default}>
                      <span
                        style={{
                          "font-size": "0.65rem",
                          "text-transform": "uppercase",
                          "letter-spacing": "0.08em",
                          padding: "2px 6px",
                          "border-radius": "4px",
                          background:
                            "color-mix(in srgb, var(--p, #7c3aed) 20%, transparent)",
                          color: "var(--text)",
                          "font-weight": 600
                        }}
                      >
                        Default
                      </span>
                    </Show>
                    <span
                      style={{
                        "font-size": "0.7rem",
                        color: "var(--text-muted)"
                      }}
                    >
                      {order.entry_ids.length} entries
                    </span>
                    <Show when={!order.is_default}>
                      <button
                        type="button"
                        onClick={() => handleSetDefault(order)}
                        style={{
                          ...btnSecondaryStyle,
                          padding: "2px 8px",
                          "font-size": "0.7rem"
                        }}
                        disabled={busyOrderId() === order.id}
                      >
                        Set default
                      </button>
                    </Show>
                    <button
                      type="button"
                      onClick={() => handleDelete(order)}
                      style={{
                        ...btnSecondaryStyle,
                        padding: "2px 8px",
                        "font-size": "0.7rem",
                        color: "rgb(239, 68, 68)"
                      }}
                      disabled={busyOrderId() === order.id}
                    >
                      Delete
                    </button>
                  </div>
                  <Show when={order.description}>
                    <div
                      style={{
                        padding: "0 var(--sp-3) var(--sp-2)",
                        "font-size": "0.75rem",
                        color: "var(--text-muted)",
                        "line-height": "1.5"
                      }}
                    >
                      {order.description}
                    </div>
                  </Show>
                  {/* Expanded entry list with up/down reorder */}
                  <Show when={expanded()}>
                    <div
                      style={{
                        "border-top": "1px solid var(--hairline)",
                        padding: "var(--sp-2) var(--sp-3)",
                        "max-height": "400px",
                        "overflow-y": "auto"
                      }}
                    >
                      <Show
                        when={order.entry_ids.length > 0}
                        fallback={
                          <div
                            style={{
                              padding: "var(--sp-3)",
                              "text-align": "center",
                              "font-size": "0.75rem",
                              color: "var(--text-muted)"
                            }}
                          >
                            No entries in this order yet.
                          </div>
                        }
                      >
                        <For each={order.entry_ids}>
                          {(entryId, i) => {
                            const entry = lookup.get(entryId);
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  "align-items": "center",
                                  gap: "var(--sp-2)",
                                  padding: "var(--sp-1) 0",
                                  "border-bottom":
                                    "1px dashed color-mix(in srgb, var(--hairline) 50%, transparent)"
                                }}
                              >
                                <span
                                  style={{
                                    "font-size": "0.7rem",
                                    color: "var(--text-muted)",
                                    "min-width": "20px",
                                    "text-align": "right"
                                  }}
                                >
                                  {i() + 1}
                                </span>
                                <img
                                  src={posterUrl(entry?.poster_path, "w92")}
                                  alt=""
                                  style={{
                                    width: "28px",
                                    height: "42px",
                                    "object-fit": "cover",
                                    "border-radius": "3px",
                                    background: "var(--glass-bg)",
                                    "flex-shrink": 0
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.opacity = "0.2";
                                  }}
                                />
                                <span
                                  style={{
                                    flex: 1,
                                    "font-size": "0.8rem",
                                    color: "var(--text)",
                                    overflow: "hidden",
                                    "text-overflow": "ellipsis",
                                    "white-space": "nowrap"
                                  }}
                                >
                                  {entry?.title ?? "Unknown title"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveEntry(order, i(), i() - 1)
                                  }
                                  disabled={i() === 0}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid var(--hairline)",
                                    color: "var(--text-muted)",
                                    "border-radius": "4px",
                                    padding: "2px 6px",
                                    "font-size": "0.7rem",
                                    cursor: i() === 0 ? "not-allowed" : "pointer",
                                    opacity: i() === 0 ? 0.4 : 1
                                  }}
                                  aria-label="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    moveEntry(order, i(), i() + 1)
                                  }
                                  disabled={i() === order.entry_ids.length - 1}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid var(--hairline)",
                                    color: "var(--text-muted)",
                                    "border-radius": "4px",
                                    padding: "2px 6px",
                                    "font-size": "0.7rem",
                                    cursor:
                                      i() === order.entry_ids.length - 1
                                        ? "not-allowed"
                                        : "pointer",
                                    opacity:
                                      i() === order.entry_ids.length - 1
                                        ? 0.4
                                        : 1
                                  }}
                                  aria-label="Move down"
                                >
                                  ↓
                                </button>
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ViewingOrderBuilder;
