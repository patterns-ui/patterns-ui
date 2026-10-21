import type { CrumbResolve } from "@fleetly/ui-component-core/router";
import { useCrumbs } from "@fleetly/ui-component-core/router";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * 面包屑（core useCrumbs 派生）：staticData.title 优先，租户段经 resolve.tenant 反查名称。
 * 末段渲染为当前页；移动端只显示末段。
 */
export function Breadcrumbs({ resolve }: { resolve?: CrumbResolve }) {
  const crumbs = useCrumbs(resolve);
  if (crumbs.length === 0) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.to ?? crumb.label}-${index}`}>
              <BreadcrumbItem className={last ? "" : "hidden sm:inline-flex"}>
                {last || !crumb.to ? (
                  <BreadcrumbPage className="text-foreground">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.to} />}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last ? <BreadcrumbSeparator className="hidden sm:block" /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
