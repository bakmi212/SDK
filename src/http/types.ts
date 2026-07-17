export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpHeaders {
  [key: string]: string;
}

export interface HttpQuery {
  [key: string]: string | number | boolean | undefined;
}

export interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: HttpHeaders;
  query?: HttpQuery;
  /** JSON body (object) — automatically serialized. */
  body?: unknown;
  /** Multipart fields. When set, Content-Type is multipart/form-data. */
  multipart?: MultipartFields;
  /** Override per-request timeout (ms). */
  timeout?: number;
  /** Override per-request retry count. */
  maxRetries?: number;
  /** Skip automatic auth header injection. */
  skipAuth?: boolean;
}

export interface MultipartFields {
  [field: string]: string | Blob | File;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
}
