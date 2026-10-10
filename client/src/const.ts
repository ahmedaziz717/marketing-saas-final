export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const startLogin = () => {
  if (window.location.pathname === "/login") return;
  const next = window.location.pathname === "/"
    ? "/app"
    : window.location.pathname + window.location.search;
  window.location.assign("/login?next=" + encodeURIComponent(next));
};
