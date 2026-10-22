import {
  ApiAuthErrors,
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiServerError,
  ApiStandardErrors,
  ApiUnauthorizedError,
  ApiValidationError,
} from './api-errors.decorator';

describe('api-errors decorators', () => {
  it('all factories return decorator functions', () => {
    expect(typeof ApiValidationError()).toBe('function');
    expect(typeof ApiUnauthorizedError()).toBe('function');
    expect(typeof ApiForbiddenError()).toBe('function');
    expect(typeof ApiNotFoundError()).toBe('function');
    expect(typeof ApiNotFoundError('User')).toBe('function');
    expect(typeof ApiConflictError()).toBe('function');
    expect(typeof ApiConflictError('Custom conflict')).toBe('function');
    expect(typeof ApiRateLimitError()).toBe('function');
    expect(typeof ApiServerError()).toBe('function');
  });

  it('ApiAuthErrors composes Unauthorized + Forbidden via applyDecorators', () => {
    const decorator = ApiAuthErrors();
    expect(typeof decorator).toBe('function');
  });

  it('ApiStandardErrors composes Validation + ServerError via applyDecorators', () => {
    const decorator = ApiStandardErrors();
    expect(typeof decorator).toBe('function');
  });
});
