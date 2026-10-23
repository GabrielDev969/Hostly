import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Playlists' };

export default function PlaylistsPage() {
  return <ComingSoon title="Playlists" subtitle="Sequências de mídia e a duração de cada item." />;
}
