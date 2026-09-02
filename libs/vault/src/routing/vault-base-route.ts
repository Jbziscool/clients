import { InjectionToken } from "@angular/core";

import { DEFAULT_VAULT_BASE_ROUTE } from "../models/vault-scope";

/**
 * The path this client mounts the vault page at, rebasing every scope URL the shared vault code
 * builds. Web and desktop mount it at the root and take the default, so they need no provider; the
 * extension popup mounts the same page under its tab shell and overrides this with `/tabs/vault`.
 */
export const VAULT_BASE_ROUTE = new InjectionToken<string>("VaultBaseRoute", {
  providedIn: "root",
  factory: () => DEFAULT_VAULT_BASE_ROUTE,
});
