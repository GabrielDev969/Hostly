import type { Metadata } from 'next';
import { NoClientSelected } from '@/features/clients/clients-page';

export const metadata: Metadata = { title: 'Clientes' };

export default function ClientsPage() {
  return <NoClientSelected />;
}
