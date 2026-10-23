export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// The API normalizes every error body to { statusCode, message, ... }; only the message is kept.
export async function toApiError(response: Response): Promise<ApiError> {
  let message = response.statusText;
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') message = body.message;
  } catch {
    // Non-JSON body: keep the status text.
  }
  return new ApiError(response.status, message);
}
