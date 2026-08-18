// src/shared/ui/states/index.ts
//
// Barrel export for all UI state components.
// Import from here: import { ErrorState, TimeoutState } from "~/shared/ui/states";

export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";

export { TimeoutState } from "./TimeoutState";
export type { TimeoutStateProps } from "./TimeoutState";

export { OfflineState } from "./OfflineState";
export type { OfflineStateProps } from "./OfflineState";

export { NotFoundState } from "./NotFoundState";
export type { NotFoundStateProps } from "./NotFoundState";

export { PermissionDenied } from "./PermissionDenied";
export type { PermissionDeniedProps } from "./PermissionDenied";

export { UnauthorizedState } from "./UnauthorizedState";
export type { UnauthorizedStateProps } from "./UnauthorizedState";

export { RateLimitState } from "./RateLimitState";
export type { RateLimitStateProps } from "./RateLimitState";

export { ServerErrorState } from "./ServerErrorState";
export type { ServerErrorStateProps } from "./ServerErrorState";

export { DisabledState } from "./DisabledState";
export type { DisabledStateProps } from "./DisabledState";

export { RefreshingIndicator } from "./RefreshingIndicator";
export type { RefreshingIndicatorProps } from "./RefreshingIndicator";

export { MutationButton } from "./MutationButton";
export type { MutationButtonProps, MutationStatus } from "./MutationButton";

export { LoadMoreState } from "./LoadMoreState";
export type { LoadMoreStateProps } from "./LoadMoreState";

export { AuthGate } from "./AuthGate";

export { ImageWithFallback } from "./ImageWithFallback";
export type { ImageWithFallbackProps } from "./ImageWithFallback";

export { ConflictState } from "./ConflictState";
export type { ConflictStateProps } from "./ConflictState";
