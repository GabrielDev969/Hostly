import { Injectable } from '@nestjs/common';
import { Robot } from '@modules/robots/entities/robot.entity';
import { RobotAuthService } from '@modules/robots/services/robot-auth.service';
import { TenantContext } from '@shared/tenancy/tenant-context';

// Who is behind one robot socket, settled at the handshake. The raw token is never kept.
export interface RobotSession {
  robotId: string;
  serial: string;
  organizationId: string;
  workspaceId: string;
  deviceTokenHash: string;
}

export interface ScopedRun<T> {
  robot: Robot;
  result: T;
}

// Every message checks the token again (a revoked or replaced one ends the session) and then runs in the robot's
// tenant scope as it is now, so a robot moved to another client writes there from the next message on.
@Injectable()
export class RobotScopeService {
  constructor(private auth: RobotAuthService) {}

  // Null when the token is no longer valid.
  async run<T>(
    session: RobotSession,
    fn: (robot: Robot) => Promise<T>,
  ): Promise<ScopedRun<T> | null> {
    const robot = await this.auth.authenticateHash(session.deviceTokenHash);
    if (!robot) return null;
    const result = await TenantContext.runWithScope(
      {
        organizationId: robot.organizationId,
        workspaceId: session.workspaceId,
        clientId: robot.clientId,
        advertiserId: null,
      },
      () => fn(robot),
    );
    return { robot, result };
  }

  // For bookkeeping that must happen even after the token is gone (the socket closed): the robot's organization,
  // whose client the write reads from the row itself.
  async runInOrganization<T>(session: RobotSession, fn: () => Promise<T>): Promise<T> {
    return TenantContext.runWithScope(
      {
        organizationId: session.organizationId,
        workspaceId: session.workspaceId,
        clientId: null,
        advertiserId: null,
      },
      fn,
    );
  }
}
