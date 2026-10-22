import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { validatePasswordPolicy } from '@shared/utils/password-policy.util';

@ValidatorConstraint({ name: 'IsStrongPassword', async: false })
class StrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') return false;
    const obj = args.object as { email?: string; name?: string };
    return (
      validatePasswordPolicy(value, {
        email: obj.email,
        name: obj.name,
      }).length === 0
    );
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value as string;
    if (typeof value !== 'string') return 'Password must be a string';
    const obj = args.object as { email?: string; name?: string };
    const errors = validatePasswordPolicy(value, {
      email: obj.email,
      name: obj.name,
    });
    return errors.join('; ') || 'Password is not strong enough';
  }
}

export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      constraints: [],
      validator: StrongPasswordConstraint,
    });
  };
}
