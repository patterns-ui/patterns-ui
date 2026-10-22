/**
 * typed-form-field 字段 widget 全家（docs/blocks.md form/typed-form-field）。
 *
 * 每个 widget 基于 useFieldContext 取字段 API，统一经 FieldShell 布局包裹 shadcn 原语。
 * 值类型约定：Text/Textarea/Select/Date/Secret → string；Number → number；
 * MultiSelect/Tags/Upload/RepeatableRows → 数组；Switch → boolean；
 * DateRange → { from?, to? }；KvPairs → { key, value }[]；Json → string（内容由 schema 校验）。
 */
import type { AnyFieldApi } from "@tanstack/react-form";
import { cn } from "cn";
import { Eye, EyeOff, FileText, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { collectFieldErrors, FieldShell, useFieldContext, useFieldControlIds } from "./contexts";

// ---------------------------------------------------------------------------
// 公共 props
// ---------------------------------------------------------------------------

export interface WidgetBaseProps {
  label?: ReactNode;
  description?: ReactNode;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// AnyFieldApi 复用 @tanstack/react-form 的官方导出（等价 FieldApi<any × 22>：widget 不感知具体表单泛型）

/** 字段态 + 错误收集（widget 内公共样板） */
function useFieldState(field: AnyFieldApi) {
  const errors = collectFieldErrors(field.state.meta);
  return { errors, invalid: errors.length > 0 };
}

// ---------------------------------------------------------------------------
// Text / Textarea / Number
// ---------------------------------------------------------------------------

export interface TextWidgetProps extends WidgetBaseProps {
  type?: "text" | "email" | "url" | "password";
  mono?: boolean;
}

export function TextWidget(props: TextWidgetProps) {
  const field = useFieldContext<string>();
  const { errors, invalid } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <Input
        id={ids?.controlId}
        type={props.type ?? "text"}
        value={field.state.value ?? ""}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ids?.describedBy}
        className={props.mono ? "font-mono text-sm" : undefined}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
    </FieldShell>
  );
}

export interface TextareaWidgetProps extends WidgetBaseProps {
  rows?: number;
  mono?: boolean;
}

export function TextareaWidget(props: TextareaWidgetProps) {
  const field = useFieldContext<string>();
  const { errors, invalid } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <Textarea
        id={ids?.controlId}
        rows={props.rows ?? 4}
        value={field.state.value ?? ""}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ids?.describedBy}
        className={props.mono ? "font-mono text-sm" : undefined}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
    </FieldShell>
  );
}

export interface NumberWidgetProps extends WidgetBaseProps {
  min?: number;
  max?: number;
  step?: number;
  /** 单位后缀 */
  unit?: string;
}

export function NumberWidget(props: NumberWidgetProps) {
  const field = useFieldContext<number>();
  const { errors, invalid } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="flex items-center gap-2">
        <Input
          id={ids?.controlId}
          type="number"
          value={field.state.value ?? ""}
          min={props.min}
          max={props.max}
          step={props.step}
          placeholder={props.placeholder}
          disabled={props.disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={ids?.describedBy}
          className="w-36"
          onBlur={field.handleBlur}
          onChange={(e) => {
            const raw = e.target.value;
            field.handleChange(raw === "" ? Number.NaN : Number(raw));
          }}
        />
        {props.unit ? <span className="text-muted-foreground text-sm">{props.unit}</span> : null}
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Select / MultiSelect
// ---------------------------------------------------------------------------

export interface SelectWidgetProps extends WidgetBaseProps {
  options: { value: string; label: string }[];
  /** 空值占位（默认「请选择」）；选择后可通过清除项回到 null */
  clearable?: boolean;
}

export function SelectWidget(props: SelectWidgetProps) {
  const field = useFieldContext<string>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <Select
        value={field.state.value ?? null}
        onValueChange={(v) => field.handleChange(v === null ? "" : (v as string))}
        disabled={props.disabled}
        items={props.options}
      >
        <SelectTrigger
          id={ids?.controlId}
          className="w-full"
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby={ids?.describedBy}
        >
          <SelectValue placeholder={props.placeholder ?? "请选择"} />
        </SelectTrigger>
        <SelectContent>
          {props.clearable ? (
            <SelectItem value="">
              <span className="text-muted-foreground">清除</span>
            </SelectItem>
          ) : null}
          {props.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

export interface MultiSelectWidgetProps extends WidgetBaseProps {
  options: { value: string; label: string }[];
}

export function MultiSelectWidget(props: MultiSelectWidgetProps) {
  const field = useFieldContext<string[]>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const [open, setOpen] = useState(false);
  const value = field.state.value ?? [];
  const labelOf = (v: string) => props.options.find((o) => o.value === v)?.label ?? v;
  const toggle = (v: string) => {
    field.handleChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={ids?.controlId}
              disabled={props.disabled}
              className="border-input bg-transparent aria-invalid:border-destructive flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border px-2 py-1 text-left text-sm"
              aria-invalid={errors.length > 0 || undefined}
              aria-describedby={ids?.describedBy}
            >
              {value.length === 0 ? (
                <span className="text-muted-foreground">{props.placeholder ?? "选择若干项"}</span>
              ) : (
                value.map((v) => (
                  <Badge key={v} variant="secondary" className="font-normal">
                    {labelOf(v)}
                  </Badge>
                ))
              )}
            </button>
          }
        />
        <PopoverContent className="w-64 p-1" align="start">
          <div className="max-h-64 overflow-y-auto">
            {props.options.map((opt) => (
              <Label
                key={opt.value}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal"
              >
                <Checkbox
                  checked={value.includes(opt.value)}
                  onCheckedChange={() => toggle(opt.value)}
                />
                {opt.label}
              </Label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export interface TagsWidgetProps extends WidgetBaseProps {
  /** 最多 tag 数（默认不限） */
  max?: number;
}

export function TagsWidget(props: TagsWidgetProps) {
  const field = useFieldContext<string[]>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const value = field.state.value ?? [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim();
    if (tag === "" || value.includes(tag)) {
      setDraft("");
      return;
    }
    if (props.max !== undefined && value.length >= props.max) return;
    field.handleChange([...value, tag]);
    setDraft("");
  };
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="border-input bg-transparent focus-within:border-ring flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
            {tag}
            <button
              type="button"
              aria-label={`移除 ${tag}`}
              className="hover:bg-muted rounded-sm p-0.5"
              onClick={() => field.handleChange(value.filter((t) => t !== tag))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={ids?.controlId}
          value={draft}
          placeholder={value.length === 0 ? (props.placeholder ?? "输入后回车添加") : ""}
          disabled={props.disabled}
          aria-describedby={ids?.describedBy}
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              field.handleChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            add();
            field.handleBlur();
          }}
        />
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Switch / Date / DateRange / Secret
// ---------------------------------------------------------------------------

export interface SwitchWidgetProps extends WidgetBaseProps {
  /** 开态说明文案（默认「启用」） */
  onLabel?: string;
  offLabel?: string;
}

export function SwitchWidget(props: SwitchWidgetProps) {
  const field = useFieldContext<boolean>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="flex items-center gap-2">
        <Switch
          id={ids?.controlId}
          checked={field.state.value === true}
          disabled={props.disabled}
          onCheckedChange={(v) => field.handleChange(v === true)}
          onBlur={field.handleBlur}
          aria-describedby={ids?.describedBy}
        />
        <span className="text-muted-foreground text-sm">
          {field.state.value === true ? (props.onLabel ?? "启用") : (props.offLabel ?? "未启用")}
        </span>
      </div>
    </FieldShell>
  );
}

export interface DateWidgetProps extends WidgetBaseProps {
  /** datetime → datetime-local 输入 */
  variant?: "date" | "datetime";
}

/**
 * 日期 widget：原生 `<input type=date|datetime-local>` 包装（取舍：不引 calendar 依赖，
 * 暗色主题由浏览器控制难保证完全一致；换 calendar + popover 可在此局部替换，接口不变）。
 */
export function DateWidget(props: DateWidgetProps) {
  const field = useFieldContext<string>();
  const { errors, invalid } = useFieldState(field);
  const ids = useFieldControlIds();
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <Input
        id={ids?.controlId}
        type={props.variant === "datetime" ? "datetime-local" : "date"}
        value={field.state.value ?? ""}
        disabled={props.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ids?.describedBy}
        className="w-60"
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
    </FieldShell>
  );
}

export interface DateRangeValue {
  from?: string;
  to?: string;
}

export function DateRangeWidget(props: WidgetBaseProps) {
  const field = useFieldContext<DateRangeValue>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const value = field.state.value ?? {};
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="flex items-center gap-2">
        {/* 双控件：label htmlFor 绑首控件（开始日期），两控件都挂 aria-describedby 关联描述/错误 */}
        <Input
          id={ids?.controlId}
          type="date"
          aria-label="开始日期"
          aria-describedby={ids?.describedBy}
          value={value.from ?? ""}
          disabled={props.disabled}
          className="w-44"
          onChange={(e) => field.handleChange({ ...value, from: e.target.value || undefined })}
        />
        <span className="text-muted-foreground text-sm">→</span>
        <Input
          type="date"
          aria-label="结束日期"
          aria-describedby={ids?.describedBy}
          value={value.to ?? ""}
          disabled={props.disabled}
          className="w-44"
          onChange={(e) => field.handleChange({ ...value, to: e.target.value || undefined })}
        />
      </div>
    </FieldShell>
  );
}

/** 密码式 + 一次性显示切换 */
export function SecretWidget(props: WidgetBaseProps) {
  const field = useFieldContext<string>();
  const { errors, invalid } = useFieldState(field);
  const ids = useFieldControlIds();
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="flex gap-2">
        <Input
          id={ids?.controlId}
          type={visible ? "text" : "password"}
          value={field.state.value ?? ""}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoComplete="new-password"
          aria-invalid={invalid || undefined}
          aria-describedby={ids?.describedBy}
          className="font-mono text-sm"
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={visible ? "隐藏" : "显示"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// KvPairs（键值行增删）
// ---------------------------------------------------------------------------

export interface KvPair {
  key: string;
  value: string;
}

export interface KvPairsWidgetProps extends WidgetBaseProps {
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export function KvPairsWidget(props: KvPairsWidgetProps) {
  const field = useFieldContext<KvPair[]>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const rows = field.state.value ?? [];
  const setRow = (index: number, patch: Partial<KvPair>) => {
    field.handleChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="space-y-2">
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">暂无条目。</p> : null}
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* 多控件：首行键输入绑 label（id），全部行内输入挂 aria-describedby（各自已有 aria-label） */}
            <Input
              id={index === 0 ? ids?.controlId : undefined}
              value={row.key}
              placeholder={props.keyPlaceholder ?? "KEY"}
              aria-label="键"
              aria-describedby={ids?.describedBy}
              className="font-mono text-sm"
              onChange={(e) => setRow(index, { key: e.target.value })}
            />
            <span className="text-muted-foreground">=</span>
            <Input
              value={row.value}
              placeholder={props.valuePlaceholder ?? "value"}
              aria-label="值"
              aria-describedby={ids?.describedBy}
              className="font-mono text-sm"
              onChange={(e) => setRow(index, { value: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="删除此行"
              onClick={() => field.handleChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="text-muted-foreground" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={rows.length === 0 ? ids?.controlId : undefined}
          aria-describedby={ids?.describedBy}
          onClick={() => field.handleChange([...rows, { key: "", value: "" }])}
        >
          <Plus /> 添加条目
        </Button>
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Upload（拖拽 + 文件列表 + 模拟进度）
// ---------------------------------------------------------------------------

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  /** 0-100（模拟上传进度） */
  progress: number;
}

export interface UploadWidgetProps extends WidgetBaseProps {
  /** 接受的 MIME（如 "image/*"） */
  accept?: string;
  multiple?: boolean;
}

let uploadSeq = 0;

/** 拖拽/点选选择文件 → 模拟上传进度（每 200ms +12~30 直至 100）。真实宿主可在此替换为上传请求。 */
export function UploadWidget(props: UploadWidgetProps) {
  const field = useFieldContext<UploadedFile[]>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const files = field.state.value ?? [];
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming: UploadedFile[] = [...list].map((f) => ({
        id: `up-${++uploadSeq}`,
        name: f.name,
        size: f.size,
        progress: 0,
      }));
      field.handleChange(props.multiple === false ? incoming.slice(0, 1) : [...files, ...incoming]);
      // 模拟进度推进（不依赖组件存活：每 tick 从字段当前值读起）
      const tick = () => {
        const current = (field.state.value ?? []).map((f) =>
          incoming.some((i) => i.id === f.id) && f.progress < 100
            ? { ...f, progress: Math.min(100, f.progress + 12 + Math.round(Math.random() * 18)) }
            : f,
        );
        field.handleChange(current);
        if (current.some((f) => f.progress < 100)) window.setTimeout(tick, 200);
      };
      window.setTimeout(tick, 200);
    },
    [field, files, props.multiple],
  );

  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="space-y-2">
        <button
          type="button"
          id={ids?.controlId}
          aria-describedby={ids?.describedBy}
          className={cn(
            "border-input hover:border-ring text-muted-foreground flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-sm transition-colors",
            dragOver && "border-ring bg-muted/40",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
          }}
        >
          <UploadCloud className="size-5" />
          <span>{props.placeholder ?? "拖拽文件到此处，或点击选择"}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={props.accept}
          multiple={props.multiple}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-sm">
            <FileText className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{f.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {(f.size / 1024).toFixed(1)} KB
            </span>
            <div className="bg-muted relative ml-auto h-1.5 w-28 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  f.progress >= 100 ? "bg-status-success" : "bg-primary",
                )}
                style={{ width: `${f.progress}%` }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`移除 ${f.name}`}
              onClick={() => field.handleChange(files.filter((x) => x.id !== f.id))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Json（textarea + 解析校验 + 格式化）
// ---------------------------------------------------------------------------

export interface JsonWidgetProps extends WidgetBaseProps {
  rows?: number;
}

/** JSON 文本字段：本地解析校验即时提示；「格式化」按 2 空格重排（解析失败时禁用）。 */
export function JsonWidget(props: JsonWidgetProps) {
  const field = useFieldContext<string>();
  const fieldErrors = useFieldState(field);
  const ids = useFieldControlIds();
  const value = field.state.value ?? "";
  const [parseError, setParseError] = useState<string | null>(null);
  const validate = useMemo(() => {
    if (value.trim() === "") return true;
    try {
      JSON.parse(value);
      return true;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [value]);
  const localError = parseError ?? (validate === true ? null : String(validate));
  const errors = [...fieldErrors.errors, ...(localError ? [`JSON 解析错误：${localError}`] : [])];
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="space-y-2">
        <Textarea
          id={ids?.controlId}
          rows={props.rows ?? 6}
          value={value}
          placeholder={props.placeholder ?? '{\n  "key": "value"\n}'}
          disabled={props.disabled}
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby={ids?.describedBy}
          className="font-mono text-sm"
          onBlur={field.handleBlur}
          onChange={(e) => {
            field.handleChange(e.target.value);
            setParseError(null);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={validate !== true || value.trim() === ""}
          onClick={() => field.handleChange(JSON.stringify(JSON.parse(value), null, 2))}
        >
          格式化
        </Button>
      </div>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// RepeatableRows（数组行，行内子字段）
// ---------------------------------------------------------------------------

export interface RepeatableColumnDef {
  /** 行对象字段名 */
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  width?: string;
}

export interface RepeatableRowsWidgetProps extends WidgetBaseProps {
  columns: RepeatableColumnDef[];
  /** 新行默认值 */
  newRow: Record<string, unknown>;
  addLabel?: string;
}

/** 数组行编辑器：每行 N 个行内子字段（轻编辑；深度校验由外层 schema 承担）。 */
export function RepeatableRowsWidget(props: RepeatableRowsWidgetProps) {
  const field = useFieldContext<Record<string, unknown>[]>();
  const { errors } = useFieldState(field);
  const ids = useFieldControlIds();
  const rows = field.state.value ?? [];
  const setCell = (index: number, key: string, value: unknown) => {
    field.handleChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  return (
    <FieldShell
      label={props.label}
      description={props.description}
      required={props.required}
      errors={errors}
      className={props.className}
    >
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无行。</p>
        ) : (
          <div className="border-border divide-border overflow-hidden rounded-lg border">
            <div
              className="bg-muted/50 text-muted-foreground grid gap-2 px-3 py-1.5 text-xs font-medium"
              style={{
                gridTemplateColumns: `${props.columns.map((c) => c.width ?? "1fr").join(" ")} auto`,
              }}
            >
              {props.columns.map((c) => (
                <span key={c.key}>{c.label}</span>
              ))}
              <span aria-hidden="true" />
            </div>
            {rows.map((row, index) => (
              <div
                key={index}
                className="grid items-center gap-2 px-3 py-2"
                style={{
                  gridTemplateColumns: `${props.columns.map((c) => c.width ?? "1fr").join(" ")} auto`,
                }}
              >
                {props.columns.map((col, colIndex) => (
                  <span key={col.key} className="min-w-0">
                    {col.type === "select" ? (
                      <Select
                        value={String(row[col.key] ?? "")}
                        onValueChange={(v) => setCell(index, col.key, v)}
                        items={col.options ?? []}
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-full"
                          aria-label={col.label}
                          aria-describedby={ids?.describedBy}
                        >
                          <SelectValue placeholder={col.placeholder ?? "选择"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(col.options ?? []).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={index === 0 && colIndex === 0 ? ids?.controlId : undefined}
                        type={col.type === "number" ? "number" : "text"}
                        aria-label={col.label}
                        aria-describedby={ids?.describedBy}
                        value={
                          row[col.key] === undefined || row[col.key] === null
                            ? ""
                            : String(row[col.key])
                        }
                        placeholder={col.placeholder}
                        onChange={(e) =>
                          setCell(
                            index,
                            col.key,
                            col.type === "number"
                              ? e.target.value === ""
                                ? undefined
                                : Number(e.target.value)
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </span>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="删除此行"
                  onClick={() => field.handleChange(rows.filter((_, i) => i !== index))}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={rows.length === 0 ? ids?.controlId : undefined}
          aria-describedby={ids?.describedBy}
          onClick={() => field.handleChange([...rows, { ...props.newRow }])}
        >
          <Plus /> {props.addLabel ?? "添加行"}
        </Button>
      </div>
    </FieldShell>
  );
}
