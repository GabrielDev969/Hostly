import { $Enums } from '@prisma/client';
import { robotModeSchema } from '@hostly/contracts';

describe('RobotMode', () => {
  it('has the same values in the database enum and in the telemetry contract', () => {
    expect(Object.values($Enums.RobotMode).sort()).toEqual([...robotModeSchema.options].sort());
  });
});
