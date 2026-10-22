import { useResourceForm } from "@fleetly/patterns-ui-core/form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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

function EditServicePage() {
  const { tenantId, id } = Route.useParams();
  const navigate = useNavigate();
  const [conflictArmed, setConflictArmed] = useState(false);

  const resourceForm = useResourceForm<ServiceFormValues>({
    resource: servicesResource as never,
    id,
    schema: serviceFormSchema as never,
    defaultValues: SERVICE_FORM_DEFAULTS,
    autosave: { debounceMs: 800 },
    redirect: "stay",
  });

  const initialValues = resourceForm.initialValues;

  const form = useAppForm({
    defaultValues: initialValues as ServiceFormValues,
    validators: { onChange: serviceFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await resourceForm.onSubmit(servicePayload(value) as never);
      if (result.ok) {
        toast.success("已保存（版本 +1）");
        setConflictArmed(false);
        await navigate({
          to: "/t/$tenantId/services/$id",
          params: { tenantId, id },
          search: true,
        });
        return;
      }
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
    if (current?.version === undefined) return;
    await servicesResource.client.update?.(
      id,
      { name: current.name },
      { version: String(current.version) },
    );
    setConflictArmed(true);
    toast.warning("已模拟他人保存新版本。现在提交表单将提示版本冲突。");
  };

  if (initialValues === undefined) {
    return (
      <FormPage
        title="编辑服务"
        backTo={{ to: `/t/${tenantId}/services/${id}` }}
        className="max-w-4xl"
      >
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
        title="编辑服务"
        description="修改服务的基本信息、规格与高级配置。"
        backTo={{ to: `/t/${tenantId}/services/${id}` }}
        actions={<DirtyGuardHost form={form} />}
        sections={[
          {
            title: "基本信息",
            description: "名称 / 环境 / 负责人。",
            children: <ServiceBasicsFields form={form} />,
            aside: (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium">变更摘要</p>
                <DiffViewer before={initialValues} after={form.store.state.values} mode="json" />
                {conflictArmed ? (
                  <p className="text-status-warning text-xs">
                    ⚠ 已有他人保存了新版本，提交前需要先解决冲突。
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            title: "副本与规格",
            description: "副本 / 区域 / 维护窗口。",
            children: <ServiceSpecFields form={form} />,
          },
          {
            title: "高级",
            description: "标签 / 环境变量 / JSON 配置 / 附件。",
            children: <ServiceAdvancedFields form={form} />,
          },
        ]}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={conflictArmed}
              onClick={() => void armConflict()}
            >
              模拟他人抢先保存
            </Button>
            <FormMessage />
            <SubmitButton label="保存修改" pendingLabel="保存中…" />
          </>
        }
      >
        <div className="mt-4">
          <DraftRestoredBanner
            restored={resourceForm.draftRestored}
            onDiscard={() => {
              resourceForm.discardDraft();
              form.reset(initialValues as ServiceFormValues);
              toast.info("已丢弃草稿，恢复为服务端版本");
            }}
          />
        </div>
      </FormPage>
    </form.AppForm>
  );
}

const searchSchema = z.object({}).catch({});

export const Route = createFileRoute("/_shell/t/$tenantId/services/$id/edit")({
  staticData: { title: "编辑服务" },
  validateSearch: searchSchema,
  component: EditServicePage,
});
