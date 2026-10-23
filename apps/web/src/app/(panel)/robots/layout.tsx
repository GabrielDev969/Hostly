'use client';

import type { ReactNode } from 'react';
import { LiveRobotsProvider } from '@/features/robots/live/live-robots';

// The live channel stays open across the list and the detail, and closes when leaving the section.
export default function RobotsLayout({ children }: { children: ReactNode }) {
  return <LiveRobotsProvider>{children}</LiveRobotsProvider>;
}
