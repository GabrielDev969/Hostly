import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Visão geral' };

export default function OverviewPage() {
  return <ComingSoon title="Visão geral" subtitle="A frota inteira e os alertas." />;
}
