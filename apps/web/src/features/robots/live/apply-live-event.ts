import type { LiveEvent } from '@hostly/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { robotKeys, type Robot } from '../queries';

const isBefore = (at: string, than: string | null | undefined) =>
  than != null && Date.parse(at) < Date.parse(than);

// An event older than what the cache holds (the REST reload can land after an event still in flight) is dropped.
export function applyToRobot(robot: Robot, event: LiveEvent): Robot {
  const { at } = event.payload;
  switch (event.type) {
    case 'robot.telemetry':
      if (isBefore(at, robot.telemetry?.at)) return robot;
      return {
        ...robot,
        online: true,
        lastSeenAt: isBefore(at, robot.lastSeenAt) ? robot.lastSeenAt : at,
        telemetry: { at, ...event.payload.telemetry },
      };
    case 'robot.online':
      if (isBefore(at, robot.lastSeenAt)) return robot;
      return { ...robot, online: true, lastSeenAt: at };
    case 'robot.offline':
      if (isBefore(at, robot.lastSeenAt)) return robot;
      return { ...robot, online: false };
  }
}

// Applies an event to every cached list and to the robot's detail. A robot that comes online without being in any
// list (just paired, or just moved into the viewer's scope) reloads the lists; its telemetry alone does not, since
// an operator filtering by client gets the events of every client.
export function applyLiveEvent(queryClient: QueryClient, workspaceId: string, event: LiveEvent) {
  const { robotId } = event.payload;
  let listed = false;
  queryClient.setQueriesData<Robot[]>({ queryKey: robotKeys.lists(workspaceId) }, (robots) => {
    if (!robots?.some((robot) => robot.id === robotId)) return robots;
    listed = true;
    return robots.map((robot) => (robot.id === robotId ? applyToRobot(robot, event) : robot));
  });
  queryClient.setQueryData<Robot>(robotKeys.detail(workspaceId, robotId), (robot) =>
    robot ? applyToRobot(robot, event) : robot,
  );
  if (!listed && event.type === 'robot.online') {
    void queryClient.invalidateQueries({ queryKey: robotKeys.lists(workspaceId) });
  }
}
