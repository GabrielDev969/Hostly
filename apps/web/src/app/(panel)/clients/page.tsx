import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Clientes' };

export default function ClientsPage() {
  return (
    <ComingSoon title="Clientes" subtitle="Estabelecimentos, locais, robôs ligados e acessos." />
  );
}
