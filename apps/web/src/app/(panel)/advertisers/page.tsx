import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Anunciantes' };

export default function AdvertisersPage() {
  return (
    <ComingSoon title="Anunciantes" subtitle="Lojistas de cada cliente e as campanhas deles." />
  );
}
