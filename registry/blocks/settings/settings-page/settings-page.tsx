/**
 * settings-page —— sections[] 驱动的 SaaS 设置壳（docs/blocks.md team/settings；M7-A2 节化）。
 *
 * 每节 { id, label, description?, icon?, content }：content 为预置节构件
 * （org/profile/security/sessions/appearance——M6 内置节的登记名）或扩展挂载位
 * （node：计费/集成等宿主节）。sections 缺省 = 内置五节（组织[有 org 时]/个人/安全/会话/外观），
 * 行为与节化前一致。个人/安全节为 typed-form-field 表单（zod 校验 + 服务端错误位）；
 * 时区/主题直连 core datetime/theme 偏好（localStorage，不进 URL）。
 */
import { type ThemeMode, useTheme } from "@patterns-ui/core/theme";
import { cn } from "cn";
import { Building2, KeyRound, LogOut, Palette, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  FormMessage,
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import { UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";
import { InlineEditField } from "@/components/blocks/show/inline-edit-field/inline-edit-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SettingsOrg {
  name: string;
  avatarUrl?: string;
  plan?: string;
}

export interface SettingsProfileInput {
  displayName: string;
  email: string;
  timeZone?: string;
}

/** 预置节构件登记名（M7-A2 节化：内置节的封闭集合，只追加） */
export type SettingsSectionPreset = "org" | "profile" | "security" | "sessions" | "appearance";

/** 节内容型别：预置构件（消费同名 props 数据/回调）或扩展挂载位（宿主 ReactNode） */
export type SettingsSectionContent = { preset: SettingsSectionPreset } | { node: React.ReactNode };

/** 图标名表（封闭，只追加）：definePage settings 配置的 icon 字符串名 → lucide 组件 */
const SECTION_ICONS = {
  "building-2": Building2,
  "user-cog": UserCog,
  "key-round": KeyRound,
  palette: Palette,
} as const;

export type SettingsSectionIconName = keyof typeof SECTION_ICONS;

/** 设置节声明（sections[] 驱动；可扩展——计费/集成等扩展节可挂载；icon 兼容词表名） */
export interface SettingsSectionSpec {
  id: string;
  label: string;
  description?: string;
  /** 图标：ReactNode 或词表名（definePage 配置的数据形态） */
  icon?: React.ReactNode | SettingsSectionIconName;
  content: SettingsSectionContent;
}

export interface SettingsPageProps {
  /**
   * sections[] 驱动（M7-A2 节化）；缺省 = 内置五节（组织[有 org 时]/个人/安全/会话/外观）
   * 保持节化前行为。预置节的数据与回调仍来自下方 props。
   */
  sections?: SettingsSectionSpec[];
  org?: SettingsOrg;
  onSaveOrgName?(name: string): Promise<void>;
  profile: SettingsProfileInput;
  onSaveProfile?(
    input: SettingsProfileInput,
  ): Promise<
    { ok: true } | { ok: false; fieldErrors?: Record<string, string>; formError?: string }
  >;
  onChangePassword?(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<
    { ok: true } | { ok: false; formError?: string; fieldErrors?: Record<string, string> }
  >;
  /** 主题 preset 列表 */
  presets: { id: string; label: string }[];
  /** 会话区：登出全部回调（占位实现由宿主给） */
  onSignOutAllSessions?(): Promise<void>;
  className?: string;
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
  { value: "system", label: "跟随系统" },
];

/** Intl.supportedValuesOf('timeZone')（ES2022+；类型未覆盖，运行时特性检测） */
function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? [];
}

/** 缺省 sections：内置五节（M6 行为原样保留——组织节仅有 org 时出现） */
export function defaultSettingsSections(org: SettingsOrg | undefined): SettingsSectionSpec[] {
  return [
    ...(org
      ? [
          {
            id: "org",
            label: "组织",
            description: "租户名称与标识。",
            icon: <Building2 className="size-4" />,
            content: { preset: "org" } as SettingsSectionContent,
          },
        ]
      : []),
    {
      id: "profile",
      label: "个人",
      description: "显示名、邮箱与时区。",
      icon: <UserCog className="size-4" />,
      content: { preset: "profile" },
    },
    {
      id: "security",
      label: "安全",
      description: "修改登录密码。",
      icon: <KeyRound className="size-4" />,
      content: { preset: "security" },
    },
    {
      id: "sessions",
      label: "会话",
      description: "活跃会话管理（占位）",
      content: { preset: "sessions" },
    },
    {
      id: "appearance",
      label: "外观",
      description: "主题与样式预设，即时生效。",
      icon: <Palette className="size-4" />,
      content: { preset: "appearance" },
    },
  ];
}

/** 节图标解析：词表名 → lucide 组件节点；ReactNode 原样 */
function sectionIconOf(icon: SettingsSectionSpec["icon"]): React.ReactNode {
  if (typeof icon !== "string") return icon;
  const Icon = SECTION_ICONS[icon as SettingsSectionIconName];
  return Icon ? <Icon className="size-4" /> : undefined;
}

/** 未知预置节登记名的报错（报错即目录） */
function presetContent(preset: string, props: SettingsPageProps): React.ReactNode {
  switch (preset) {
    case "org":
      return <OrgSectionBody org={props.org} onSaveOrgName={props.onSaveOrgName} />;
    case "profile":
      return <ProfileSectionBody profile={props.profile} onSave={props.onSaveProfile} />;
    case "security":
      return <SecuritySectionBody onChangePassword={props.onChangePassword} />;
    case "sessions":
      return <SessionsSectionBody onSignOutAllSessions={props.onSignOutAllSessions} />;
    case "appearance":
      return <AppearanceSectionBody presets={props.presets} />;
    default:
      throw new Error(
        `settings-page: 未知预置节「${preset}」；合法值：[org, profile, security, sessions, appearance]（预置节集合只追加，见 blocks.md settings）`,
      );
  }
}

export function SettingsPage({
  sections,
  org,
  onSaveOrgName,
  profile,
  onSaveProfile,
  onChangePassword,
  presets,
  onSignOutAllSessions,
  className,
}: SettingsPageProps) {
  // org 预置节与缺省 sections 同规则：org 数据未就绪/缺失时隐藏（数据可选节）
  const declared = sections?.filter(
    (spec) => !("preset" in spec.content && spec.content.preset === "org" && org === undefined),
  );
  const specs = declared ?? defaultSettingsSections(org);
  return (
    <div
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8", className)}
      data-slot="settings-page"
    >
      <PageHeader
        title="Settings"
        description="组织、个人、安全与外观偏好；偏好类设置存于本机（localStorage），不进 URL。"
      />

      {specs.map((spec) => (
        <SettingsSection
          key={spec.id}
          icon={sectionIconOf(spec.icon)}
          title={spec.label}
          description={spec.description}
        >
          {"preset" in spec.content
            ? presetContent(spec.content.preset, {
                org,
                onSaveOrgName,
                profile,
                onSaveProfile,
                onChangePassword,
                presets,
                onSignOutAllSessions,
              })
            : spec.content.node}
        </SettingsSection>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 分节容器
// ---------------------------------------------------------------------------

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border">
      <header className="flex items-center gap-2 border-b px-5 py-3.5">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
            {description}
          </span>
        ) : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 组织节（name/avatar inline-edit）
// ---------------------------------------------------------------------------

function OrgSectionBody({
  org,
  onSaveOrgName,
}: {
  org?: SettingsOrg;
  onSaveOrgName?(name: string): Promise<void>;
}) {
  if (!org) {
    return <p className="text-muted-foreground text-[13px]">组织信息不可用（org 未提供）。</p>;
  }
  return (
    <div className="flex items-center gap-4">
      <UserAvatar user={{ name: org.name, avatarUrl: org.avatarUrl }} size="lg" />
      <div className="flex-1">
        <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
          组织名称
        </p>
        <InlineEditField
          value={org.name}
          onSave={async (next) => {
            await onSaveOrgName?.(next);
          }}
        />
      </div>
      {org.plan ? <Badge variant="secondary">{org.plan}</Badge> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 个人节（display name / email / 时区）
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  displayName: z.string().min(2, "显示名至少 2 个字符"),
  email: z.email("请输入有效邮箱"),
  timeZone: z.string(),
});

function ProfileSectionBody({
  profile,
  onSave,
}: {
  profile: SettingsProfileInput;
  onSave?: (
    input: SettingsProfileInput,
  ) => Promise<
    { ok: true } | { ok: false; fieldErrors?: Record<string, string>; formError?: string }
  >;
}) {
  const zones = useMemo(timeZones, []);
  // 时区偏好读 core datetime（独立于 profile 字段提交；也随表单一并保存）
  const form = useAppForm({
    defaultValues: {
      displayName: profile.displayName,
      email: profile.email,
      timeZone: profile.timeZone ?? "",
    },
    validators: { onChange: profileSchema },
    onSubmit: async ({ value, formApi }) => {
      if (!onSave) return;
      const result = await onSave(value);
      if (result.ok) {
        toast.success("个人设置已保存");
      } else {
        formApi.setErrorMap({
          onSubmit: { fields: result.fieldErrors ?? {}, form: result.formError },
        });
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <div className="grid gap-4">
          <form.AppField name="displayName">
            {(field) => <field.TextWidget label="显示名" required />}
          </form.AppField>
          <form.AppField name="email">
            {(field) => <field.TextWidget label="邮箱" required />}
          </form.AppField>
          <form.AppField name="timeZone">
            {(field) => (
              <field.SelectWidget
                label="时区"
                description="影响全站时间显示（Intl 时区解析）。"
                options={[
                  { value: "", label: "系统时区" },
                  ...zones.map((zone) => ({ value: zone, label: zone })),
                ]}
              />
            )}
          </form.AppField>
          <FormMessage />
          <div className="flex justify-end">
            <SubmitButton label="保存个人设置" />
          </div>
        </div>
      </form.AppForm>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 安全节（改密码）
// ---------------------------------------------------------------------------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少 8 位"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

function SecuritySectionBody({
  onChangePassword,
}: {
  onChangePassword?: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<
    { ok: true } | { ok: false; formError?: string; fieldErrors?: Record<string, string> }
  >;
}) {
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onChange: passwordSchema },
    onSubmit: async ({ value, formApi }) => {
      if (!onChangePassword) return;
      const result = await onChangePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      if (result.ok) {
        toast.success("密码已更新");
        formApi.reset();
      } else {
        formApi.setErrorMap({
          onSubmit: { fields: result.fieldErrors ?? {}, form: result.formError },
        });
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <div className="grid max-w-md gap-4">
          <form.AppField name="currentPassword">
            {(field) => <field.SecretWidget label="当前密码" required />}
          </form.AppField>
          <form.AppField name="newPassword">
            {(field) => <field.SecretWidget label="新密码" required />}
          </form.AppField>
          <form.AppField name="confirmPassword">
            {(field) => <field.SecretWidget label="确认新密码" required />}
          </form.AppField>
          <FormMessage />
          <div className="flex justify-end">
            <SubmitButton label="更新密码" />
          </div>
        </div>
      </form.AppForm>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 会话节（占位登出全部）
// ---------------------------------------------------------------------------

function SessionsSectionBody({
  onSignOutAllSessions,
}: {
  onSignOutAllSessions?: () => Promise<void>;
}) {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-[13px]">
        当前设备保持登录；可强制登出全部会话（含其它浏览器）。
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={signingOut || onSignOutAllSessions === undefined}
        onClick={async () => {
          setSigningOut(true);
          try {
            await onSignOutAllSessions?.();
            toast.success("已登出全部会话");
          } finally {
            setSigningOut(false);
          }
        }}
      >
        <LogOut data-icon="inline-start" />
        登出全部会话
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 外观节（theme + preset；core theme 偏好直连）
// ---------------------------------------------------------------------------

function AppearanceSectionBody({ presets }: { presets: { id: string; label: string }[] }) {
  const { theme, setTheme, preset, setPreset } = useTheme();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">主题</span>
        <Select value={theme} onValueChange={(v) => v !== null && setTheme(v as ThemeMode)}>
          <SelectTrigger className="w-full" aria-label="主题">
            <SelectValue>
              {THEME_OPTIONS.find((o) => o.value === theme)?.label ?? theme}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {THEME_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <span className="text-[13px] font-medium">样式预设</span>
        <Select value={preset} onValueChange={(v) => v !== null && setPreset(v)}>
          <SelectTrigger className="w-full" aria-label="样式预设">
            <SelectValue>{presets.find((o) => o.id === preset)?.label ?? preset}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {presets.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
