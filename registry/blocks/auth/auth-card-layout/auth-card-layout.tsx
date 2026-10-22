import type { ReactNode } from "react";
import { pageTitleClass } from "@/components/blocks/shared/page-header/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface AuthCardLayoutProps {
  /** 卡片标题（居中；22px 标题排版单一事实源，同 PageHeader） */
  title?: ReactNode;
  /** 标题下说明 */
  description?: ReactNode;
  /** 品牌位（logo + 产品名），渲染在标题上方 */
  brand?: ReactNode;
  /** 卡片主体（表单 / 终态视图） */
  children: ReactNode;
  /** 卡片下方区域（注册 / 忘记密码链接等） */
  footer?: ReactNode;
  className?: string;
}

/**
 * auth 卡片壳（M6-D 抽取）：登录 / 注册 / 忘记密码 / OTP 四页的平行
 * 「居中 main + max-w-sm 卡片 + 居中 header（brand/title/description）+ footer」收敛为单一布局。
 */
export function AuthCardLayout({
  title,
  description,
  brand,
  children,
  footer,
  className,
}: AuthCardLayoutProps) {
  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className={className ?? "w-full max-w-sm"}>
        <CardHeader className="items-center text-center">
          {brand}
          {title ? <CardTitle className={pageTitleClass}>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer ? <CardFooter className="justify-center text-sm">{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}
