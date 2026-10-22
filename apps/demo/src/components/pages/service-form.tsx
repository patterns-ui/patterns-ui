/**
 * services 表单页渲染出口（M7-A3 批1）：pages/services-form.page.ts 的两个 spec
 *（edit/new）共用本视图——FormPage 宿主 + useResourceForm + typed-form-field 接线。
 * 结构与文案在 spec；diff 摘要与 409 演示按 spec 开关（edit 专属）。
 */
import { useResourceForm } from "@patterns-ui/core/form";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FormPage } from "@/components/blocks/form/form-page/form-page";
import {
  FormMessage,
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { DiffViewer } from "@/components/blocks/show/diff-viewer/diff-viewer";
import {
  DirtyGuardHost,
  DraftRestoredBanner,
  useFormDraftAutosave,
} from "@/components/form-page-guards";
import {
  SERVICE_FORM_DEFAULTS,
  ServiceAdvancedFields,
  ServiceBasicsFields,
  type ServiceFormValues,
  ServiceSpecFields,
  serviceFormSchema,
  servicePayload,
} from "@/components/service-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { servicesResource } from "@/resources";

/** 表单页配置（pages/services-form.page.ts 产出；0 JSX） */
export interface ServiceFormSpec {
  mode: "edit" | "new";
  title: string;
  description: string;
  /** 返回链（:tenantId/:id 模板） */
  backTo: string;
  backLabel?: string;
  submitLabel: string;
  pendingLabel: string;
  /** 分区（id 对应字段组渲染器：basics/spec/advanced） */
  sections: readonly { id: "basics" | "spec" | "advanced"; title: string; description: string }[];
  /** 创建成功 toast（new 专属） */
  createdToast?: (name: string) => string;
  /** 变更摘要 aside（edit 专属） */
  diffAside?: boolean;
  /** 409 演示按钮（edit 专属） */
  conflictDemo?: boolean;
}

/** 分区 id → 字段组渲染器（typed-form-field 的 AppField 组合件） */
function ServiceSectionFields({
  id,
  form,
}: {
  id: ServiceFormSpec["sections"][number]["id"];
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例松类型传递（与 demo 字段组组件一致）
  form: any;
}) {
  switch (id) {
    case "basics":
      return <ServiceBasicsFields form={form} />;
    case "spec":
      return <ServiceSpecFields form={form} />;
    case "advanced":
      return <ServiceAdvancedFields form={form} />;
  }
}

export function ServiceFormView({ spec }: { spec: ServiceFormSpec }) {
  const params = useParams({ strict: false }) as { tenantId: string; id?: string };
  const navigate = useNavigate();
  const [conflictArmed, setConflictArmed] = useState(false);

  const resourceForm = useResourceForm<ServiceFormValues>({
    resource: servicesResource as never,
    ...(spec.mode === "edit" && params.id !== undefined ? { id: params.id } : {}),
    schema: serviceFormSchema as never,
    defaultValues: SERVICE_FORM_DEFAULTS,
    autosave: { debounceMs: 800 },
    redirect: spec.mode === "edit" ? "stay" : "list",
  });

  const initialValues = resourceForm.initialValues;

  const form = useAppForm({
    defaultValues:
      spec.mode === "edit"
        ? (initialValues as ServiceFormValues)
        : ((resourceForm.initialValues ?? SERVICE_FORM_DEFAULTS) as ServiceFormValues),
    validators: { onChange: serviceFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await resourceForm.onSubmit(servicePayload(value) as never);
      if (result.ok) {
        if (spec.mode === "edit") {
          toast.success("已保存（版本 +1）");
          setConflictArmed(false);
          await navigate({
            to: "/t/$tenantId/services/$id",
            params: { tenantId: params.tenantId, id: params.id ?? "" },
            search: true,
          });
        } else {
          toast.success(spec.createdToast?.(result.data.name) ?? "已创建");
        }
        return;
      }
      // 服务端 422 字段错误 / 409 → 回填字段 + 表单级错误（v1.33 setErrorMap 事实形态）
      formApi.setErrorMap({
        onSubmit: { fields: result.fieldErrors, form: result.formError },
      });
    },
  });

  useFormDraftAutosave(form, (values) =>
    resourceForm.saveDraft(values as Partial<ServiceFormValues>),
  );

  /** 409 演示：背后用正确版本改一次（服务端版本 +1），不失效本页缓存 → 表单再提交必然 409 */
  const armConflict = async () => {
    const current = initialValues as (ServiceFormValues & { version?: number }) | undefined;
    if (current?.version === undefined || params.id === undefined) return;
    await servicesResource.client.update?.(
      params.id,
      { name: current.name },
      { version: String(current.version) },
    );
    setConflictArmed(true);
    toast.warning("已模拟他人保存新版本。现在提交表单将提示版本冲突。");
  };

  const resolveBack = () =>
    spec.backTo.replace(":tenantId", params.tenantId).replace(":id", params.id ?? "");

  if (spec.mode === "edit" && initialValues === undefined) {
    return (
      <FormPage title={spec.title} backTo={{ to: resolveBack() }} className="max-w-4xl">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </FormPage>
    );
  }

  return (
    <form.AppForm>
      <FormPage
        onSubmit={() => void form.handleSubmit()}
        title={spec.title}
        description={spec.description}
        backTo={{ to: resolveBack(), label: spec.backLabel }}
        actions={<DirtyGuardHost form={form} />}
        sections={spec.sections.map((section, i) => ({
          title: section.title,
          description: section.description,
          children: <ServiceSectionFields id={section.id} form={form} />,
          aside:
            spec.diffAside && i === 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium">变更摘要</p>
                <DiffViewer before={initialValues} after={form.store.state.values} mode="json" />
                {conflictArmed ? (
                  <p className="text-status-warning text-xs">
                    ⚠ 已有他人保存了新版本，提交前需要先解决冲突。
                  </p>
                ) : null}
              </div>
            ) : undefined,
        }))}
        footer={
          <>
            {spec.conflictDemo ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={conflictArmed}
                onClick={() => void armConflict()}
              >
                模拟他人抢先保存
              </Button>
            ) : null}
            <FormMessage />
            <SubmitButton label={spec.submitLabel} pendingLabel={spec.pendingLabel} />
          </>
        }
      >
        <div className="mt-4">
          <DraftRestoredBanner
            restored={resourceForm.draftRestored}
            onDiscard={() => {
              resourceForm.discardDraft();
              form.reset(
                spec.mode === "edit" ? (initialValues as ServiceFormValues) : SERVICE_FORM_DEFAULTS,
              );
              toast.info(
                spec.mode === "edit" ? "已丢弃草稿，恢复为服务端版本" : "已丢弃草稿，恢复默认值",
              );
            }}
          />
        </div>
      </FormPage>
    </form.AppForm>
  );
}
