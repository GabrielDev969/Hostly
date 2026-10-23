export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // What the validation refused, one entry per rule, as the API wrote it.
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

// The API normalizes every error body to { statusCode, message, details? }; a validation error
// carries the rules it broke in details.
export function detailsOf(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('details' in body)) return [];
  const { details } = body;
  return Array.isArray(details)
    ? details.filter((detail): detail is string => typeof detail === 'string')
    : [];
}

export async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText;
  let details: string[] = [];
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
    details = detailsOf(body);
  } catch {
    // Non-JSON body: keep the status text.
  }
  return new ApiError(response.status, message, details);
}
