import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentWorkspace } from './current-workspace.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;

function getFactory(decorator: typeof CurrentWorkspace): ParamFactory {
  class Probe {
    handler(@decorator() _ws: unknown): void {
      void _ws;
    }
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >;
  const entry = Object.values(args)[0];
  return entry!.factory;
}

function buildCtx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentWorkspace decorator', () => {
  const factory = getFactory(CurrentWorkspace);

  it('returns the workspace context attached to the request', () => {
    const workspace = {
      id: 'w1',
      member: {
        id: 'm1',
        userId: 'u1',
        workspaceId: 'w1',
        roleId: 'r1',
      },
      role: { id: 'r1', name: 'Admin', isSystem: false },
    };
    expect(factory(undefined, buildCtx({ workspace }))).toBe(workspace);
  });

  it('returns undefined when no workspace is attached', () => {
    expect(factory(undefined, buildCtx({}))).toBeUndefined();
  });
});
