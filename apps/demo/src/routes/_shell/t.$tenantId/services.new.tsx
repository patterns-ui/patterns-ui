import { useResourceForm } from "@fleetly/ui-component-core/form";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { FormPage } from "@/components/blocks/form/form-page/form-page";
import {
  FormMessage,
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
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
import { servicesResource } from "@/resources";

function NewServicePage() {
  const { tenantId } = Route.useParams();

  const resourceForm = useResourceForm<ServiceFormValues>({
    resource: servicesResource as never,
    schema: serviceFormSchema as never,
    defaultValues: SERVICE_FORM_DEFAULTS,
    autosave: { debounceMs: 800 },
    redirect: "list",
  });

  const form = useAppForm({
    // 动态 defaultValues：草稿在 mount 后读出合并进 initialValues，FormApi.update 会自动同步
    // （isTouched 后不再覆盖 —— 用户输入永远优先）
    defaultValues: (resourceForm.initialValues ?? SERVICE_FORM_DEFAULTS) as ServiceFormValues,
    validators: { onChange: serviceFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await resourceForm.onSubmit(servicePayload(value) as never);
      if (result.ok) {
        toast.success(`服务 ${result.data.name} 已创建`);
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

  return (
    <form.AppForm>
      <FormPage
        onSubmit={() => void form.handleSubmit()}
        title="新建服务"
        description="分区表单（typed-form-field 全 widget 覆盖）：基本信息 / 副本与规格 / 高级。提交后回到列表；草稿自动保存于本地。"
        backTo={{ to: `/t/${tenantId}/services`, label: "Services" }}
        actions={<DirtyGuardHost form={form} />}
        sections={[
          {
            title: "基本信息",
            description: "名称与环境必填；负责人经关联选择（支持就地新建）。",
            children: <ServiceBasicsFields form={form} />,
          },
          {
            title: "副本与规格",
            description: "运行规格与区域。",
            children: <ServiceSpecFields form={form} />,
          },
          {
            title: "高级",
            description: "标签 / 环境变量 / JSON 配置 / 附件（演示 widget 覆盖）。",
            children: <ServiceAdvancedFields form={form} />,
          },
        ]}
        footer={
          <>
            <span className="text-muted-foreground mr-auto text-xs">
              提示：名称含「taken」提交可触发服务端独有校验的 422 字段错误回填（如 demo-taken）。
            </span>
            <FormMessage />
            <SubmitButton label="创建服务" pendingLabel="创建中…" />
          </>
        }
      >
        <div className="mt-4">
          <DraftRestoredBanner
            restored={resourceForm.draftRestored}
            onDiscard={() => {
              resourceForm.discardDraft();
              form.reset(SERVICE_FORM_DEFAULTS);
              toast.info("已丢弃草稿，恢复默认值");
            }}
          />
        </div>
      </FormPage>
    </form.AppForm>
  );
}

const searchSchema = z.object({}).catch({});

export const Route = createFileRoute("/_shell/t/$tenantId/services/new")({
  staticData: { title: "新建服务" },
  validateSearch: searchSchema,
  component: NewServicePage,
});
