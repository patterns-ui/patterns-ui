/**
 * certificates 列表页配置：def（page 协议只读列表）+ ResourceListView 声明化 spec
 * —— 纯配置（0 JSX）。
 *
 * 元模式决策（三层决策树第二层：未命中业务模式目录 → 元模式组合 + resource-list 原型）：
 *  - 分页协议 = page（证书总量小且稳定增长，非 append 流；页码窗口可跳页、
 *    mock 有 total——与 services 同协议，区别于 audit 的 keyset 追溯流）；
 *  - 只读：无行/批量/头 CRUD 动作（证书由平台自动签发与轮换）；
 *  - 初始排序 expiresAt asc（最紧急到期在前——expiring/expired 优先暴露）；
 *  - 过滤器 3 个：状态（multi-select）/ 签发机构（select）/ 到期时间（date-range）。
 * 取材：services-list.page.ts（page 协议组合，去 CRUD 声明）。
 */

import { defineResource } from "@patterns-ui/core/resource";
import { defineResourceListPage } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { certificatesResource } from "@/resources";

/** 证书状态 → StatusBadge tone（cell-status 可注入 map；色全部走 --status-* 令牌） */
const CERT_STATUS_TONE = {
  active: "success",
  expiring: "warning",
  expired: "danger",
  revoked: "neutral",
} as const;

const CERT_ISSUER_OPTIONS = [
  { value: "lets-encrypt", label: "lets-encrypt" },
  { value: "digicert", label: "digicert" },
  { value: "internal-ca", label: "internal-ca" },
];

/**
 * certificates def：list 配置单源（page 协议 ?page=&size=，可跳页、有 total）。
 * TData 经 client 上下文推断（配置文件禁显式泛型实参——paradigm §3.3 验收命令）。
 */
export const certificatesDef = defineResource({
  name: "certificates",
  client: certificatesResource.client,
  columns: [
    {
      accessorKey: "id",
      header: "ID",
      meta: { cell: "id", cellOptions: { chars: 11 } },
    },
    { accessorKey: "name", header: "名称" },
    { accessorKey: "issuer", header: "签发机构" },
    {
      accessorKey: "status",
      header: "状态",
      meta: { cell: "status", cellOptions: { map: CERT_STATUS_TONE } },
    },
    { accessorKey: "issuedAt", header: "签发时间", meta: { cell: "time" } },
    { accessorKey: "expiresAt", header: "到期时间", meta: { cell: "time" } },
  ],
  filters: [
    {
      field: "status",
      label: "状态",
      kind: "multi-select",
      options: [
        { value: "active", label: "active" },
        { value: "expiring", label: "expiring" },
        { value: "expired", label: "expired" },
        { value: "revoked", label: "revoked" },
      ],
    },
    { field: "issuer", label: "签发机构", kind: "select", options: CERT_ISSUER_OPTIONS },
    { field: "expiresAt", label: "到期时间", kind: "date-range" },
  ],
  list: { pagination: { mode: "page" }, pageSize: 10 },
});

export const certificatesListSpec = defineResourceListPage({
  def: certificatesDef,
  description: "租户内 TLS 证书与到期情况（平台代管，只读）。",
  table: {
    preferencesKey: "certificates",
    mobile: "cards",
  },
  list: {
    searchFields: ["name", "id"],
    sort: { initial: [{ field: "expiresAt", direction: "asc" }] },
    slashFocusSearch: true,
  },
  empty: { title: "还没有证书", description: "证书由平台自动签发与轮换，无需手动创建。" },
});
