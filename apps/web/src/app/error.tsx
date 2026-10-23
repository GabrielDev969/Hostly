'use client';

import { ErrorState } from '@/components/states';

export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState fullscreen onRetry={reset} />;
}
