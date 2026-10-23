import type { Metadata } from 'next';
import { RobotDetail } from '@/features/robots/robot-detail';

export const metadata: Metadata = { title: 'Robô' };

export default async function RobotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RobotDetail robotId={id} />;
}
