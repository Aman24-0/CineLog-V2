import { type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";

const StatsHeader: Component = () => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      class="profile-stats-header focus-ring"
      onClick={() => navigate("/profile/stats")}
      aria-label="Open watching statistics"
    >
      <span>Watching Stats</span>
      <span
        class="material-symbols-outlined profile-stats-header-icon"
        aria-hidden="true"
      >
        arrow_forward
      </span>
    </button>
  );
};

export default StatsHeader;
