import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto, ValidationErrorResponseDto } from '../dto/error-response.dto';

export const ApiValidationError = () =>
  ApiBadRequestResponse({
    description: 'Validation failed',
    type: ValidationErrorResponseDto,
  });

export const ApiUnauthorizedError = () =>
  ApiUnauthorizedResponse({
    description: 'Missing or invalid authentication',
    type: ErrorResponseDto,
  });

export const ApiForbiddenError = () =>
  ApiForbiddenResponse({
    description: 'Authenticated but lacks the required permission',
    type: ErrorResponseDto,
  });

export const ApiNotFoundError = (resource = 'Resource') =>
  ApiNotFoundResponse({
    description: `${resource} not found`,
    type: ErrorResponseDto,
  });

export const ApiConflictError = (description = 'Conflict with existing data') =>
  ApiConflictResponse({ description, type: ErrorResponseDto });

export const ApiRateLimitError = () =>
  ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded',
    type: ErrorResponseDto,
  });

export const ApiServerError = () =>
  ApiInternalServerErrorResponse({
    description: 'Unexpected server error',
    type: ErrorResponseDto,
  });

export function ApiAuthErrors() {
  return applyDecorators(ApiUnauthorizedError(), ApiForbiddenError());
}

export function ApiStandardErrors() {
  return applyDecorators(ApiValidationError(), ApiServerError());
}
