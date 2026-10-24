export const QUEUE = {
  emails: 'emails',
  emailVerification: 'email-verification',
  maintenance: 'maintenance',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];
