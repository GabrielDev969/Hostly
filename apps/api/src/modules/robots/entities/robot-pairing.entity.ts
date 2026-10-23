interface RobotPairingFields {
  id: string;
  serial: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

// The pollKeyHash stays in the repository; robotId is set exactly when approved.
export type RobotPairing = RobotPairingFields &
  ({ status: 'pending'; robotId: null } | { status: 'approved'; robotId: string });
