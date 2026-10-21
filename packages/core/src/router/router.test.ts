import { describe, expect, it } from "vitest";
import { type CrumbMatch, deriveCrumbs } from "./index";

describe("deriveCrumbs", () => {
  it("derives title, tenant lookup and ignores shell layouts", () => {
    const matches: CrumbMatch[] = [
      { pathname: "/" },
      { pathname: "/", staticData: { breadcrumbIgnore: true } }, // _shell 布局
      { pathname: "/t/acme-web", params: { tenantId: "acme-web" } },
      {
        pathname: "/t/acme-web/services",
        params: { tenantId: "acme-web" },
        staticData: { title: "Services" },
      },
    ];
    const crumbs = deriveCrumbs(matches, {
      tenant: (id) => (id === "acme-web" ? "Acme Web" : undefined),
    });
    expect(crumbs).toEqual([
      { label: "Acme Web", to: "/t/acme-web" },
      { label: "Services", to: "/t/acme-web/services" },
    ]);
  });

  it("tenant index route with a title emits the title, not a duplicate tenant crumb", () => {
    // /t/acme-web 布局（无 title → 租户段）+ 同路径 index（title Overview）
    const matches: CrumbMatch[] = [
      { pathname: "/t/acme-web", params: { tenantId: "acme-web" } },
      {
        pathname: "/t/acme-web",
        params: { tenantId: "acme-web" },
        staticData: { title: "Overview" },
      },
    ];
    expect(deriveCrumbs(matches)).toEqual([
      { label: "acme-web", to: "/t/acme-web" },
      { label: "Overview", to: "/t/acme-web" },
    ]);
  });

  it("falls back to the raw tenant id when resolve.tenant misses", () => {
    const crumbs = deriveCrumbs([
      { pathname: "/t/unknown-org", params: { tenantId: "unknown-org" } },
    ]);
    expect(crumbs).toEqual([{ label: "unknown-org", to: "/t/unknown-org" }]);
  });

  it("truncates segments longer than 20 chars", () => {
    const long = "a-very-long-tenant-name-x";
    const crumbs = deriveCrumbs([{ pathname: `/t/${long}`, params: { tenantId: long } }]);
    expect(crumbs[0]?.label).toBe(`${long.slice(0, 20)}…`);
  });

  it("uses the raw path segment when no title is present (idFallback applies)", () => {
    const matches: CrumbMatch[] = [
      { pathname: "/x/svc_12345" },
      { pathname: "/x/svc_67890", params: {} },
    ];
    expect(deriveCrumbs(matches)).toEqual([
      { label: "svc_12345", to: "/x/svc_12345" },
      { label: "svc_67890", to: "/x/svc_67890" },
    ]);
    expect(deriveCrumbs(matches, { idFallback: (seg) => `#${seg.slice(0, 3)}` })[0]?.label).toBe(
      "#svc",
    );
  });

  it("skips the root segment (empty)", () => {
    expect(deriveCrumbs([{ pathname: "/" }])).toEqual([]);
  });
});
