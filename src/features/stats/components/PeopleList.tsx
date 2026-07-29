// src/features/stats/components/PeopleList.tsx
//
// PeopleList — a two-column card showing the user's most-watched
// directors (left) and actors (right). Each entry shows the name and
// the count of titles in parentheses, plus a thin horizontal bar
// proportional to the count so the eye can compare at a glance.
//
// When a column is empty (e.g. the user hasn't added any cast data),
// we show a small muted note instead of an empty list.

import { Show, For, type Component, type Accessor } from "solid-js";
import { GlassCard, GlassEmptyState } from "~/shared/ui/glass";
import type { PersonCount } from "~/lib/supabase/repositories/stats";

interface PeopleListProps {
  directors: Accessor<PersonCount[]>;
  actors: Accessor<PersonCount[]>;
}

const PeopleList: Component<PeopleListProps> = (props) => {
  return (
    <div class="stats-people-grid">
      <PeopleColumn
        icon="movie_creation"
        title="Top Directors"
        emptyMessage="No director data yet — TMDB enrichment will populate this as you add titles."
        people={props.directors}
        accent="#f5c518"
      />
      <PeopleColumn
        icon="groups"
        title="Top Actors"
        emptyMessage="No cast data yet — TMDB enrichment will populate this as you add titles."
        people={props.actors}
        accent="#7c8cff"
      />
    </div>
  );
};

interface PeopleColumnProps {
  icon: string;
  title: string;
  emptyMessage: string;
  people: Accessor<PersonCount[]>;
  accent: string;
}

const PeopleColumn: Component<PeopleColumnProps> = (props) => {
  const max = (): number => Math.max(1, ...props.people().map((p) => p.count));
  return (
    <GlassCard padding="default" class="stats-people-column">
      <div class="stats-people-header">
        <div class="stats-people-icon" style={{ background: `${props.accent}22`, color: props.accent }} aria-hidden="true">
          <span class="material-symbols-outlined" style={{ "font-size": "18px" }} aria-hidden="true">
            {props.icon}
          </span>
        </div>
        <h3 class="stats-people-title">{props.title}</h3>
      </div>
      <Show
        when={props.people().length > 0}
        fallback={
          <GlassEmptyState
            icon="person_off"
            title="No data yet"
            message={props.emptyMessage}
            variant="compact"
          />
        }
      >
        <ol class="stats-people-list">
          <For each={props.people()}>
            {(person, idx) => (
              <li class="stats-people-row">
                <span class="stats-people-rank">{idx() + 1}</span>
                <div class="stats-people-info">
                  <span class="stats-people-name">{person.name}</span>
                  <div class="stats-people-bar-track">
                    <div
                      class="stats-people-bar-fill"
                      style={{
                        width: `${(person.count / max()) * 100}%`,
                        background: props.accent,
                      }}
                    />
                  </div>
                </div>
                <span class="stats-people-count" style={{ color: props.accent }}>
                  {person.count}
                </span>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </GlassCard>
  );
};

export default PeopleList;
