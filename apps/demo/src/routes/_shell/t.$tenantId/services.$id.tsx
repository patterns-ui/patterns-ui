import { useInlineEdit } from "@fleetly/ui-component-core/inline";
import { useTaskSubmit } from "@fleetly/ui-component-core/task";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { Boxes, Pencil, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CellEnumBadge } from "@/components/blocks/cells/cell-enum-badge/cell-enum-badge";
import { CellProgress } from "@/components/blocks/cells/cell-progress/cell-progress";
import { CellStatus } from "@/components/blocks/cells/cell-status/cell-status";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { FormSheet } from "@/components/blocks/form/form-sheet/form-sheet";
import { Stepper } from "@/components/blocks/form/stepper/stepper";
import {
  FormMessage,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { InlineBar } from "@/components/blocks/list/data-table/data-table";
import { ErrorState } from "@/components/blocks/shared/error-state/error-state";
import { DangerZone } from "@/components/blocks/show/danger-zone/danger-zone";
import { DetailGrid } from "@/components/blocks/show/detail-grid/detail-grid";
import { DetailPage, useDetailTabParam } from "@/components/blocks/show/detail-page/detail-page";
import { InlineEditField } from "@/components/blocks/show/inline-edit-field/inline-edit-field";
import { RecordPager } from "@/components/blocks/show/record-pager/record-pager";
import { ReferenceField } from "@/components/blocks/show/reference-field/reference-field";
import { Timeline } from "@/components/blocks/show/timeline/timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getTask } from "@/lib/clients";
import type { MockDeployment, MockService } from "@/mocks/db";
import { makeDeploymentsResource, servicesResource, usersResource } from "@/resources";

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  running: "success",
  degraded: "warning",
  stopped: "neutral",
};

function ServiceDetailPage() {
  const { tenantId, id } = Route.useParams();
  const navigate = useNavigate();
  const { activeTab, setTab } = useDetailTabParam("overview");
  const [deployOpen, setDeployOpen] = useState(false);
  // 子路由（edit）激活时本路由只作为布局：不重复渲染详情 UI
  const childActive = useRouterState({
    select: (s) => (s.matches.at(-1)?.routeId ?? "") !== Route.id,
  });

  const query = servicesResource.useOne(id);
  const service = query.data;

  if (childActive) return <Outlet />;

  // record-pager 数据源：详情页取一页列表（当前 id 所在段；演示相邻跳转）
  const listQuery = servicesResource.useList({ pageSize: 20, page: 1 });

  const deleteService = servicesResource.useDelete({
    onSuccess: async () => {
      toast.success("服务已删除");
      await navigate({ to: "/t/$tenantId/services", params: { tenantId } });
    },
  });
  const updateService = servicesResource.useUpdate({
    onSuccess: () => toast.success("已保存（版本 +1）"),
  });

  if (service === undefined) {
    if (query.isError) {
      return (
        <div className="mx-auto w-full max-w-5xl">
          <ErrorState
            error={query.error instanceof Error ? query.error : new Error("加载失败")}
            onRetry={() => void query.refetch()}
          />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <DetailPage
        title={service.name}
        heroMeta={{
          icon: Boxes,
          subtitle: `${service.id} · v${service.version}`,
          badges: [
            <CellEnumBadge
              key="env"
              value={service.env}
              options={[
                { value: "rep", variant: "outline" },
                { value: "staging", variant: "secondary" },
                { value: "prod", variant: "default" },
              ]}
            />,
          ],
        }}
        status={{
          tone: STATUS_TONES[service.status] ?? "neutral",
          label: service.status,
          pulse: service.status === "running",
        }}
        backTo={{ to: `/t/${tenantId}/services`, label: "Services" }}
        actions={
          <>
            <Button
              variant="outline"
              render={
                <Link
                  to="/t/$tenantId/services/$id/edit"
                  params={{ tenantId, id: service.id }}
                  search
                />
              }
            >
              <Pencil /> 编辑
            </Button>
            <Button onClick={() => setDeployOpen(true)}>
              <Rocket /> 部署
            </Button>
          </>
        }
        lead={
          <RecordPager
            rows={listQuery.data?.rows}
            currentId={service.id}
            to={(nextId) => `/t/${tenantId}/services/${encodeURIComponent(nextId)}`}
          />
        }
        activeTab={activeTab}
        onTabChange={setTab}
        tabs={[
          {
            id: "overview",
            label: "概览",
            content: (
              <section className="bg-card text-card-foreground rounded-xl border p-6">
                <DetailGrid
                  title="基本信息"
                  data={service as unknown as Record<string, unknown>}
                  items={[
                    {
                      label: "名称",
                      field: "name",
                      render: (value) => (
                        <InlineEditField
                          value={value as string}
                          onSave={async (next) => {
                            await updateService.mutateAsync({
                              id: service.id,
                              name: next,
                              version: String(service.version),
                            });
                          }}
                        />
                      ),
                    },
                    {
                      label: "环境",
                      field: "env",
                      cell: "enum-badge",
                      cellOptions: {
                        options: [
                          { value: "rep", variant: "outline" as const },
                          { value: "staging", variant: "secondary" as const },
                          { value: "prod", variant: "default" as const },
                        ],
                      },
                    },
                    {
                      label: "状态",
                      field: "status",
                      cell: "status",
                      cellOptions: {
                        map: {
                          running: "success" as const,
                          degraded: "warning" as const,
                          stopped: "neutral" as const,
                        },
                      },
                    },
                    {
                      label: "负责人",
                      field: "owner",
                      render: (value) => (
                        <ReferenceField
                          resource={usersResource}
                          id={value as string}
                          getIdLabel={(row) => row.name}
                        />
                      ),
                    },
                    {
                      label: "副本",
                      field: "replicas",
                      render: (value) => (
                        <InlineEditField
                          value={value as number}
                          type="number"
                          onSave={async (next) => {
                            await updateService.mutateAsync({
                              id: service.id,
                              replicas: Number(next),
                              version: String(service.version),
                            });
                          }}
                        />
                      ),
                    },
                    { label: "区域", field: "region" },
                    { label: "创建时间", field: "createdAt", cell: "time" },
                    { label: "更新时间", field: "updatedAt", cell: "time" },
                    {
                      label: "版本",
                      field: "version",
                      render: (v) => <span className="font-mono text-xs">v{String(v)}</span>,
                    },
                  ]}
                />
              </section>
            ),
          },
          {
            id: "deployments",
            label: "部署",
            content: (
              <DeploymentsTab
                tenantId={tenantId}
                service={service}
                onTrigger={() => setDeployOpen(true)}
              />
            ),
          },
          {
            id: "settings",
            label: "设置",
            content: (
              <DangerZone
                actions={[
                  {
                    label: `删除服务 ${service.name}`,
                    description: "删除后不可恢复；关联部署记录将一并清除。",
                    typeToConfirm: service.name,
                    confirmLabel: "删除服务",
                    pending: deleteService.isPending,
                    run: async () => {
                      await deleteService.mutateAsync({ id: service.id });
                    },
                  },
                ]}
              />
            ),
          },
        ]}
      />
      <DeploySheet
        open={deployOpen}
        onOpenChange={setDeployOpen}
        tenantId={tenantId}
        service={service}
      />
      {/* 子路由（edit 页）挂载点 */}
      <Outlet />
    </>
  );
}

// ---------------------------------------------------------------------------
// 部署 tab：子资源列表（keyset）+ 行状态 + 触发 + 行内改 replicas + task 轮询刷新
// ---------------------------------------------------------------------------

function DeploymentsTab({
  tenantId,
  service,
  onTrigger,
}: {
  tenantId: string;
  service: MockService;
  onTrigger: () => void;
}) {
  const resource = useMemo(
    () => makeDeploymentsResource(tenantId, service.id),
    [tenantId, service.id],
  );
  const query = resource.useList({ pageSize: 10, refetchInterval: 2000 });

  const rows = query.data?.rows ?? [];

  // M4：replicas 行内编辑改接 useInlineEdit changeSet —— 改多行、一次批量提交
  const inline = useInlineEdit<MockDeployment>({
    rows,
    getId: (row) => row.id,
    commit: async (changes) => {
      // mock 无批量端点：逐行 PATCH 聚合；全部成功才视为提交成功
      await Promise.all(
        changes.map((change) =>
          resource.client.update?.(change.id, change.patch as Partial<MockDeployment>),
        ),
      );
      await query.refetch();
    },
  });

  return (
    <section className="bg-card text-card-foreground overflow-hidden rounded-xl border">
      <header className="flex items-center justify-between border-b px-5 py-3.5">
        <div>
          <h2 className="text-sm font-medium">部署历史</h2>
          <p className="text-muted-foreground text-xs">
            子资源 keyset 分页（/services/:sid/deployments）· 每 2s 轮询推进行内状态
          </p>
        </div>
        <Button size="sm" onClick={onTrigger}>
          <Rocket /> 触发部署
        </Button>
      </header>
      {rows.length === 0 ? (
        <p className="text-muted-foreground px-5 py-10 text-center text-sm">
          还没有部署记录 —— 点击「触发部署」开始第一次发布。
        </p>
      ) : (
        <>
          <div className="border-b px-5 py-4">
            <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              最新部署阶段（timeline）
            </p>
            <Timeline
              items={[
                {
                  title: "排队",
                  state: "done",
                  at: rows[0]?.createdAt,
                  detail: `task ${rows[0]?.taskId}`,
                },
                {
                  title: "构建",
                  state: latestState(rows[0]) === "queued" ? "waiting" : "done",
                  at: rows[0]?.createdAt,
                },
                {
                  title: "下发副本",
                  state:
                    latestState(rows[0]) === "succeeded"
                      ? "done"
                      : latestState(rows[0]) === "building" || latestState(rows[0]) === "deploying"
                        ? "running"
                        : "waiting",
                },
                {
                  title: rows[0]?.status === "failed" ? "失败" : "完成",
                  state:
                    rows[0]?.status === "failed"
                      ? "failed"
                      : rows[0]?.status === "succeeded"
                        ? "done"
                        : "waiting",
                  detail: rows[0]?.status === "failed" ? "健康检查未通过（演示）" : undefined,
                },
              ]}
            />
          </div>
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-sm"
              >
                <CellStatus
                  value={row.status}
                  pulseFor={["building", "deploying"]}
                  map={{
                    queued: "neutral",
                    building: "info",
                    deploying: "info",
                    succeeded: "success",
                    failed: "danger",
                  }}
                />
                <span className="text-muted-foreground font-mono text-xs">{row.id}</span>
                <span>
                  {row.source.kind === "git"
                    ? `git · ${row.branch ?? "main"}`
                    : `image · ${row.source.ref}`}
                </span>
                <CellProgress
                  value={row.progress}
                  state={row.status === "failed" ? "danger" : undefined}
                />
                <DeploymentReplicasCell row={row} ctl={inline.getCell(row.id, "replicas")} />
                <CellTime value={row.createdAt} className="ml-auto" />
              </li>
            ))}
          </ul>
          {inline.dirtyCount > 0 ? (
            <footer className="border-t px-5 py-3">
              <InlineBar
                count={inline.dirtyCount}
                label="副本变更"
                pending={false}
                onCommit={() => {
                  void inline.commit().then(() => toast.success("已批量提交副本变更"));
                }}
                onRevert={inline.revert}
              />
            </footer>
          ) : null}
          {query.data?.nextCursor !== undefined ? (
            <footer className="border-t px-5 py-2.5">
              <span className="text-muted-foreground text-xs">
                更多记录走 keyset 下一页（cursor: {query.data.nextCursor.slice(0, 24)}…）
              </span>
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}

function latestState(row: MockDeploymentLike | undefined): string {
  return row?.status ?? "queued";
}

interface MockDeploymentLike {
  status?: string;
}

// ---------------------------------------------------------------------------
// 部署表单：FormSheet + Stepper（来源 → 参数 → 确认 summary）→ useTaskSubmit → 轮询刷新
// ---------------------------------------------------------------------------

const deploySchema = z
  .object({
    kind: z.enum(["git", "image"]),
    branch: z.string(),
    ref: z.string(),
    replicas: z.number().int().min(1, "副本数 1-50").max(50, "副本数 1-50"),
    envOverrides: z.array(z.object({ key: z.string().min(1, "键不能为空"), value: z.string() })),
    simulateFail: z.boolean(),
  })
  .refine((v) => (v.kind === "git" ? v.branch.trim() !== "" : v.ref.trim() !== ""), {
    message: "来源不能为空（git 需填分支 / image 需填镜像地址）",
    path: ["branch"],
  });

type DeployValues = z.output<typeof deploySchema>;

function DeploySheet({
  open,
  onOpenChange,
  tenantId,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  service: MockService;
}) {
  const resource = useMemo(
    () => makeDeploymentsResource(tenantId, service.id),
    [tenantId, service.id],
  );
  const [submitting, setSubmitting] = useState(false);
  const { submit } = useTaskSubmit(getTask, {
    pollIntervalMs: 1200,
    onDone: (task) => {
      if (task.state === "succeeded") toast.success("部署完成（succeeded）");
      else toast.error(task.error ?? "部署失败");
    },
  });

  const form = useAppForm({
    defaultValues: {
      kind: "git",
      branch: "main",
      ref: "",
      replicas: service.replicas,
      envOverrides: [],
      simulateFail: false,
    } as DeployValues,
    validators: { onChange: deploySchema },
    onSubmit: async ({ value, formApi }) => {
      setSubmitting(true);
      try {
        const final = await submit(async () =>
          resource.client.create?.({
            source: { kind: value.kind, ref: value.kind === "git" ? value.branch : value.ref },
            branch: value.kind === "git" ? value.branch : undefined,
            replicas: value.replicas,
            envOverrides: Object.fromEntries(
              value.envOverrides.filter((r) => r.key !== "").map((r) => [r.key, r.value]),
            ),
            ...(value.simulateFail ? { simulate: "fail" } : {}),
          }),
        );
        if (final.state === "succeeded") {
          toast.success("部署任务完成");
        } else {
          toast.error(final.error ?? "部署失败");
        }
        onOpenChange(false);
      } catch (err) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: err instanceof Error ? err.message : "触发部署失败" },
        });
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <form.AppForm>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`部署 ${service.name}`}
        description="Stepper 分步（每步校验）→ 触发长任务（queued→running→succeeded/failed）→ 完成自动刷新部署列表。"
        width="md"
        footer={<FormMessage />}
      >
        <div>
          <Stepper
            pending={submitting}
            steps={[
              {
                title: "来源",
                description: "选择 git 分支或镜像（SelectWidget 联动 visibleWhen 演示）。",
                content: (
                  <div className="space-y-4">
                    <form.AppField name="kind">
                      {(field) => (
                        <field.SelectWidget
                          label="来源类型"
                          required
                          options={[
                            { value: "git", label: "Git 分支" },
                            { value: "image", label: "容器镜像" },
                          ]}
                        />
                      )}
                    </form.AppField>
                    <form.Subscribe selector={(s) => s.values.kind}>
                      {(kind) =>
                        kind === "git" ? (
                          <form.AppField name="branch">
                            {(field) => (
                              <field.TextWidget label="分支" required placeholder="main" mono />
                            )}
                          </form.AppField>
                        ) : (
                          <form.AppField name="ref">
                            {(field) => (
                              <field.TextWidget
                                label="镜像地址"
                                required
                                placeholder="registry.example.com/app:1.4"
                                mono
                              />
                            )}
                          </form.AppField>
                        )
                      }
                    </form.Subscribe>
                  </div>
                ),
                validate: async () => {
                  const values = form.store.state.values as DeployValues;
                  if (values.kind === "git" && values.branch.trim() === "") return ["分支必填"];
                  if (values.kind === "image" && values.ref.trim() === "") return ["镜像地址必填"];
                  return [];
                },
              },
              {
                title: "参数",
                description: "副本数与环境变量覆盖（KvPairs）。",
                content: (
                  <div className="space-y-4">
                    <form.AppField name="replicas">
                      {(field) => (
                        <field.NumberWidget label="副本数" required min={1} max={50} unit="个" />
                      )}
                    </form.AppField>
                    <form.AppField name="envOverrides">
                      {(field) => <field.KvPairsWidget label="环境变量覆盖" keyPlaceholder="KEY" />}
                    </form.AppField>
                    <form.AppField name="simulateFail">
                      {(field) => (
                        <field.SwitchWidget
                          label="演示失败终态"
                          description="开启后任务将以 failed 结束"
                        />
                      )}
                    </form.AppField>
                  </div>
                ),
                validate: async () => {
                  const values = form.store.state.values as DeployValues;
                  if (values.replicas < 1 || values.replicas > 50) return ["副本数必须在 1-50"];
                  return [];
                },
              },
              {
                title: "确认",
                description: "提交前核对参数（summary）。",
                content: <DeploySummary form={form} />,
              },
            ]}
            onComplete={() => void form.handleSubmit()}
          />
        </div>
      </FormSheet>
    </form.AppForm>
  );
}

function DeploySummary({
  form,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例松类型传递
  form: any;
}) {
  return (
    <form.Subscribe selector={(s: { values: DeployValues }) => s.values}>
      {(values: DeployValues) => {
        const v = values as DeployValues;
        return (
          <dl className="space-y-2.5 rounded-lg border p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">来源</dt>
              <dd className="font-mono text-xs">
                {v.kind === "git" ? `git · ${v.branch}` : `image · ${v.ref}`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">副本数</dt>
              <dd className="tabular-nums">{v.replicas}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">环境变量覆盖</dt>
              <dd className="font-mono text-xs">
                {v.envOverrides.length === 0 ? "无" : v.envOverrides.map((r) => r.key).join(", ")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">预期结果</dt>
              <dd>{v.simulateFail ? "失败终态（演示）" : "成功部署"}</dd>
            </div>
          </dl>
        );
      }}
    </form.Subscribe>
  );
}

/** 副本 changeSet 单元格：双击进入编辑（Enter 提交到 changeSet / Esc 取消）；脏值高亮 */
function DeploymentReplicasCell({
  row,
  ctl,
}: {
  row: MockDeployment;
  ctl: { value: unknown; isDirty: boolean; set(v: unknown): void };
}) {
  const [editing, setEditing] = useState(false);
  const value = ctl.isDirty ? Number(ctl.value) : row.replicas;

  if (editing) {
    return (
      <input
        ref={(node) => node?.focus()}
        type="number"
        defaultValue={value}
        className="bg-background h-7 w-16 rounded-md border px-1.5 font-mono text-xs tabular-nums outline-none"
        onBlur={(e) => {
          ctl.set(Number(e.currentTarget.value));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            ctl.set(Number(e.currentTarget.value));
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="flex items-center gap-1.5" title="双击编辑（批量提交）">
      副本
      <button
        type="button"
        onDoubleClick={() => setEditing(true)}
        className={cn(
          "rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
          ctl.isDirty
            ? "bg-primary/10 text-primary ring-primary/30 ring-1 ring-inset"
            : "hover:bg-muted text-foreground",
        )}
      >
        {value}
        {ctl.isDirty ? " *" : ""}
      </button>
    </span>
  );
}

const searchSchema = z.object({
  tab: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_shell/t/$tenantId/services/$id")({
  staticData: { title: "服务详情" },
  validateSearch: searchSchema,
  component: ServiceDetailPage,
});
