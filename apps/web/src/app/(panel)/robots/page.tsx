import type { Metadata } from 'next';
import { RobotsList } from '@/features/robots/robots-list';

export const metadata: Metadata = { title: 'Robôs' };

export default function RobotsPage() {
  return <RobotsList />;
}
