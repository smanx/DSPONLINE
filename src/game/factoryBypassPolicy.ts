export interface FactoryBypassPolicyInput {
  hostname: string;
  developmentBuild: boolean;
  forceMenu: boolean;
  queryRequested: boolean;
  testSessionRequested: boolean;
}

/**
 * The direct factory launcher uses the synchronous compatibility loader and
 * therefore must never be reachable on a public production origin. Local
 * development and Playwright previews may retain it for deterministic fixtures.
 */
export function canBypassFactoryMenu(input: FactoryBypassPolicyInput): boolean {
  if (input.forceMenu || (!input.queryRequested && !input.testSessionRequested)) return false;
  const localHost = input.hostname === "localhost" || input.hostname === "127.0.0.1" || input.hostname === "[::1]";
  return input.developmentBuild || localHost;
}
