import { effect } from "@angular/core";
import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { NavigationEnd, Router } from "@angular/router";
import { Subject, Subscription } from "rxjs";

import { ScrollLayoutService } from "@bitwarden/components";
import { VAULT_BASE_ROUTE } from "@bitwarden/vault";

import { VaultPopupScrollPositionService } from "./vault-popup-scroll-position.service";

describe("VaultPopupScrollPositionService", () => {
  let service: VaultPopupScrollPositionService;
  const events$ = new Subject();
  const unsubscribe = jest.fn();

  beforeEach(async () => {
    unsubscribe.mockClear();

    await TestBed.configureTestingModule({
      providers: [
        VaultPopupScrollPositionService,
        { provide: Router, useValue: { events: events$ } },
        // The popup's own vault path, which the app supplies in `services.module.ts`.
        { provide: VAULT_BASE_ROUTE, useValue: "/tabs/vault" },
      ],
    });

    service = TestBed.inject(VaultPopupScrollPositionService);

    // set up dummy values
    service["scrollPosition"] = 234;
    service["scrollSubscription"] = { unsubscribe } as unknown as Subscription;
  });

  describe("router events", () => {
    it("does not reset service when navigating to `/tabs/vault`", fakeAsync(() => {
      const event = new NavigationEnd(22, "/tabs/vault", "");
      events$.next(event);

      tick();

      expect(service["scrollPosition"]).toBe(234);
      expect(service["scrollSubscription"]).not.toBeNull();
    }));

    it.each([
      ["/tabs/vault/my-vault"],
      ["/tabs/vault/11111111-1111-4111-8111-111111111111"],
      ["/tabs/vault/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222"],
      ["/tabs/vault/trash"],
    ])(
      "does not reset service when navigating to the scoped vault route %s",
      fakeAsync((url: string) => {
        const event = new NavigationEnd(22, url, "");
        events$.next(event);

        tick();

        expect(service["scrollPosition"]).toBe(234);
        expect(service["scrollSubscription"]).not.toBeNull();
      }),
    );

    it("does not reset service when the vault route carries a query string", fakeAsync(() => {
      const event = new NavigationEnd(22, "/tabs/vault/my-vault?search=foo", "");
      events$.next(event);

      tick();

      expect(service["scrollPosition"]).toBe(234);
    }));

    it("resets values on a tab page that merely shares the vault prefix", fakeAsync(() => {
      const event = new NavigationEnd(23, "/tabs/vault-settings", "");
      events$.next(event);

      tick();

      expect(service["scrollPosition"]).toBeNull();
      expect(service["scrollSubscription"]).toBeNull();
    }));

    it("resets values when navigating to other tab pages", fakeAsync(() => {
      const event = new NavigationEnd(23, "/tabs/generator", "");
      events$.next(event);

      tick();

      expect(service["scrollPosition"]).toBeNull();
      expect(unsubscribe).toHaveBeenCalled();
      expect(service["scrollSubscription"]).toBeNull();
    }));
  });

  describe("stop", () => {
    it("removes scroll listener", () => {
      service.stop();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(service["scrollSubscription"]).toBeNull();
    });

    it("resets stored values", () => {
      service.stop(true);

      expect(service["scrollPosition"]).toBeNull();
    });
  });

  describe("start", () => {
    let scrollElement: HTMLElement;

    beforeEach(() => {
      scrollElement = document.createElement("div");

      (scrollElement as any).scrollTo = jest.fn(function scrollTo(opts: { top?: number }) {
        if (opts?.top != null) {
          (scrollElement as any).scrollTop = opts.top;
        }
      });
      (scrollElement as any).scrollTop = 0;
    });

    afterEach(() => {
      // remove the actual subscription created by `.subscribe`
      service["scrollSubscription"]?.unsubscribe();
    });

    describe("initial scroll position", () => {
      beforeEach(() => {
        ((scrollElement as any).scrollTo as jest.Mock).mockClear();
      });

      it("does not scroll when `scrollPosition` is null", () => {
        service["scrollPosition"] = null;

        service.start(scrollElement);

        expect((scrollElement as any).scrollTo).not.toHaveBeenCalled();
      });

      it("scrolls the element to `scrollPosition` (async via setTimeout)", fakeAsync(() => {
        service["scrollPosition"] = 500;

        service.start(scrollElement);
        tick();

        expect((scrollElement as any).scrollTo).toHaveBeenCalledWith({
          behavior: "instant",
          top: 500,
        });
        expect((scrollElement as any).scrollTop).toBe(500);
      }));
    });

    describe("scroll listener", () => {
      it("unsubscribes from any existing subscription", () => {
        service.start(scrollElement);

        expect(unsubscribe).toHaveBeenCalled();
      });

      it("keeps the stored position when a restore is clamped to a shorter list", fakeAsync(() => {
        // Switching to a vault with fewer items cannot honor the saved offset, so the browser
        // clamps `scrollTop` and fires a scroll event of its own.
        const clamp = 40;
        ((scrollElement as any).scrollTo as jest.Mock).mockImplementation(
          (opts: { top?: number }) => {
            (scrollElement as any).scrollTop = Math.min(opts?.top ?? 0, clamp);
            scrollElement.dispatchEvent(new Event("scroll"));
          },
        );
        service["scrollPosition"] = 234;

        service.start(scrollElement);
        tick();

        expect(service["scrollPosition"]).toBe(234);
      }));

      it("tracks the user's scrolling again once a restore has settled", fakeAsync(() => {
        service["scrollPosition"] = 234;

        service.start(scrollElement);
        tick();

        (scrollElement as any).scrollTop = 300;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(300);
      }));

      it("re-targets onto a replaced scroll element", fakeAsync(() => {
        // Navigating between vaults rebuilds `popup-page`, so the element the listener was
        // tracking is detached and a new one takes its place.
        service["scrollPosition"] = 234;
        service.start(scrollElement);
        tick();

        const replacement = document.createElement("div");
        (replacement as any).scrollTo = jest.fn();
        (replacement as any).scrollTop = 0;

        service.start(replacement);
        tick();

        expect((replacement as any).scrollTo).toHaveBeenCalledWith({
          behavior: "instant",
          top: 234,
        });

        // The detached element must no longer feed the stored position.
        (scrollElement as any).scrollTop = 999;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(234);

        // The live one does.
        (replacement as any).scrollTop = 150;
        replacement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(150);
      }));

      it("declares the restored-scrolled state before applying the offset", fakeAsync(() => {
        // Collapsing chrome comes out of the scroll viewport, so the bar has to be collapsed
        // before `scrollTo` runs or the offset lands against a shorter viewport.
        const scrollLayout = TestBed.inject(ScrollLayoutService);
        const order: string[] = [];

        ((scrollElement as any).scrollTo as jest.Mock).mockImplementation(() =>
          order.push("scrollTo"),
        );
        TestBed.runInInjectionContext(() => {
          effect(() => {
            if (scrollLayout.restoredScrolled()) {
              order.push("collapsed");
            }
          });
        });

        service["scrollPosition"] = 234;
        service.start(scrollElement);
        TestBed.flushEffects();
        tick();

        expect(order).toEqual(["collapsed", "scrollTo"]);
      }));

      it("hands the bar back to scroll tracking once the user scrolls", fakeAsync(() => {
        const scrollLayout = TestBed.inject(ScrollLayoutService);

        service["scrollPosition"] = 234;
        service.start(scrollElement);
        tick();

        expect(scrollLayout.restoredScrolled()).toBe(true);

        (scrollElement as any).scrollTop = 300;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(scrollLayout.restoredScrolled()).toBe(false);
      }));

      it("does not declare the state when there is nothing to restore", fakeAsync(() => {
        const scrollLayout = TestBed.inject(ScrollLayoutService);
        service["scrollPosition"] = null;

        service.start(scrollElement);
        tick();

        expect(scrollLayout.restoredScrolled()).toBe(false);
      }));

      it("clears the declared state on stop", fakeAsync(() => {
        const scrollLayout = TestBed.inject(ScrollLayoutService);

        service["scrollPosition"] = 234;
        service.start(scrollElement);
        tick();

        service.stop();

        expect(scrollLayout.restoredScrolled()).toBe(false);
      }));

      it("does not leave the restore guard raised after stop", fakeAsync(() => {
        service["scrollPosition"] = 234;

        service.start(scrollElement);
        service.stop();
        tick();

        service.start(scrollElement);
        tick();

        (scrollElement as any).scrollTop = 321;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(321);
      }));

      it("stores the first scroll when there was nothing to restore", fakeAsync(() => {
        // With no stored position there is no `scrollTo`, so the first event is the user's own.
        // Discarding it left the position null forever: leaving the vault for a cipher and coming
        // back restored nothing, because nothing had been saved.
        service["scrollPosition"] = null;

        service.start(scrollElement);

        (scrollElement as any).scrollTop = 111;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(111);
      }));

      it("keeps storing scrollTop on later scroll events", fakeAsync(() => {
        service["scrollPosition"] = null;

        service.start(scrollElement);

        (scrollElement as any).scrollTop = 111;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        (scrollElement as any).scrollTop = 455;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(455);
      }));
    });
  });
});
