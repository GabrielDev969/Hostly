import type { Metadata } from 'next';
import { ComingSoon } from '@/components/states';

export const metadata: Metadata = { title: 'Configurações' };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Configurações"
      subtitle="Usuários e papéis, pareamento de robôs e marca da operadora."
    />
  );
}
