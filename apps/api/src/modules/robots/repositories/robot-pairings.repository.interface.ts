import { Robot } from '../entities/robot.entity';
import { RobotPairing } from '../entities/robot-pairing.entity';

export interface CreatePairingData {
  pollKeyHash: string;
  serial: string;
  code: string;
  expiresAt: Date;
}

export interface ApprovePairingData {
  pairingId: string;
  serial: string;
  siteId: string;
  clientId: string;
  // Undefined keeps the current name; a new robot is then named after its serial.
  name?: string;
  expiresAt: Date;
  // Runs inside the transaction, on the robot as it is there, before an existing robot changes;
  // throwing rolls the approval back.
  authorizeExisting: (existing: Robot) => void;
}

export type ApprovePairingResult =
  { status: 'approved'; robot: Robot } | { status: 'serial_taken' } | { status: 'not_pending' };

export interface ClaimPairingData {
  pairingId: string;
  robotId: string;
  deviceTokenHash: string;
  now: Date;
}

export abstract class RobotPairingsRepository {
  abstract deleteExpired(now: Date): Promise<void>;
  // Null when the code is already held by another live pairing.
  abstract create(data: CreatePairingData): Promise<RobotPairing | null>;
  abstract findPendingByCode(code: string, now: Date): Promise<RobotPairing | null>;
  abstract findByPollKeyHash(pollKeyHash: string): Promise<RobotPairing | null>;
  // Creates or updates the robot in the current scope and approves the pairing, atomically.
  abstract approve(data: ApprovePairingData): Promise<ApprovePairingResult>;
  // Deletes the approved pairing and stores the new token hash; false when another poll won.
  // Touches Robot across tenants: call it inside TenantContext.runAsSystem.
  abstract claimApproved(data: ClaimPairingData): Promise<boolean>;
}
