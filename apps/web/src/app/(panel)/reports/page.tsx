import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Relatórios' };

export default function ReportsPage() {
  return <ComingSoon title="Relatórios" subtitle="Exibições, pessoas e horas por modo." />;
}
