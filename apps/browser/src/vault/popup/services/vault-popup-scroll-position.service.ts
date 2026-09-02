import { inject, Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router } from "@angular/router";
import { filter, fromEvent, Subscription } from "rxjs";

import { VAULT_BASE_ROUTE } from "@bitwarden/vault";

@Injectable({
  providedIn: "root",
})
export class VaultPopupScrollPositionService {
  private router = inject(Router);

  /** Path of the vault screen */
  private readonly vaultPath = inject(VAULT_BASE_ROUTE);

  /** Current scroll position relative to the top of the viewport. */
  private scrollPosition: number | null = null;

  /** Subscription associated with the virtual scroll element. */
  private scrollSubscription: Subscription | null = null;

  constructor() {
    this.router.events
      .pipe(
        takeUntilDestroyed(),
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      )
      .subscribe((event) => {
        this.resetListenerForNavigation(event);
      });
  }

  /** Scrolls the user to the stored scroll position and starts tracking scroll of the page. */
  start(scrollElement: HTMLElement) {
    if (this.hasScrollPosition()) {
      // Use `setTimeout` to scroll after rendering is complete
      setTimeout(() => {
        scrollElement.scrollTo({ top: this.scrollPosition!, behavior: "instant" });
      });
    }

    this.scrollSubscription?.unsubscribe();

    // Skip the first scroll event to avoid settings the scroll from the above `scrollTo` call
    let skipped = false;
    this.scrollSubscription = fromEvent(scrollElement, "scroll").subscribe(() => {
      if (!skipped) {
        skipped = true;
        return;
      }
      this.scrollPosition = scrollElement.scrollTop;
    });
  }

  /** Stops the scroll listener from updating the stored location. */
  stop(reset?: true) {
    this.scrollSubscription?.unsubscribe();
    this.scrollSubscription = null;

    if (reset) {
      this.scrollPosition = null;
    }
  }

  /** Returns true when a scroll position has been stored. */
  hasScrollPosition() {
    return this.scrollPosition !== null;
  }

  /** Conditionally resets the scroll listeners based on the ending path of the navigation */
  private resetListenerForNavigation(event: NavigationEnd): void {
    // The vault page is the target of the scroll listener, return early
    if (this.isVaultUrl(event.url)) {
      return;
    }

    // For all other tab pages reset the scroll position
    if (event.url.startsWith("/tabs/")) {
      this.stop(true);
    }
  }

  /**
   * Whether a URL lands on the vault page — either unscoped, or scoped to one of the account's
   * vaults by the `:vaultId` segment. A scoped vault is the same page narrowed rather than a
   * different tab, so switching between vaults keeps the scroll position the listener has stored.
   *
   * Compares against whole segments so a sibling route sharing the prefix — a hypothetical
   * `/tabs/vault-settings` — is not mistaken for the vault itself.
   */
  private isVaultUrl(url: string): boolean {
    const path = url.split("?")[0].split("#")[0];
    return path === this.vaultPath || path.startsWith(`${this.vaultPath}/`);
  }
}
