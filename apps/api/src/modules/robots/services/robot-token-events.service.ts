import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface RobotTokenChange {
  robotId: string;
  // The only token hash still valid for the robot; null once revoked.
  activeTokenHash: string | null;
}

// Tells the robot socket that a token stopped being valid, so its open connection closes at once.
@Injectable()
export class RobotTokenEvents {
  private readonly subject = new Subject<RobotTokenChange>();

  get changes(): Observable<RobotTokenChange> {
    return this.subject.asObservable();
  }

  emit(change: RobotTokenChange): void {
    this.subject.next(change);
  }
}
