import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Agenda e rotas' };

export default function SchedulePage() {
  return (
    <ComingSoon
      title="Agenda e rotas"
      subtitle="O que cada robô faz em cada horário e os caminhos do cruzeiro."
    />
  );
}
