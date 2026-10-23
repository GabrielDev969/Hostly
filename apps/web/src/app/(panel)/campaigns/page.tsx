import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Campanhas' };

export default function CampaignsPage() {
  return (
    <ComingSoon title="Campanhas" subtitle="Período, prioridade, regras de agenda e anunciante." />
  );
}
