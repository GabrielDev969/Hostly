import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Robôs' };

export default function RobotsPage() {
  return (
    <ComingSoon title="Robôs" subtitle="Status ao vivo, comandos, local e marca de cada robô." />
  );
}
