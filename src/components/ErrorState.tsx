import React from "react";
import { EmptyState } from "./EmptyState";

/** Friendly failure state with a retry action. Message must already be user-safe (see toUserMessage). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="⚠️"
      title="We hit a snag"
      subtitle={message}
      actionLabel={onRetry ? "Try again" : undefined}
      onAction={onRetry}
    />
  );
}
