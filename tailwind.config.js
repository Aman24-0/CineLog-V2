/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      /* ─── Font Families ───
         Maps --font-family-* tokens to Tailwind font-family utilities.
         Usage: font-display, font-heading, font-body, font-label */
      fontFamily: {
        'display': ['var(--font-family-display)', 'cursive'],
        'heading': ['var(--font-family-heading)', 'sans-serif'],
        'body': ['var(--font-family-body)', 'sans-serif'],
        'label': ['var(--font-family-label)', 'monospace'],
        'mono': ['var(--font-family-mono)', 'monospace'],
      },

      /* ─── Font Sizes ───
         Maps --font-size-* tokens to Tailwind text-* utilities.
         Usage: text-2xs, text-xs, text-sm, text-md, text-base, etc. */
      fontSize: {
        '2xs': ['var(--font-size-2xs)', { lineHeight: '1' }],
        'xs': ['var(--font-size-xs)', { lineHeight: '1.2' }],
        'sm': ['var(--font-size-sm)', { lineHeight: '1.3' }],
        'md': ['var(--font-size-md)', { lineHeight: '1.4' }],
        'base': ['var(--font-size-base)', { lineHeight: '1.3' }],
        'lg': ['var(--font-size-lg)', { lineHeight: '1.4' }],
        'xl': ['var(--font-size-xl)', { lineHeight: '1.4' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: '1.5' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: '1.55' }],
        '4xl': ['var(--font-size-4xl)', { lineHeight: '1.5' }],
        '5xl': ['var(--font-size-5xl)', { lineHeight: '1.3' }],
        '6xl': ['var(--font-size-6xl)', { lineHeight: '1.25' }],
        '7xl': ['var(--font-size-7xl)', { lineHeight: '1' }],
        '8xl': ['var(--font-size-8xl)', { lineHeight: '1' }],
        '9xl': ['var(--font-size-9xl)', { lineHeight: '1' }],
        '10xl': ['var(--font-size-10xl)', { lineHeight: '1' }],
        '11xl': ['var(--font-size-11xl)', { lineHeight: '0.95' }],
        '12xl': ['var(--font-size-12xl)', { lineHeight: '0.92' }],
      },

      /* ─── Font Weights ───
         Maps --font-weight-* tokens to Tailwind font-weight utilities.
         Usage: font-regular, font-medium, font-semibold, etc. */
      fontWeight: {
        'regular': 'var(--font-weight-regular)',
        'medium': 'var(--font-weight-medium)',
        'semibold': 'var(--font-weight-semibold)',
        'bold': 'var(--font-weight-bold)',
        'extrabold': 'var(--font-weight-extrabold)',
        'black': 'var(--font-weight-black)',
      },

      /* ─── Line Heights ───
         Maps --line-height-* tokens to Tailwind leading-* utilities.
         Usage: leading-none, leading-tight, leading-snug, etc. */
      lineHeight: {
        'none': 'var(--line-height-none)',
        'tight': 'var(--line-height-tight)',
        'snug': 'var(--line-height-snug)',
        'normal': 'var(--line-height-normal)',
        'relaxed': 'var(--line-height-relaxed)',
      },

      /* ─── Letter Spacing ───
         Maps --letter-spacing-* tokens to Tailwind tracking-* utilities.
         Usage: tracking-tighter, tracking-tight, tracking-normal, etc. */
      letterSpacing: {
        'tighter': 'var(--letter-spacing-tighter)',
        'tight': 'var(--letter-spacing-tight)',
        'normal': 'var(--letter-spacing-normal)',
        'wide': 'var(--letter-spacing-wide)',
        'wider': 'var(--letter-spacing-wider)',
        'wider-2': 'var(--letter-spacing-wider-2)',
        'extra-wide': 'var(--letter-spacing-extra-wide)',
        'ultra-wide': 'var(--letter-spacing-ultra-wide)',
        'micro': 'var(--letter-spacing-micro)',
        'label': 'var(--letter-spacing-label)',
        'label-wide': 'var(--letter-spacing-label-wide)',
        'eyebrow': 'var(--letter-spacing-eyebrow)',
      },

      /* ─── Spacing ───
         Maps --space-* tokens to Tailwind spacing utilities.
         Usage: p-1, m-2, gap-3, space-x-4, etc. */
      spacing: {
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '5': 'var(--space-5)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '10': 'var(--space-10)',
        '12': 'var(--space-12)',
        '14': 'var(--space-14)',
        '16': 'var(--space-16)',
        '20': 'var(--space-20)',
      },

      /* ─── Border Radius ───
         Maps --radius-* tokens to Tailwind rounded-* utilities.
         Usage: rounded-2xs, rounded-xs, rounded-sm, rounded-md, etc. */
      borderRadius: {
        '2xs': 'var(--radius-2xs)',
        '3xs': 'var(--radius-3xs)',
        'xs': 'var(--radius-xs)',
        '4': 'var(--radius-4)',
        '5': 'var(--radius-5)',
        '6': 'var(--radius-6)',
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'card': 'var(--radius-card)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': '32px',
        'modal': 'var(--radius-modal)',
        'pill': 'var(--radius-pill)',
        'full': 'var(--radius-full)',
      },

      /* ─── Box Shadows ───
         Maps --shadow-* tokens to Tailwind shadow-* utilities.
         Usage: shadow-xs, shadow-sm, shadow-md, shadow-lg, shadow-xl,
                shadow-card, shadow-raised, shadow-float, shadow-glow,
                shadow-premium, shadow-elevated, shadow-hero,
                shadow-elevation-1, shadow-elevation-2, shadow-elevation-3 */
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        'card': 'var(--shadow-card)',
        'raised': 'var(--shadow-raised)',
        'float': 'var(--shadow-float)',
        'glow': 'var(--shadow-glow)',
        'premium': 'var(--shadow-premium)',
        'elevated': 'var(--shadow-elevated)',
        'hero': 'var(--shadow-hero)',
        /* Phase 3 — Elevation composite shadows */
        'elevation-1': 'var(--elevation-1-shadow-composite)',
        'elevation-2': 'var(--elevation-2-shadow-composite)',
        'elevation-3': 'var(--elevation-3-shadow-composite)',
        /* Phase 3 — Glass shadows */
        'glass-card': 'var(--shadow-glass-card)',
        'glass-elevated': 'var(--shadow-glass-elevated)',
        'glass-glow': 'var(--shadow-glass-glow)',
      },

      /* ─── Colors ───
         Maps semantic color tokens to Tailwind color utilities.
         Usage: bg-primary, text-success, border-danger, etc.
         NOTE: Theme accent colors (--p, --p2) are runtime variables
         and must use var() references, not static hex values. */
      colors: {
        /* Surface tiers */
        'void': 'var(--void)',
        'deep': 'var(--deep)',
        'surface': 'var(--surface)',
        'raised': 'var(--raised)',
        'tier-0': 'var(--tier-0)',
        'tier-1': 'var(--tier-1)',
        'tier-2': 'var(--tier-2)',
        'tier-3': 'var(--tier-3)',
        'tier-4': 'var(--tier-4)',

        /* Semantic colors */
        'primary': 'var(--color-primary)',
        'primary-secondary': 'var(--color-primary-secondary)',
        'primary-glow': 'var(--color-primary-glow)',
        'primary-dim': 'var(--color-primary-dim)',
        'on-primary': 'var(--color-on-primary)',

        /* Text */
        'text-strong': 'var(--color-text-strong)',
        'text-body': 'var(--color-text-body)',
        'text-soft': 'var(--color-text-soft)',
        'text-muted': 'var(--color-text-muted)',
        'text-dim': 'var(--color-text-dim)',

        /* Feedback */
        'success': 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        'success-border': 'var(--color-success-border)',
        'warning': 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        'warning-border': 'var(--color-warning-border)',
        'danger': 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        'danger-border': 'var(--color-danger-border)',
        'info': 'var(--color-info)',
        'info-bg': 'var(--color-info-bg)',
        'info-border': 'var(--color-info-border)',

        /* Status */
        'watching': 'var(--color-status-watching)',
        'watching-bg': 'var(--color-status-watching-bg)',
        'completed': 'var(--color-status-completed)',
        'completed-bg': 'var(--color-status-completed-bg)',
        'planned': 'var(--color-status-planned)',
        'planned-bg': 'var(--color-status-planned-bg)',
        'paused': 'var(--color-status-paused)',
        'paused-bg': 'var(--color-status-paused-bg)',
        'dropped': 'var(--color-status-dropped)',
        'dropped-bg': 'var(--color-status-dropped-bg)',

        /* Ratings */
        'rating-imdb': 'var(--color-rating-imdb)',
        'rating-tmdb': 'var(--color-rating-tmdb)',
        'rating-rt': 'var(--color-rating-rotten-tomatoes)',
        'rating-user': 'var(--color-rating-user)',

        /* Collections */
        'collection-favorites': 'var(--color-collection-favorites)',
        'collection-universe': 'var(--color-collection-universe)',
        'collection-recommendation': 'var(--color-collection-recommendation)',
        'collection-trending': 'var(--color-collection-trending)',
        'collection-theatre': 'var(--color-collection-theatre)',
        'collection-ott': 'var(--color-collection-ott)',

        /* Cinematic Dark Theme tokens */
        'cine-bg': '#0a0a0a',
        'cine-glass': 'rgba(30, 30, 30, 0.65)',
        'cine-border': 'rgba(255, 255, 255, 0.08)',
        /* Glass */
        'glass': 'var(--glass-bg)',
        'glass-strong': 'var(--glass-bg-strong)',
        'glass-border': 'var(--glass-border)',
        /* Phase 3 — Glass variants */
        'glass-subtle': 'var(--glass-subtle-bg)',
        'glass-default': 'var(--glass-default-bg)',
        'glass-medium': 'var(--glass-medium-bg)',
        'glass-heavy': 'var(--glass-heavy-bg)',

        /* Borders */
        'hairline': 'var(--hairline)',
        'hairline-2': 'var(--hairline-2)',
        'hairline-3': 'var(--hairline-3)',
        'border-default': 'var(--border)',
        'border-active': 'var(--border-active)',

        /* Active state */
        'active-bg': 'var(--active-bg)',
        'active-text': 'var(--active-text)',
        /* Phase 3 — Semantic backgrounds */
        'bg-hover': 'var(--color-bg-hover)',
        'bg-pressed': 'var(--color-bg-pressed)',
        'bg-overlay': 'var(--color-bg-overlay)',
        'bg-backdrop': 'var(--color-bg-backdrop)',
        /* Phase 3 — Semantic text states */
        'text-accent': 'var(--color-text-accent)',
        'text-inverse': 'var(--color-text-inverse)',
        'text-link': 'var(--color-text-link)',
        'text-placeholder': 'var(--color-text-placeholder)',
        'text-disabled': 'var(--color-text-disabled)',
        'text-on-accent': 'var(--color-text-on-accent)',
        /* Phase 3 — Semantic border states */
        'border-hover': 'var(--color-border-hover)',
        'border-pressed': 'var(--color-border-pressed)',
        'border-focus': 'var(--color-border-focus)',
      },

      /* ─── Z-Index ───
         Maps --z-* tokens to Tailwind z-* utilities.
         Usage: z-base, z-overlay, z-sticky, z-modal, z-toast, etc. */
      zIndex: {
        'base': 'var(--z-base)',
        'overlay': 'var(--z-overlay)',
        'content': 'var(--z-content)',
        'badge': 'var(--z-badge)',
        'media': 'var(--z-media)',
        'indicator': 'var(--z-indicator)',
        'sticky': 'var(--z-sticky)',
        'dropdown': 'var(--z-dropdown)',
        'overlay-high': 'var(--z-overlay-high)',
        'modal': 'var(--z-modal)',
        'toast': 'var(--z-toast)',
        'tooltip': 'var(--z-tooltip)',
        'max': 'var(--z-max)',
      },

      /* ─── Blur ───
         Maps --blur-* tokens to Tailwind blur-* utilities.
         Usage: blur-xs, blur-sm, blur-md, blur-lg, etc. */
      blur: {
        'xs': 'var(--blur-xs)',
        'sm': 'var(--blur-sm)',
        'md': 'var(--blur-md)',
        'lg': 'var(--blur-lg)',
        'xl': 'var(--blur-xl)',
        '2xl': 'var(--blur-2xl)',
        '3xl': 'var(--blur-3xl)',
      },

      /* ─── Opacity ───
         Maps --opacity-* tokens to Tailwind opacity utilities.
         Usage: opacity-disabled, opacity-muted, opacity-overlay, etc. */
      opacity: {
        'disabled': 'var(--opacity-disabled)',
        'muted': 'var(--opacity-muted)',
        'overlay': 'var(--opacity-overlay)',
        'hover': 'var(--opacity-hover)',
        'hidden': 'var(--opacity-hidden)',
        'ambient': 'var(--opacity-ambient)',
        'soft': 'var(--opacity-soft)',
        'medium': 'var(--opacity-medium)',
        'strong': 'var(--opacity-strong)',
        'near': 'var(--opacity-near)',
        'full': 'var(--opacity-full)',
      },

      /* ─── Transition Duration ───
         Maps --dur-* / --duration-* tokens to Tailwind duration-* utilities.
         Usage: duration-micro, duration-fast, duration-base, etc. */
      transitionDuration: {
        'micro': 'var(--dur-micro)',
        'instant': 'var(--dur-instant)',
        'focus': 'var(--dur-focus)',
        'hover': 'var(--dur-hover)',
        'press': 'var(--dur-press)',
        'fast': 'var(--dur-fast)',
        'base': 'var(--dur-base)',
        'enter': 'var(--dur-enter)',
        'exit': 'var(--dur-exit)',
        'modal': 'var(--dur-modal)',
        'layout': 'var(--dur-layout)',
        'page': 'var(--dur-page)',
        'slow': 'var(--dur-slow)',
        'normal': 'var(--duration-normal)',
        'reduced': 'var(--dur-reduced)',
      },

      /* ─── Transition Timing / Easing ───
         Maps --ease-* tokens to Tailwind ease-* utilities.
         Usage: ease-spring, ease-smooth, ease-out, etc. */
      transitionTimingFunction: {
        'spring': 'var(--ease-spring)',
        'spring-gentle': 'var(--ease-spring-gentle)',
        'spring-bouncy': 'var(--ease-spring-bouncy)',
        'spring-snappy': 'var(--ease-spring-snappy)',
        'smooth': 'var(--ease-smooth)',
        'out': 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        'standard': 'var(--ease-standard)',
        'emphasized': 'var(--ease-emphasized)',
        'decelerate': 'var(--ease-decelerate)',
        'accelerate': 'var(--ease-accelerate)',
        'reduced': 'var(--ease-reduced)',
      },

      /* ─── Backdrop Blur ───
         Maps --blur-* tokens to Tailwind backdrop-blur-* utilities.
         Usage: backdrop-blur-xs, backdrop-blur-sm, etc. */
      backdropBlur: {
        'xs': 'var(--blur-xs)',
        'sm': 'var(--blur-sm)',
        'md': 'var(--blur-md)',
        'lg': 'var(--blur-lg)',
        'xl': 'var(--blur-xl)',
        '2xl': 'var(--blur-2xl)',
        '3xl': 'var(--blur-3xl)',
        'glass': '16px',
      },
      /* ─── Phase 3 — Height Utilities ───
         Maps --height-* tokens to Tailwind h-* utilities.
         Usage: h-input, h-button, h-button-sm, h-chip, etc. */
      height: {
        'input': 'var(--height-input)',
        'input-sm': 'var(--height-input-sm)',
        'input-lg': 'var(--height-input-lg)',
        'button': 'var(--height-button)',
        'button-sm': 'var(--height-button-sm)',
        'button-lg': 'var(--height-button-lg)',
        'button-icon': 'var(--height-button-icon)',
        'button-icon-sm': 'var(--height-button-icon-sm)',
        'button-icon-lg': 'var(--height-button-icon-lg)',
        'tab': 'var(--height-tab)',
        'chip': 'var(--height-chip)',
        'chip-sm': 'var(--height-chip-sm)',
        'navbar': 'var(--nav-height)',
        'header': 'var(--app-header-height)',
        'row': 'var(--height-row)',
        'row-compact': 'var(--height-row-compact)',
        'row-comfortable': 'var(--height-row-comfortable)',
      },

      /* ─── Phase 3 — Min Height (touch targets) ─── */
      minHeight: {
        'touch': 'var(--touch-target-min)',
        'touch-lg': 'var(--touch-target-comfortable)',
      },
    }
  },
  plugins: []
};
