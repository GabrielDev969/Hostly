import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Falas' };

export default function SpeechPage() {
  return <ComingSoon title="Falas" subtitle="Roteiros e gatilhos de fala dos robôs." />;
}
