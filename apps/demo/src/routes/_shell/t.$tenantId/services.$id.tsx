/**
 * services 详情路由（M7-A3 批1 薄胶水）：结构在 pages/services-detail.page.ts，
 * 装配走 ResourceDetailView；本文件留路由声明 + 运行时接线（inlineSave 保存适配器）
 * + 子路由（edit）挂载判定。tab 深链 schema 不变（?tab=）。
 */
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { ResourceDetailView } from "@/components/blocks/show/resource-detail-view/resource-detail-view";
import { servicesDetailSpec } from "@/pages/services-detail.page";
import { servicesResource } from "@/resources";

const searchSchema = z.object({
  tab: z.string().optional().catch(undefined),
});

function ServiceDetailPage() {
  const { id } = Route.useParams();
  // 子路由（edit）激活时本路由只作为布局：不重复渲染详情 UI
  const childActive = useRouterState({
    select: (s) => (s.matches.at(-1)?.routeId ?? "") !== Route.id,
  });

  // inline-edit 保存适配器（宿主注入：useUpdate + 版本乐观并发 + 成功提示）
  const updateService = servicesResource.useUpdate({
    onSuccess: () => toast.success("已保存（版本 +1）"),
  });

  if (childActive) return <Outlet />;

  return (
    <ResourceDetailView
      {...servicesDetailSpec}
      id={id}
      inlineSave={async (field, value, row) => {
        await updateService.mutateAsync({
          id: row.id,
          version: String(row.version),
          [field]: field === "replicas" ? Number(value) : value,
        } as never);
      }}
    />
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/services/$id")({
  staticData: { title: "服务详情" },
  validateSearch: searchSchema,
  component: ServiceDetailPage,
});
