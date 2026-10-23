'use client';

import type { ReactNode } from 'react';
import { ClientsSection } from '@/features/clients/clients-page';

// The list and the live channel stay mounted while moving between clients.
export default function ClientsLayout({ children }: { children: ReactNode }) {
  return <ClientsSection>{children}</ClientsSection>;
}
