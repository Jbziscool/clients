import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { NavigationEnd, Router } from "@angular/router";
import { Subject, Subscription } from "rxjs";

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

      it("stores scrollTop on subsequent scroll events (skips first)", fakeAsync(() => {
        service["scrollPosition"] = null;

        service.start(scrollElement);

        // First scroll event is intentionally ignored (equivalent to old skip(1)).
        (scrollElement as any).scrollTop = 111;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBeNull();

        // Second scroll event should persist.
        (scrollElement as any).scrollTop = 455;
        scrollElement.dispatchEvent(new Event("scroll"));
        tick();

        expect(service["scrollPosition"]).toBe(455);
      }));
    });
  });
});
