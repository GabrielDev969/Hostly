import Link from 'next/link';
import { EmptyState } from '@/components/states';

export default function NotFound() {
  return (
    <main>
      <EmptyState
        title="Página não encontrada"
        description="O endereço não existe ou mudou."
        action={<Link href="/">Voltar ao início</Link>}
      />
    </main>
  );
}
