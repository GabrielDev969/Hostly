import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Marcas' };

export default function BrandsPage() {
  return <ComingSoon title="Marcas" subtitle="Perfis de marca com prévia das telas do robô." />;
}
