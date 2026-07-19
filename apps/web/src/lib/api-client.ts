import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

function clearAuthCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'nexus_session=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    // The raw JWT lives in an HttpOnly cookie (RR-H10) that client JS cannot
    // clear — ask the server to expire it. Fire-and-forget.
    void fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * Thin axios wrapper — Section 39.3.
 *
 * Every service has its own base URL resolved from `NEXT_PUBLIC_*_URL` env
 * vars at build time, with sensible localhost defaults. The CRM client is the
 * default export used by the React Query hooks; the rest are re-exported for
 * consumers that need them (finance, analytics, etc.).
 */

const DEV_BFF_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:3000/api' : undefined;

export const BASE_URLS: Record<string, string> = {
  crm: DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  finance: process.env.NEXT_PUBLIC_FINANCE_URL ?? 'http://localhost:3002/api/v1',
  comms: process.env.NEXT_PUBLIC_COMMS_URL ?? 'http://localhost:3009/api/v1',
  workflow: process.env.NEXT_PUBLIC_WF_URL ?? 'http://localhost:3007/api/v1',
  // In dev the browser cannot reach the analytics service (:3008) directly, so
  // route through the Next BFF proxy under /api/analytics (see
  // app/api/analytics/**). In prod use the service base or an explicit env URL.
  analytics:
    (DEV_BFF_URL ? `${DEV_BFF_URL}/analytics` : undefined) ??
    process.env.NEXT_PUBLIC_ANALYTICS_URL ??
    'http://localhost:3008/api/v1/analytics',
  auth: process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3000/api/v1',
  notification:
    process.env.NEXT_PUBLIC_NOTIFICATION_SERVICE_URL ??
    (process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000/api/v1'
      : 'http://localhost:3003/api/v1'),
  search: process.env.NEXT_PUBLIC_SEARCH_URL ?? 'http://localhost:3006/api/v1/search',
  storage:
    process.env.NEXT_PUBLIC_STORAGE_URL ?? 'http://localhost:3010/api/v1/storage',
  integration:
    process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1',
  tickets:
    process.env.NEXT_PUBLIC_TICKET_URL ?? 'http://localhost:3029/api/v1',
  campaigns:
    process.env.NEXT_PUBLIC_CAMPAIGN_URL ?? 'http://localhost:3025/api/v1',
  // All CRM entities now route through crm-service
  leads:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  accounts:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  notes: process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  quotes:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_QUOTES_URL ?? 'http://localhost:3033/api/v1',
  contacts:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  deals:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  activities:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1',
  cadence:
    DEV_BFF_URL ?? process.env.NEXT_PUBLIC_CADENCE_URL ?? 'http://localhost:3018/api/v1',
  territory:
    process.env.NEXT_PUBLIC_TERRITORY_URL ?? 'http://localhost:3019/api/v1',
  planning:
    process.env.NEXT_PUBLIC_PLANNING_URL ?? 'http://localhost:3020/api/v1',
  reporting:
    process.env.NEXT_PUBLIC_REPORTING_URL ?? 'http://localhost:3021/api/v1',
  // Saved BI definitions (dashboards + reports). In dev the browser cannot
  // reach reporting-service (:3021) directly, so route through the Next BFF
  // proxy at /api/bi (see app/api/bi/[[...path]]). In prod use the service or
  // an explicit env URL.
  bi:
    (DEV_BFF_URL ? `${DEV_BFF_URL}/bi` : undefined) ??
    process.env.NEXT_PUBLIC_BI_URL ??
    'http://localhost:3021/api/v1/bi',
  portal:
    process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3022',
  knowledge:
    process.env.NEXT_PUBLIC_KNOWLEDGE_URL ?? 'http://localhost:3023/api/v1',
  incentive:
    process.env.NEXT_PUBLIC_INCENTIVE_URL ?? 'http://localhost:3024/api/v1',
  data:
    process.env.NEXT_PUBLIC_DATA_URL ?? 'http://localhost:3015/api/v1',
  // Low-code platform (metadata-service). Base is the BFF root so both
  // `/custom-modules/**` and `/formula/evaluate` resolve. In dev the browser
  // cannot reach metadata-service (:3004) directly, so route through the Next
  // BFF (see app/api/custom-modules/** + app/api/formula/**). In prod use the
  // service base or an explicit env URL.
  customModules:
    DEV_BFF_URL ??
    process.env.NEXT_PUBLIC_METADATA_URL ??
    'http://localhost:3004/api/v1',
  // CommandCenter journeys (workflow-service). Dev routes through the BFF at
  // /api/command-center (see app/api/command-center/**).
  commandCenter:
    (DEV_BFF_URL ? `${DEV_BFF_URL}/command-center` : undefined) ??
    process.env.NEXT_PUBLIC_WF_URL ??
    'http://localhost:3007/api/v1/command-center',
  // Omnichannel CTI telephony (comm-service). Dev routes through the BFF at
  // /api/telephony (see app/api/telephony/**).
  telephony:
    (DEV_BFF_URL ? `${DEV_BFF_URL}/telephony` : undefined) ??
    process.env.NEXT_PUBLIC_COMMS_URL ??
    'http://localhost:3009/api/v1/telephony',
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

let refreshPromise: Promise<string> | null = null;

function createApiClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // CSRF protection: double-submit cookie pattern.
    // Backend sets 'csrf_token' (httpOnly) + 'csrf_token_client' (JS-readable).
    const csrfToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token_client='))
      ?.split('=')[1];
    if (csrfToken) {
      config.headers['x-csrf-token'] = csrfToken;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorEnvelope>) => {
      const status = error.response?.status;
      const body = error.response?.data;
      const originalRequest = error.config;

      if (status === 401 && originalRequest) {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (refreshToken) {
          try {
            if (!refreshPromise) {
              refreshPromise = axios
                .post<{ success: boolean; data?: { accessToken?: string } }>(
                  `${BASE_URLS.auth}/auth/refresh`,
                  { refreshToken }
                )
                .then((res) => {
                  const newToken = res.data.data?.accessToken;
                  if (!newToken) throw new Error('Refresh response missing accessToken');
                  useAuthStore.getState().setAccessToken(newToken);
                  return newToken;
                })
                .finally(() => {
                  refreshPromise = null;
                });
            }
            const newAccessToken = await refreshPromise;
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return client.request(originalRequest);
          } catch {
            useAuthStore.getState().clearSession();
            clearAuthCookie();
          }
        } else {
          useAuthStore.getState().clearSession();
          clearAuthCookie();
        }
      }

      const message = isApiError(body)
        ? body.error.message
        : error.message || 'Network error';

      notify.error(`Request failed${status ? ` (${status})` : ''}`, message);

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
  comms: makeTypedClient(createApiClient(BASE_URLS.comms)),
  workflow: makeTypedClient(createApiClient(BASE_URLS.workflow)),
  analytics: makeTypedClient(createApiClient(BASE_URLS.analytics)),
  auth: makeTypedClient(createApiClient(BASE_URLS.auth)),
  notification: makeTypedClient(createApiClient(BASE_URLS.notification)),
  search: makeTypedClient(createApiClient(BASE_URLS.search)),
  storage: makeTypedClient(createApiClient(BASE_URLS.storage)),
  integration: makeTypedClient(createApiClient(BASE_URLS.integration)),
  campaigns: makeTypedClient(createApiClient(BASE_URLS.campaigns)),
  tickets: makeTypedClient(createApiClient(BASE_URLS.tickets)),
  leads: makeTypedClient(createApiClient(BASE_URLS.leads)),
  accounts: makeTypedClient(createApiClient(BASE_URLS.accounts)),
  notes: makeTypedClient(createApiClient(BASE_URLS.notes)),
  quotes: makeTypedClient(createApiClient(BASE_URLS.quotes)),
  contacts: makeTypedClient(createApiClient(BASE_URLS.contacts)),
  deals: makeTypedClient(createApiClient(BASE_URLS.deals)),
  activities: makeTypedClient(createApiClient(BASE_URLS.activities)),
  cadence: makeTypedClient(createApiClient(BASE_URLS.cadence)),
  territory: makeTypedClient(createApiClient(BASE_URLS.territory)),
  planning: makeTypedClient(createApiClient(BASE_URLS.planning)),
  reporting: makeTypedClient(createApiClient(BASE_URLS.reporting)),
  bi: makeTypedClient(createApiClient(BASE_URLS.bi)),
  portal: makeTypedClient(createApiClient(BASE_URLS.portal)),
  knowledge: makeTypedClient(createApiClient(BASE_URLS.knowledge)),
  incentive: makeTypedClient(createApiClient(BASE_URLS.incentive)),
  data: makeTypedClient(createApiClient(BASE_URLS.data)),
  customModules: makeTypedClient(createApiClient(BASE_URLS.customModules)),
  commandCenter: makeTypedClient(createApiClient(BASE_URLS.commandCenter)),
  telephony: makeTypedClient(createApiClient(BASE_URLS.telephony)),
};

/** Default CRM-scoped client — the one consumed by `hooks/use-deals.ts`. */
export const api = apiClients.crm;

export type ApiClient = typeof api;
