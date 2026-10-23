/**
 * certificates 列表路由（薄胶水）：配置在 pages/certificates.page.ts，组装在
 * ResourceListView 视图工厂；本文件只留路由声明 + def 生成的 search schema。
 */
import { resourceListRouteOptions } from "@patterns-ui/core/resource";
import { createFileRoute } from "@tanstack/react-router";
import { ResourceListView } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { certificatesListSpec } from "@/pages/certificates.page";

export const Route = createFileRoute("/_shell/t/$tenantId/certificates")({
  staticData: { title: "Certificates" },
  validateSearch: resourceListRouteOptions(certificatesListSpec.def).validateSearch,
  component: CertificatesRoute,
});

function CertificatesRoute() {
  return <ResourceListView spec={certificatesListSpec} />;
}
