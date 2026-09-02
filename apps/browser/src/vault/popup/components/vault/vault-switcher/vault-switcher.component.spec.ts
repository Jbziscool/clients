import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { OrganizationId } from "@bitwarden/common/types/guid";
import {
  ALL_ITEMS_SCOPE,
  VAULT_BASE_ROUTE,
  VaultNavItemType,
  VaultNavService,
  VaultScopeType,
} from "@bitwarden/vault";

import { VaultSwitcherComponent } from "./vault-switcher.component";

describe("VaultSwitcherComponent", () => {
  let fixture: ComponentFixture<VaultSwitcherComponent>;

  /** Only a guid parses as an organization segment — see `parseVaultScope`. */
  const ORG_ID = "11111111-1111-4111-8111-111111111111";

  const nav$ = new BehaviorSubject<any>({ vaults: [], organizationDataOwnership: false });
  const navigate = jest.fn();

  const trigger = () => fixture.debugElement.query(By.css('[data-testid="vault-switcher"]'));

  /** The menu's options, which only exist once the trigger is open. */
  function openMenu() {
    trigger().nativeElement.click();
    fixture.detectChanges();
    return document.querySelectorAll("button[bitmenuitem], [bitMenuItem]");
  }

  beforeEach(async () => {
    navigate.mockClear();
    nav$.next({ vaults: [], organizationDataOwnership: false });

    await TestBed.configureTestingModule({
      imports: [VaultSwitcherComponent],
      providers: [
        { provide: VaultNavService, useValue: { viewModel$: () => nav$ } },
        { provide: AccountService, useValue: { activeAccount$: of({ id: "user-1" }) } },
        { provide: Router, useValue: { navigate } },
        // The popup's own vault path, which the app supplies in `services.module.ts`. Without it
        // the token's default would build the `/vault` URLs web and desktop mount at their root.
        { provide: VAULT_BASE_ROUTE, useValue: "/tabs/vault" },
        {
          provide: I18nService,
          useValue: { t: (key: string) => key, translate: (key: string) => key },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VaultSwitcherComponent);
    fixture.componentRef.setInput("scope", ALL_ITEMS_SCOPE);
    fixture.detectChanges();
  });

  /**
   * `organizations$` is empty for an account with one reachable vault — a personal vault alone, or
   * a single organization under data ownership — so the switcher gates on it rather than
   * re-deriving the org count and policy state the filter service already has.
   */
  it("renders nothing when there is only one reachable vault", () => {
    expect(trigger()).toBeNull();
  });

  describe("with more than one vault", () => {
    beforeEach(() => {
      nav$.next({
        vaults: [
          {
            id: "user-1",
            type: VaultNavItemType.Personal,
            label: "My vault",
            icon: "bwi-user",
            color: "#175ddc",
          },
          {
            id: ORG_ID,
            type: VaultNavItemType.Organization,
            label: "Acme corporation",
            icon: "bwi-business",
          },
        ],
        organizationDataOwnership: false,
      });
      fixture.detectChanges();
    });

    it("labels the control All items when the page is unscoped", () => {
      expect(fixture.nativeElement.textContent).toContain("allItems");
    });

    /**
     * The label comes from the route-derived scope, so a vault restored from the popup router
     * cache shows without the switcher holding any state of its own.
     */
    it("labels the trigger from a scope the route resolved", () => {
      fixture.componentRef.setInput("scope", {
        type: VaultScopeType.Organization,
        organizationId: ORG_ID as OrganizationId,
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("Acme corporation");
    });

    /**
     * The tiles come from the shared `navIconTile`, so a vault reads the same color here as in the
     * web side nav and the item table's Vault column.
     */
    /**
     * The trigger is the chevron alone, so it carries no text of its own and needs an explicit
     * name — the label beside it is not part of the button.
     */
    it("gives the icon-only trigger an accessible name", () => {
      expect(trigger().nativeElement.getAttribute("aria-label")).toBe("switchVault");
    });

    /**
     * The trigger has to sit on the button itself: the directive restores focus to its own host on
     * every close path, and its `aria-expanded`/`aria-haspopup` bindings land there too. On a
     * non-focusable wrapper the focus call is a no-op and the button announces no popup state.
     */
    /**
     * `bitTypography` is a static attribute, so a missing `TypographyModule` matches no directive
     * and raises no error — the label silently loses its `h5` classes.
     */
    /** The header drops its own `h1` while this label renders, so this is the page's only one. */
    it("renders the label as the page's h1", () => {
      expect(fixture.debugElement.query(By.css("h1"))).not.toBeNull();
    });

    it("styles the label as a heading", () => {
      const label = fixture.debugElement.query(By.css("[bitTypography]")).nativeElement;

      expect(label.classList).toContain("!tw-text-base");
      expect(label.classList).toContain("tw-font-medium");
    });

    it("carries the menu trigger on the focusable button", () => {
      const button = trigger().nativeElement as HTMLElement;

      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("aria-haspopup")).toBe("menu");
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("renders a tile on the trigger and on every entry", () => {
      expect(fixture.debugElement.queryAll(By.css("bit-icon-tile")).length).toBe(1);

      openMenu();

      // The trigger's tile, plus All items and the account's two vaults.
      expect(document.querySelectorAll("bit-icon-tile").length).toBe(4);
    });

    /** The checkmark tracks the route-derived scope rather than a selection held here. */
    it("marks the entry the route names", () => {
      fixture.componentRef.setInput("scope", {
        type: VaultScopeType.Organization,
        organizationId: ORG_ID as OrganizationId,
      });
      fixture.detectChanges();
      openMenu();

      const marks = document.querySelectorAll('[data-testid="vault-switcher-check"]');
      const visible = Array.from(marks).filter((m) => !m.classList.contains("tw-invisible"));

      expect(visible.length).toBe(1);
    });

    /**
     * Regression: the highlight was keyed to the trigger's `aria-expanded`, which the directive
     * clears from a CDK overlay subscription that runs no change detection — so under `OnPush` the
     * open styling survived the menu closing.
     */
    describe("chevron highlight", () => {
      const chevron = () =>
        fixture.debugElement.query(By.css('[data-testid="vault-switcher-chevron"]'))
          .nativeElement as HTMLElement;

      it("is unset while the menu is closed", () => {
        expect(chevron().classList).not.toContain("tw-bg-primary-100");
      });

      it("is set while the menu is open", () => {
        openMenu();

        expect(chevron().classList).toContain("tw-bg-primary-100");
      });

      it("clears once the menu closes", () => {
        openMenu();
        expect(chevron().classList).toContain("tw-bg-primary-100");

        // The menu emits `closed` however it was dismissed — Escape, backdrop, or a selection.
        fixture.debugElement.query(By.css("bit-menu")).componentInstance.closed.emit();
        fixture.detectChanges();

        expect(chevron().classList).not.toContain("tw-bg-primary-100");
      });
    });

    it("navigates to the organization's scoped route", () => {
      // [0] All vaults, [1] My vault, [2] the first organization.
      const options = openMenu();
      (options[2] as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(["/tabs/vault", ORG_ID], { replaceUrl: true });
    });

    it("navigates to the personal vault's scoped route", () => {
      const options = openMenu();
      (options[1] as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(["/tabs/vault", "my-vault"], { replaceUrl: true });
    });

    /** All items is the unscoped route, which applies no vault narrowing. */
    it("navigates to the unscoped route for All items", () => {
      fixture.componentRef.setInput("scope", {
        type: VaultScopeType.Organization,
        organizationId: ORG_ID as OrganizationId,
      });
      fixture.detectChanges();

      const options = openMenu();
      (options[0] as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(["/tabs/vault"], { replaceUrl: true });
    });
  });
});
