export type ApiErrorBody = {
  detail?: string | string[] | Record<string, unknown>;
  code?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly data: ApiErrorBody;
  readonly path: string;
  readonly method: string;

  constructor(opts: {
    status: number;
    data: ApiErrorBody;
    path: string;
    method: string;
    message?: string;
  }) {
    super(opts.message || defaultMessage(opts.status, opts.data));
    this.name = "ApiError";
    this.status = opts.status;
    this.data = opts.data;
    this.path = opts.path;
    this.method = opts.method;
  }
}

export class NetworkError extends Error {
  readonly causeError?: unknown;

  constructor(message = "Network request failed", causeError?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.causeError = causeError;
  }
}

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

function defaultMessage(status: number, data: ApiErrorBody): string {
  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) return String(detail[0]);
  return `Request failed (${status})`;
}

export function isMissingCredentialsError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 401 && error.status !== 403) return false;
  if (error.data?.code === "not_authenticated") return true;
  return error.data?.detail === "Authentication credentials were not provided.";
}

export function fieldErrorsFromBody(data: ApiErrorBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === "detail" || key === "code") continue;
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && value.length) out[key] = String(value[0]);
  }
  return out;
}

export async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const data = (await response.json()) as ApiErrorBody;
    return data && typeof data === "object" ? data : { detail: `Request failed (${response.status})` };
  } catch {
    return { detail: `Request failed (${response.status})` };
  }
}
