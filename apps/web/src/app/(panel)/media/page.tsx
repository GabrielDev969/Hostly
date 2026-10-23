import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Mídia' };

export default function MediaPage() {
  return <ComingSoon title="Mídia" subtitle="Biblioteca de imagens e vídeos das campanhas." />;
}
