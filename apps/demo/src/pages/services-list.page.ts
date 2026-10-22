/**
 * services 列表页配置（M7-A3 批1）：def（全资源单源：列表/详情/表单共享）+
 * ResourceListView 声明化 spec —— 纯配置（0 JSX）。
 *
 * 原 services.index.tsx 的手工组装（ListPage/FilterBar/DataTable/SelectionBar/
 * ExportButton/NewItemsBanner/RefreshBar 手拼 + useResourceMutations）全部下沉为
 * 本 spec + 视图工厂参数；行为等价（e2e：冒烟主链路、sticky 列、翻页、过滤树 URL）。
 */

import { defineResource } from "@patterns-ui/core/resource";
import type { ResourceExportState } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { resolveUser, servicesResource, usersResource } from "@/resources";

/**
 * services def：list 配置单源（分页协议 page = 页码协议 ?page=&size=，可跳页、有 total）。
 * TData 经 client 上下文推断（配置文件禁显式泛型实参——paradigm §3.3 验收命令）。
 */
export const servicesDef = defineResource({
  name: "services",
  client: servicesResource.client,
  columns: [
    {
      accessorKey: "id",
      header: "ID",
      meta: { cell: "id", cellOptions: { chars: 11 } },
    },
    { accessorKey: "name", header: "名称" },
    {
      accessorKey: "env",
      header: "环境",
      meta: {
        cell: "enum-badge",
        cellOptions: {
          options: [
            { value: "rep", variant: "outline" },
            { value: "staging", variant: "secondary" },
            { value: "prod", variant: "default" },
          ],
        },
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      meta: { cell: "status", cellOptions: { pulseFor: ["running"] } },
    },
    {
      accessorKey: "replicas",
      header: "副本",
      meta: { cell: "number", cellOptions: { unit: "个" } },
    },
    { accessorKey: "region", header: "区域" },
    {
      accessorKey: "owner",
      header: "负责人",
      meta: { cell: "user", cellOptions: { resolve: resolveUser } },
    },
    { accessorKey: "updatedAt", header: "更新时间", meta: { cell: "time" } },
  ],
  filters: [
    {
      field: "status",
      label: "状态",
      kind: "multi-select",
      options: [
        { value: "running", label: "running" },
        { value: "degraded", label: "degraded" },
        { value: "stopped", label: "stopped" },
      ],
    },
    {
      field: "env",
      label: "环境",
      kind: "select",
      options: [
        { value: "rep", label: "rep" },
        { value: "staging", label: "staging" },
        { value: "prod", label: "prod" },
      ],
    },
    { field: "replicas", label: "副本数", kind: "number" },
    {
      field: "region",
      label: "区域",
      kind: "select",
      options: [
        { value: "cn-beijing", label: "cn-beijing" },
        { value: "cn-shanghai", label: "cn-shanghai" },
        { value: "cn-hangzhou", label: "cn-hangzhou" },
        { value: "ap-southeast-1", label: "ap-southeast-1" },
        { value: "us-west-2", label: "us-west-2" },
      ],
    },
    { field: "createdAt", label: "创建时间", kind: "date-range" },
  ],
  list: { pagination: { mode: "page" }, pageSize: 30, facets: ["env", "status"] },
  show: {
    // 概览节（声明式 items：cell + cellOptions；inline-edit 的保存接线由路由胶水注入）
    sections: [
      {
        title: "基本信息",
        items: [
          { label: "名称", field: "name", cell: "inline-edit" },
          {
            label: "环境",
            field: "env",
            cell: "enum-badge",
            cellOptions: {
              options: [
                { value: "rep", variant: "outline" },
                { value: "staging", variant: "secondary" },
                { value: "prod", variant: "default" },
              ],
            },
          },
          {
            label: "状态",
            field: "status",
            cell: "status",
            cellOptions: {
              map: { running: "success", degraded: "warning", stopped: "neutral" },
            },
          },
          {
            label: "负责人",
            field: "owner",
            cell: "reference",
            cellOptions: {
              resource: usersResource,
              getIdLabel: (row) => String(row.name ?? ""),
            },
          },
          {
            label: "副本",
            field: "replicas",
            cell: "inline-edit",
            cellOptions: { type: "number" },
          },
          { label: "区域", field: "region" },
          { label: "创建时间", field: "createdAt", cell: "time" },
          { label: "更新时间", field: "updatedAt", cell: "time" },
          { label: "版本", field: "version", cell: "mono", cellOptions: { prefix: "v" } },
        ],
      },
    ],
    tabs: [
      { id: "overview", label: "概览", kind: "sections" },
      { id: "deployments", label: "部署", kind: "custom", sandbox: "service-deployments" },
      { id: "settings", label: "设置", kind: "custom", sandbox: "service-danger" },
    ],
  },
});

import { defineResourceListPage } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { fetchAllForExport } from "@/lib/clients";

/** 过滤感知导出适配器（当前应用的状态整取；类型化，非 UI 闭包） */
function fetchServicesForExport(state: ResourceExportState) {
  return fetchAllForExport(servicesDef.client, {
    pageSize: 100,
    filters: state.filters as never,
    sort: [...state.sort],
    search: state.search !== "" ? state.search : undefined,
  });
}

export const servicesListSpec = defineResourceListPage({
  def: servicesDef,
  description: "集群中运行的服务及其状态。",
  headerActions: [
    { id: "refresh", kind: "refresh" },
    {
      id: "export",
      kind: "export",
      filename: "services",
      columns: [
        { key: "id", header: "ID" },
        { key: "name", header: "名称" },
        { key: "env", header: "环境" },
        { key: "status", header: "状态" },
        { key: "replicas", header: "副本" },
        { key: "region", header: "区域" },
        { key: "owner", header: "负责人" },
        { key: "createdAt", header: "创建时间" },
        { key: "updatedAt", header: "更新时间" },
        { key: "version", header: "版本" },
      ],
      fetch: fetchServicesForExport,
      fallbackSort: [{ field: "name", direction: "asc" }],
    },
    { id: "group", kind: "toggle", label: "分组", searchParam: "group" },
    { id: "new", kind: "new", label: "新建服务", to: "/t/:tenantId/services/new" },
  ],
  toolbar: {
    newItems: { keyOf: (row) => row.id },
    selection: {
      actions: [
        {
          id: "bulk-delete",
          label: "批量删除",
          danger: true,
          confirm: "批量删除",
          run: async (ctx) => {
            await ctx.bulkDelete(ctx.ids);
            ctx.clear();
          },
        },
        {
          id: "bulk-restart",
          label: (count) => `批量重启（${count}）`,
          confirm: "批量重启",
          run: (ctx) => {
            ctx.toast.info(`已提交重启请求：${ctx.ids.length} 个服务`);
          },
        },
      ],
    },
  },
  rowActions: [
    {
      id: "view",
      label: "查看",
      primary: true,
      icon: "eye",
      run: (row, ctx) => ctx.navigate(`/t/${ctx.tenantId ?? ""}/services/${row.id}`),
    },
    {
      id: "edit",
      label: "编辑",
      primary: true,
      icon: "pencil",
      run: (row, ctx) => ctx.navigate(`/t/${ctx.tenantId ?? ""}/services/${row.id}/edit`),
    },
    {
      id: "mark-running",
      label: "标记为 running",
      run: (row, ctx) => ctx.update(row.id, { status: "running", version: String(row.version) }),
    },
    {
      id: "copy-id",
      label: "复制 ID",
      separatorBefore: true,
      run: (row, ctx) => {
        void navigator.clipboard?.writeText(row.id);
        ctx.toast.success("ID 已复制");
      },
    },
    {
      id: "delete",
      label: "删除（可撤销）",
      danger: true,
      separatorBefore: true,
      run: (row, ctx) => ctx.deleteRow(row.id),
    },
  ],
  table: {
    stickyFirst: true,
    stickyLast: true,
    preferencesKey: "services",
    mobile: "cards",
    grouping: {
      searchParam: "group",
      columns: ["env"],
      labelFor: (_colId, value) => `环境：${String(value ?? "—")}`,
      aggregates: [{ field: "replicas", fn: "sum" }],
    },
  },
  list: {
    searchFields: ["name", "id"],
    sort: { initial: [{ field: "name", direction: "asc" }], multi: true },
    savedViewsKey: "services",
    staleTime: 15_000,
    slashFocusSearch: true,
  },
  empty: { title: "还没有服务", description: "创建第一个服务后它会出现在这里。" },
  mutations: { update: { optimistic: true, successToast: "已更新（乐观变更）" } },
});
