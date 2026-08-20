export type ApplicationRoute =
  | { kind: "admin" }
  | { kind: "public-station"; publicId: string }
  | { kind: "game" };

export function resolveApplicationRoute(pathname: string): ApplicationRoute {
  if (/^\/admin\/?$/.test(pathname)) return { kind: "admin" };
  const publicStation = /^\/station\/([^/]+)\/?$/.exec(pathname);
  return publicStation ? { kind: "public-station", publicId: publicStation[1] } : { kind: "game" };
}
