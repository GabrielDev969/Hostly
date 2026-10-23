import type { Metadata } from 'next';
import { ClientDetail } from '@/features/clients/client-detail';

export const metadata: Metadata = { title: 'Cliente' };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetail clientId={id} />;
}
