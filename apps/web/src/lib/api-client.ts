import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

/**
 * Thin axios wrapper — Section 39.3.
 *
 * Every service has its own base URL resolved from `NEXT_PUBLIC_*_URL` env
 * vars at build time, with sensible localhost defaults. The CRM client is the
 * default export used by the React Query hooks; the rest are re-exported for
 * consumers that need them (finance, analytics, etc.).
 */

const BASE_URLS: Record<string, string> = {
  crm: process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  finance: process.env.NEXT_PUBLIC_FINANCE_URL ?? 'http://localhost:3002/api/v1',
  ai: process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? 'http://localhost:3025',
  comms: process.env.NEXT_PUBLIC_COMMS_URL ?? 'http://localhost:3004/api/v1',
  workflow: process.env.NEXT_PUBLIC_WF_URL ?? 'http://localhost:3007/api/v1',
  analytics:
    process.env.NEXT_PUBLIC_ANALYTICS_URL ?? 'http://localhost:3008/api/v1/analytics',
  auth: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1',
  notification:
    process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE_URL ?? 'http://localhost:3003',
  search: process.env.NEXT_PUBLIC_SEARCH_URL ?? 'http://localhost:3006/api/v1/search',
  storage:
    process.env.NEXT_PUBLIC_STORAGE_URL ?? 'http://localhost:3009/api/v1/storage',
  integration:
    process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1',
  cadence:
    process.env.NEXT_PUBLIC_CADENCE_URL ?? 'http://localhost:3018/api/v1',
  territory:
    process.env.NEXT_PUBLIC_TERRITORY_URL ?? 'http://localhost:3019/api/v1',
  planning:
    process.env.NEXT_PUBLIC_PLANNING_URL ?? 'http://localhost:3020/api/v1',
  reporting:
    process.env.NEXT_PUBLIC_REPORTING_URL ?? 'http://localhost:3021/api/v1',
  portal:
    process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022',
  knowledge:
    process.env.NEXT_PUBLIC_KNOWLEDGE_URL ?? 'http://localhost:3023/api/v1',
  incentive:
    process.env.NEXT_PUBLIC_INCENTIVE_URL ?? 'http://localhost:3024/api/v1',
};

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

function isApiError(body: unknown): body is ApiErrorEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { success?: unknown }).success === false
  );
}

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiErrorEnvelope>) => {
      const status = error.response?.status;
      const body = error.response?.data;

      if (status === 401) {
        useAuthStore.getState().clearSession();
      }

      const message = isApiError(body)
        ? body.error.message
        : error.message || 'Network error';

      useUiStore.getState().pushToast({
        variant: 'error',
        title: `Request failed${status ? ` (${status})` : ''}`,
        description: message,
      });

      return Promise.reject(error);
    }
  );

  return client;
}

interface RequestOptions extends AxiosRequestConfig {
  params?: Record<string, unknown>;
}

/** Unwraps the `{ success, data }` envelope; throws on `success: false`. */
async function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  const res = await promise;
  const body = res.data;
  if (isApiError(body)) {
    const e = new Error(body.error.message);
    (e as Error & { code?: string }).code = body.error.code;
    throw e;
  }
  return body.data;
}

/** Creates a typed facade around an axios client for a specific service. */
function makeTypedClient(instance: AxiosInstance) {
  return {
    get<T>(url: string, options?: RequestOptions): Promise<T> {
      return unwrap<T>(instance.get<ApiEnvelope<T>>(url, options));
    },
    post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
      return unwrap<T>(instance.post<ApiEnvelope<T>>(url, data, options));
    },
    patch<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
      return unwrap<T>(instance.patch<ApiEnvelope<T>>(url, data, options));
    },
    put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
      return unwrap<T>(instance.put<ApiEnvelope<T>>(url, data, options));
    },
    delete<T>(url: string, options?: RequestOptions): Promise<T> {
      return unwrap<T>(instance.delete<ApiEnvelope<T>>(url, options));
    },
  };
}

export const apiClients = {
  crm: makeTypedClient(createApiClient(BASE_URLS.crm)),
  finance: makeTypedClient(createApiClient(BASE_URLS.finance)),
  billing: makeTypedClient(createApiClient(BASE_URLS.finance)),
  ai: makeTypedClient(createApiClient(BASE_URLS.ai)),
  comms: makeTypedClient(createApiClient(BASE_URLS.comms)),
  workflow: makeTypedClient(createApiClient(BASE_URLS.workflow)),
  analytics: makeTypedClient(createApiClient(BASE_URLS.analytics)),
  auth: makeTypedClient(createApiClient(BASE_URLS.auth)),
  notification: makeTypedClient(createApiClient(BASE_URLS.notification)),
  search: makeTypedClient(createApiClient(BASE_URLS.search)),
  storage: makeTypedClient(createApiClient(BASE_URLS.storage)),
  integration: makeTypedClient(createApiClient(BASE_URLS.integration)),
  cadence: makeTypedClient(createApiClient(BASE_URLS.cadence)),
  territory: makeTypedClient(createApiClient(BASE_URLS.territory)),
  planning: makeTypedClient(createApiClient(BASE_URLS.planning)),
  reporting: makeTypedClient(createApiClient(BASE_URLS.reporting)),
  portal: makeTypedClient(createApiClient(BASE_URLS.portal)),
  knowledge: makeTypedClient(createApiClient(BASE_URLS.knowledge)),
  incentive: makeTypedClient(createApiClient(BASE_URLS.incentive)),
};

/** Default CRM-scoped client — the one consumed by `hooks/use-deals.ts`. */
export const api = apiClients.crm;

export type ApiClient = typeof api;
