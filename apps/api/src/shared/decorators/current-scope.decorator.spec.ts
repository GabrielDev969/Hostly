import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentScope } from './current-scope.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;

function getFactory(): ParamFactory {
  class Probe {
    handler(@CurrentScope() _scope: unknown): void {
      void _scope;
    }
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >;
  return Object.values(args)[0]!.factory;
}

function buildCtx(req: unknown): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('CurrentScope decorator', () => {
  const factory = getFactory();

  it('returns the tenant scope the WorkspaceGuard attached', () => {
    const scope = { organizationId: 'o1', workspaceId: 'w1', clientId: 'c1', advertiserId: null };
    expect(factory(undefined, buildCtx({ scope }))).toBe(scope);
  });

  it('fails closed when there is no scope', () => {
    expect(() => factory(undefined, buildCtx({}))).toThrow(ForbiddenException);
  });
});
