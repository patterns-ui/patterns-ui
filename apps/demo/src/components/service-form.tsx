/**
 * demo：service 创建/编辑共用表单定义（typed-form-field widget 全家 + reference-select owner）。
 * services.new 与 services.$id.edit 共用；分区由 form-page 承载。
 */
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FormDialog } from "@/components/blocks/form/form-dialog/form-dialog";
import { ReferenceSelect } from "@/components/blocks/form/reference-select/reference-select";
import {
  collectFieldErrors,
  FieldShell,
  useFieldContext,
} from "@/components/blocks/form/typed-form-field/contexts";
import type {
  DateRangeValue,
  KvPair,
  UploadedFile,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usersResource } from "@/resources";

// ---------------------------------------------------------------------------
// schema 与默认值
// ---------------------------------------------------------------------------

export const serviceFormSchema = z.object({
  name: z.string().trim().min(3, "名称至少 3 个字符"),
  env: z.enum(["rep", "staging", "prod"], { message: "选择环境" }),
  owner: z.string().min(1, "请选择负责人"),
  replicas: z
    .number("副本数必须是数字")
    .int("副本数必须是整数")
    .min(1, "至少 1 个副本")
    .max(50, "最多 50 个副本"),
  region: z.string().min(1, "选择区域"),
  tags: z.array(z.string().min(1)).max(8, "最多 8 个标签"),
  envVars: z.array(z.object({ key: z.string().min(1, "键不能为空"), value: z.string() })),
  config: z.string().refine((v) => {
    if (v.trim() === "") return true;
    try {
      JSON.parse(v);
      return true;
    } catch {
      return false;
    }
  }, "必须是合法 JSON"),
  /** 仅展示 widget 覆盖（不提交） */
  _attachments: z.array(z.any()),
  _maintenanceWindow: z.object({ from: z.string().optional(), to: z.string().optional() }),
});

export type ServiceFormValues = z.output<typeof serviceFormSchema>;

export const SERVICE_FORM_DEFAULTS: ServiceFormValues = {
  name: "",
  env: "rep",
  owner: "usr_demo",
  replicas: 2,
  region: "cn-beijing",
  tags: [],
  envVars: [{ key: "LOG_LEVEL", value: "info" }],
  config: '{\n  "timeoutMs": 30000\n}',
  _attachments: [],
  _maintenanceWindow: {},
};

export const ENV_OPTIONS = [
  { value: "rep", label: "rep（预发）" },
  { value: "staging", label: "staging（测试）" },
  { value: "prod", label: "prod（生产）" },
];

export const REGION_OPTIONS = [
  "cn-beijing",
  "cn-shanghai",
  "cn-hangzhou",
  "ap-southeast-1",
  "us-west-2",
].map((value) => ({ value, label: value }));

/** 表单值 → create/update payload（隐藏展示位以下划线开头，不提交） */
export function servicePayload(values: ServiceFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: values.name.trim(),
    env: values.env,
    owner: values.owner,
    replicas: values.replicas,
    region: values.region,
  };
  if (values.tags.length > 0) payload.tags = values.tags;
  if (values.envVars.length > 0) {
    payload.envVars = Object.fromEntries(
      values.envVars.filter((row) => row.key !== "").map((row) => [row.key, row.value]),
    );
  }
  if (values.config.trim() !== "") payload.config = values.config.trim();
  return payload;
}

// ---------------------------------------------------------------------------
// owner 字段：reference-select（搜索 + 分页 + 就地新建回选）
// ---------------------------------------------------------------------------

export function OwnerSelectWidget(props: {
  label?: string;
  description?: string;
  required?: boolean;
}) {
  const field = useFieldContext<string>();
  const errors = collectFieldErrors(field.state.meta);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const createUser = usersResource.useCreate();

  return (
    <>
      <FieldShell
        label={props.label}
        description={props.description}
        required={props.required}
        errors={errors}
      >
        <ReferenceSelect
          resource={usersResource}
          value={field.state.value}
          onChange={(v) => field.handleChange(Array.isArray(v) ? (v[0] ?? "") : v)}
          getIdLabel={(row) => row.name}
          placeholder="搜索并选择负责人"
          allowCreate={{
            render: () => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setCreating(true)}
              >
                新建成员…
              </Button>
            ),
          }}
        />
      </FieldShell>
      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="新建成员"
        description="创建后自动选为该服务的负责人。"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={newName.trim().length < 2 || createUser.isPending}
              onClick={async () => {
                try {
                  const created = await createUser.mutateAsync({ name: newName.trim() });
                  setCreating(false);
                  setNewName("");
                  field.handleChange(created.id);
                  toast.success(`已创建成员 ${created.name} 并回选`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "创建失败");
                }
              }}
            >
              创建并回选
            </Button>
          </>
        }
      >
        <FieldShell
          label="成员名称"
          required
          errors={newName.trim().length < 2 && newName !== "" ? ["名称至少 2 个字符"] : []}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="如：Wei Zhang"
          />
        </FieldShell>
      </FormDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// 表单字段树（new/edit 页共用；form 由页面经 useAppForm 创建）
// ---------------------------------------------------------------------------

export interface ServiceFormTreeProps {
  /** useAppForm 返回的表单实例（松类型：AppField children 为 render prop） */
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例跨 block 松类型传递
  form: any;
}

/**
 * AppField children render prop 的字段参数：字段 API 与 widget 组件表的合并体。
 * TanStack Form 的字段泛型按值类型逐字段实例化，跨字段共享字段树时无法给出统一具体类型。
 */
// biome-ignore lint/suspicious/noExplicitAny: 见上——字段树共享的固有松类型点
type FieldWithWidgets = any;

/** 分区「基本信息」的字段 */
export function ServiceBasicsFields({ form }: ServiceFormTreeProps) {
  const AppField = form.AppField;
  return (
    <>
      <AppField name="name">
        {(field: FieldWithWidgets) => (
          <field.TextWidget
            label="名称"
            required
            description="3 个字符以上"
            placeholder="如 payments-gateway"
          />
        )}
      </AppField>
      <AppField name="env">
        {(field: FieldWithWidgets) => (
          <field.SelectWidget label="环境" required options={ENV_OPTIONS} />
        )}
      </AppField>
      <AppField name="owner">
        {() => <OwnerSelectWidget label="负责人" required description="搜索成员选择；或就地新建" />}
      </AppField>
    </>
  );
}

/** 分区「副本与规格」的字段 */
export function ServiceSpecFields({ form }: ServiceFormTreeProps) {
  const AppField = form.AppField;
  return (
    <>
      <AppField name="replicas">
        {(field: FieldWithWidgets) => (
          <field.NumberWidget
            label="副本数"
            required
            min={1}
            max={50}
            unit="个"
            description="1-50 的整数"
          />
        )}
      </AppField>
      <AppField name="region">
        {(field: FieldWithWidgets) => (
          <field.SelectWidget label="区域" required options={REGION_OPTIONS} />
        )}
      </AppField>
      <AppField name="_maintenanceWindow">
        {(field: FieldWithWidgets) => (
          <field.DateRangeWidget label="维护窗口" description="可选：两次巡检之间不告警的时间段" />
        )}
      </AppField>
    </>
  );
}

/** 分区「高级」的字段（tags / kv / json / upload） */
export function ServiceAdvancedFields({ form }: ServiceFormTreeProps) {
  const AppField = form.AppField;
  return (
    <>
      <AppField name="tags">
        {(field: FieldWithWidgets) => (
          <field.TagsWidget label="标签" description="回车添加；最多 8 个" max={8} />
        )}
      </AppField>
      <AppField name="envVars">
        {(field: FieldWithWidgets) => (
          <field.KvPairsWidget label="环境变量" keyPlaceholder="KEY" valuePlaceholder="value" />
        )}
      </AppField>
      <AppField name="config">
        {(field: FieldWithWidgets) => (
          <field.JsonWidget label="附加配置（JSON）" description="可选；提交前可一键格式化" />
        )}
      </AppField>
      <AppField name="_attachments">
        {(field: FieldWithWidgets) => (
          <field.UploadWidget label="附件" description="上传进度为模拟；文件仅保存在表单草稿中" />
        )}
      </AppField>
    </>
  );
}

export type { DateRangeValue, KvPair, UploadedFile };
