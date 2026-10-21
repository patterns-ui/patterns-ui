// @vitest-environment happy-dom
/**
 * useResourceForm / useFormDirtyGuard 契约测试（docs/core-api.md §5）。
 * 覆盖：create/edit 双模式、422 字段错误、409 冲突、autosave 草稿（防抖写/恢复/丢弃）、
 * redirect 相对导航、dirty guard（useBlocker 行内拦截 + beforeUnload）。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import { createContext, useState as ReactUseState, useContext } from "react";
import { describe, expect, it, vi } from "vitest";
import { createResource, HttpError, type ResourceClient } from "../data";
import { draftKey, useFormDirtyGuard, useResourceForm } from "./index";

interface Row {
  id: string;
  name: string;
  env: string;
  version: number;
}

function makeClient(rows: Row[], opts: { failCreate?: unknown; failUpdate?: unknown } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
    list: async () => ({ rows, total: rows.length }),
    get: async (id: string) => {
      calls.push({ method: "get", args: [id] });
      const row = rows.find((r) => r.id === id);
      if (!row) throw new HttpError(404, "not found");
      return row;
    },
    create: async (vars) => {
      calls.push({ method: "create", args: [vars] });
      if (opts.failCreate) throw opts.failCreate;
      const row: Row = {
        id: `new-${rows.length}`,
        name: vars.name ?? "?",
        env: vars.env ?? "rep",
        version: 1,
      };
      rows.push(row);
      return row;
    },
    update: async (id, vars, updateOpts) => {
      calls.push({ method: "update", args: [id, vars, updateOpts] });
      if (opts.failUpdate) throw opts.failUpdate;
      const row = rows.find((r) => r.id === id);
      if (!row) throw new HttpError(404, "not found");
      Object.assign(row, vars);
      return row;
    },
  };
  return { client, calls };
}

const SCHEMA = { "~standard": {} } as never;

// ---------------------------------------------------------------------------
// Router harness（useNavigate / useBlocker 需要路由上下文）
// probe 函数在根路由组件渲染期间调用（React 渲染上下文内合法调用 hooks）
// ---------------------------------------------------------------------------

const ProbeContext = createContext<() => unknown>(() => undefined);
const QueryClientHarnessContext = createContext<QueryClient>(new QueryClient());
const SinkContext = createContext<{ current: unknown }>({ current: undefined });

/** 真组件内调用 probe（hooks 合法）；结果写入 sink 供断言 */
function ProbeHost() {
  const renderProbe = useContext(ProbeContext) as () => unknown;
  const sink = useContext(SinkContext);
  sink.current = renderProbe();
  return null;
}

function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientHarnessContext.Consumer>
        {(queryClient) => (
          <QueryClientProvider client={queryClient}>
            <ProbeHost />
          </QueryClientProvider>
        )}
      </QueryClientHarnessContext.Consumer>
    ),
  });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services",
    component: Outlet,
  });
  const newRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services/new",
    component: Outlet,
  });
  const editRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/services/$id/edit",
    component: Outlet,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, newRoute, editRoute]),
    history: createMemoryHistory({ initialEntries: ["/services"] }),
  });
  return router;
}

/** renderHook + Router + QueryClient 组合（probe 在真组件内执行 hooks；等待首渲染完成） */
async function renderInRoute<T>(
  renderProbe: () => T,
  router: ReturnType<typeof buildRouter>,
): Promise<{ current: () => T }> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const sink: { current: unknown } = { current: undefined };
  render(
    <QueryClientHarnessContext.Provider value={queryClient}>
      <ProbeContext.Provider value={renderProbe as unknown as () => unknown}>
        <SinkContext.Provider value={sink}>
          <RouterProvider router={router} />
        </SinkContext.Provider>
      </ProbeContext.Provider>
    </QueryClientHarnessContext.Provider>,
  );
  await waitFor(() => {
    if (sink.current === undefined) throw new Error("probe 尚未渲染");
  });
  return {
    current: () => {
      if (sink.current === undefined) throw new Error("probe 尚未渲染");
      return sink.current as T;
    },
  };
}

describe("useResourceForm", () => {
  it("create 模式：initialValues 即默认值；提交走 create；成功清草稿", async () => {
    localStorage.clear();
    const rows: Row[] = [];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-form-test",
      client,
    });
    const router = buildRouter();
    await act(async () => {
      router.navigate({ to: "/services/new" });
      await router.invalidate();
    });

    const harness = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource,
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
          redirect: "stay",
        }),
      router,
    );
    expect(harness.current().mode).toBe("create");
    expect(harness.current().initialValues).toEqual({ name: "", env: "rep" });

    let result: unknown;
    await act(async () => {
      result = await harness.current().onSubmit({ id: "", name: "abc", env: "prod", version: 0 });
    });
    expect(result).toEqual({
      ok: true,
      data: { id: "new-0", name: "abc", env: "prod", version: 1 },
    });
    expect(calls.map((c) => c.method)).toContain("create");
    expect(localStorage.getItem(draftKey("svc-form-test", undefined))).toBeNull();
  });

  it("edit 模式：取数完成前 initialValues 为 undefined；提交带 id+version 走 update", async () => {
    localStorage.clear();
    const rows: Row[] = [{ id: "svc-1", name: "old", env: "rep", version: 3 }];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-edit-test",
      client,
    });
    const router = buildRouter();

    const harness = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource,
          id: "svc-1",
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
          redirect: "stay",
        }),
      router,
    );
    expect(harness.current().mode).toBe("edit");
    await waitFor(() => expect(harness.current().recordLoading).toBe(false));
    expect(harness.current().initialValues).toEqual({
      id: "svc-1",
      name: "old",
      env: "rep",
      version: 3,
    });

    await act(async () => {
      await harness.current().onSubmit({
        id: "svc-1",
        name: "new",
        env: "prod",
        version: 3,
      });
    });
    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toBe("svc-1");
    expect(updateCall?.args[2]).toEqual({ version: "3" });
  });

  it("422：服务端字段错误回填 fieldErrors；409 → formError 冲突文案", async () => {
    localStorage.clear();
    const conflict = makeClient([], {
      failUpdate: new HttpError(409, "版本冲突：期望 2，收到 1"),
    });
    const conflictResource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-409",
      client: conflict.client,
    });
    const invalid = makeClient([], {
      failCreate: new HttpError(422, "校验失败", {
        fields: { name: "名称已被占用", env: "env 非法" },
        form: "请修正 2 处错误",
      }),
    });
    const invalidResource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-422",
      client: invalid.client,
    });
    const router = buildRouter();

    const h422 = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource: invalidResource,
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
          redirect: "stay",
        }),
      router,
    );
    let result: unknown;
    await act(async () => {
      result = await h422.current().onSubmit({ id: "", name: "dup", env: "bad", version: 0 });
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "名称已被占用", env: "env 非法" },
      formError: "请修正 2 处错误",
    });

    const h409 = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource: conflictResource,
          id: "svc-9",
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
          redirect: "stay",
        }),
      router,
    );
    await waitFor(() => expect(h409.current().recordLoading).toBe(false));
    await act(async () => {
      result = await h409.current().onSubmit({ id: "svc-9", name: "y", env: "rep", version: 2 });
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: {},
      formError: "记录已被他人修改，请刷新后重试",
    });
  });

  it("autosave：防抖写草稿 → draftRestored → discardDraft 清空", async () => {
    localStorage.clear();
    const { client } = makeClient([]);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-draft",
      client,
    });
    const router = buildRouter();

    const key = draftKey("svc-draft", undefined);
    const harness = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource,
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
          autosave: { debounceMs: 20 },
          redirect: "stay",
        }),
      router,
    );
    expect(harness.current().draftRestored).toBe(false);

    await act(async () => {
      harness.current().saveDraft({ name: "draft-name", env: "prod" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(JSON.parse(localStorage.getItem(key) ?? "{}")).toEqual({
      name: "draft-name",
      env: "prod",
    });

    // 重挂载（新 hook 实例）→ 恢复草稿
    const harness2 = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource,
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
        }),
      buildRouter(),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(harness2.current().draftRestored).toBe(true);
    expect(harness2.current().initialValues).toEqual({ name: "draft-name", env: "prod" });

    // 丢弃 → 草稿清除 + initialValues 回落默认值
    await act(async () => {
      harness2.current().discardDraft();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(localStorage.getItem(key)).toBeNull();
    expect(harness2.current().draftRestored).toBe(false);
    expect(harness2.current().initialValues).toEqual({ name: "", env: "rep" });
  });

  it("redirect list：create 成功后相对导航回列表", async () => {
    localStorage.clear();
    const rows: Row[] = [];
    const { client } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "svc-nav",
      client,
    });
    const router = buildRouter();
    await act(async () => {
      router.navigate({ to: "/services/new" });
      await router.invalidate();
    });

    const harness = await renderInRoute(
      () =>
        useResourceForm<Row>({
          resource,
          schema: SCHEMA,
          defaultValues: { name: "", env: "rep" },
        }),
      router,
    );
    await act(async () => {
      await harness.current().onSubmit({ id: "", name: "n", env: "rep", version: 0 });
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/services"));
  });
});

describe("useFormDirtyGuard", () => {
  it("行内导航拦截：dirty 时 blocked → stay() 留下；proceed() 放行", async () => {
    const router = buildRouter();
    let setDirty: ((v: boolean) => void) | undefined;
    const harness = await renderInRoute(() => {
      const [dirty, setD] = ReactUseState(false);
      setDirty = setD;
      return useFormDirtyGuard(dirty);
    }, router);

    // 干净状态：导航不被拦截
    await act(async () => {
      await router.navigate({ to: "/services/new" });
    });
    expect(router.state.location.pathname).toBe("/services/new");
    expect(harness.current().blocked).toBe(false);

    // 脏状态：导航被阻塞
    await act(async () => {
      setDirty?.(true);
    });
    await act(async () => {
      void router.navigate({ to: "/services" });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(harness.current().blocked).toBe(true);
    expect(router.state.location.pathname).toBe("/services/new");

    // stay() → 取消导航
    await act(async () => {
      harness.current().stay();
    });
    expect(harness.current().blocked).toBe(false);
    expect(router.state.location.pathname).toBe("/services/new");

    // 再拦一次 → proceed() 放行
    await act(async () => {
      void router.navigate({ to: "/services" });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(harness.current().blocked).toBe(true);
    await act(async () => {
      harness.current().proceed();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(router.state.location.pathname).toBe("/services");
  });

  it("beforeunload 监听随 dirty 开关", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const router = buildRouter();
    let setDirty: ((v: boolean) => void) | undefined;
    await renderInRoute(() => {
      const [dirty, setD] = ReactUseState(false);
      setDirty = setD;
      return useFormDirtyGuard(dirty);
    }, router);

    await act(async () => {
      setDirty?.(true);
    });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const calls = addSpy.mock.calls.filter(([event]) => event === "beforeunload");
    const handler = calls[calls.length - 1]?.[1] as (e: BeforeUnloadEvent) => void;

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    handler(event);
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      setDirty?.(false);
    });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", handler);
  });
});
