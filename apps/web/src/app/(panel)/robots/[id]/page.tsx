import type { Metadata } from 'next';
import { RobotDetail } from '@/features/robots/robot-detail';

export const metadata: Metadata = { title: 'Robô' };

export default async function RobotPage({ params }: PageProps<'/robots/[id]'>) {
  const { id } = await params;
  return <RobotDetail robotId={id} />;
}
