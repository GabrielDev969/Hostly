import { BadRequestException, PipeTransform } from '@nestjs/common';

interface SafeParser<T> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

// Validates a body against a @hostly/contracts schema. It relies on safeParse rather than
// `instanceof ZodError` because the package can load its own copy of zod; unknown fields are dropped.
export class ContractBodyPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: SafeParser<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException(
      result.error.issues.map(
        (issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`,
      ),
    );
  }
}
