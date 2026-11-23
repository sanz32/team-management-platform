import type { CSSProperties, ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow?: string;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: ReactNode;
  accent?: string;
  className?: string;
}

export default function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  accent,
  className = "",
}: PageHeaderProps) {
  const style = accent ? ({ "--head-accent": accent } as CSSProperties) : undefined;

  return (
    <header className={`page-head ${className}`.trim()} style={style}>
      <div className="page-head-row">
        <div className="page-head-main">
          {eyebrow && (
            <p className="page-eyebrow">
              {Icon && <Icon className="w-[0.85rem] h-[0.85rem]" />}
              {eyebrow}
            </p>
          )}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
        {actions && <div className="page-head-actions">{actions}</div>}
      </div>
    </header>
  );
}
