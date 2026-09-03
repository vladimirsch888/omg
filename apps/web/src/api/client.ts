import axios from "axios";

export const api = axios.create({ baseURL: "/api", timeout: 30_000 });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

/**
 * Two things the pages shouldn't each have to handle: a dead session (401 →
 * back to the login screen) and no connection at all (a network error → one
 * global "нет связи" notice, raised as a DOM event that UiProvider listens
 * for, since axios lives outside React).
 */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    } else if (!error.response) {
      window.dispatchEvent(new CustomEvent("api:offline"));
    } else if (error.response.status === 403) {
      window.dispatchEvent(new CustomEvent("api:forbidden", { detail: error.response.data?.error }));
    }
    return Promise.reject(error);
  }
);

/** The message a failed request should show, with a sane fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error ?? (e?.response ? fallback : "Нет связи с сервером");
}
