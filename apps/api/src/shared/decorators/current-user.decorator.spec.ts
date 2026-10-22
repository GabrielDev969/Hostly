import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;

function getFactory(decorator: typeof CurrentUser): ParamFactory {
  class Probe {
    handler(@decorator() _user: unknown): void {
      void _user;
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

describe('CurrentUser decorator', () => {
  const factory = getFactory(CurrentUser);

  it('returns the user attached to the request', () => {
    const user = { sub: 'u1', email: 'jane@example.com' };
    expect(factory(undefined, buildCtx({ user }))).toBe(user);
  });

  it('returns undefined when no user is attached', () => {
    expect(factory(undefined, buildCtx({}))).toBeUndefined();
  });
});
