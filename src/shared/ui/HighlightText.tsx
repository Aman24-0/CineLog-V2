// src/shared/ui/HighlightText.tsx
import { Show, For } from "solid-js";

interface HighlightTextProps {
  text?: string;
  search?: string;
}

export default function HighlightText(props: HighlightTextProps) {
  const parts = () => {
    if (!props.text) return [];
    if (!props.search || !props.search.trim()) return [props.text];
    const regex = new RegExp(
      `(${props.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    return props.text.split(regex);
  };

  return (
    <Show
      when={props.search && props.search.trim().length > 0}
      fallback={<>{props.text}</>}
    >
      <For each={parts()}>
        {(part) => (
          <Show
            when={part.toLowerCase() === props.search!.toLowerCase()}
            fallback={part}
          >
            <span style={{ color: "var(--p)" }}>{part}</span>
          </Show>
        )}
      </For>
    </Show>
  );
}
