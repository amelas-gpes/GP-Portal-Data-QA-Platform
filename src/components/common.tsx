import { HelpCircle } from 'lucide-react';
import { useId, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from 'react';
import { tierHelp, tierNoun } from './severityText';

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';
type PillTone = 'neutral' | 'good' | 'warn' | 'bad';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function HelpIcon({ title }: { title: string }) {
  return (
    <span className="help-icon" title={title} aria-label={title} role="img">
      <HelpCircle size={15} />
    </span>
  );
}

export function EmptyState({
  children,
  className,
  detail,
  title,
}: {
  children?: ReactNode;
  className?: string;
  detail: string;
  title: string;
}) {
  return (
    <div className={cx('empty-state', 'ui-empty-state', className)} title={`${title}: ${detail}`}>
      <strong>{title}</strong>
      <span>{detail}</span>
      {children}
    </div>
  );
}

export function SkeletonText({ className = '' }: { className?: string }) {
  return <span className={cx('skeleton-text', className)} aria-hidden="true" data-skeleton="text" />;
}

export function Button({
  children,
  className,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  type = 'button',
  variant = 'secondary',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button className={cx('ui-button', `ui-button-${variant}`, fullWidth && 'ui-button-full', className)} data-variant={variant} type={type} {...props}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

export function IconButton({
  children,
  className,
  label,
  title,
  type = 'button',
  variant = 'secondary',
  ...props
}: Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'aria-label'> & {
  children: ReactNode;
  label: string;
  variant?: ButtonVariant;
}) {
  return (
    <button className={cx('ui-button', 'ui-icon-button', `ui-button-${variant}`, className)} data-variant={variant} type={type} aria-label={label} title={title ?? label} {...props}>
      {children}
    </button>
  );
}

export function Panel({
  children,
  className,
  padding = 'md',
  variant = 'default',
  ...props
}: ComponentPropsWithoutRef<'section'> & {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'soft' | 'elevated';
}) {
  return (
    <section className={cx('ui-panel', variant !== 'default' && `ui-panel-${variant}`, `ui-panel-padding-${padding}`, className)} data-padding={padding} data-variant={variant} {...props}>
      {children}
    </section>
  );
}

export function FieldRow({
  children,
  className,
  hint,
  label,
  orientation = 'vertical',
  ...props
}: ComponentPropsWithoutRef<'label'> & {
  hint?: ReactNode;
  label: ReactNode;
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <label className={cx('ui-field-row', orientation === 'horizontal' && 'ui-field-row-horizontal', className)} {...props}>
      <span>{label}</span>
      {children}
      {hint ? <small className="ui-field-hint">{hint}</small> : null}
    </label>
  );
}

export type TabItem = {
  disabled?: boolean;
  id: string;
  label: ReactNode;
  title?: string;
};

export function Tabs({
  activeId,
  ariaLabel,
  className,
  items,
  onChange,
  ...props
}: Omit<ComponentPropsWithoutRef<'nav'>, 'onChange'> & {
  activeId: string;
  ariaLabel: string;
  items: readonly TabItem[];
  onChange: (id: string) => void;
}) {
  return (
    <nav className={cx('ui-tabs', className)} aria-label={ariaLabel} {...props}>
      {items.map((item) => (
        <button
          aria-current={item.id === activeId ? 'page' : undefined}
          className={cx('ui-tab', item.id === activeId && 'active ui-tab-active')}
          disabled={item.disabled}
          key={item.id}
          onClick={() => onChange(item.id)}
          title={item.title}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export type StatusBarItem = {
  label: ReactNode;
  title?: string;
  value: ReactNode;
};

export function StatusBar({ className, items, ...props }: ComponentPropsWithoutRef<'section'> & { items: readonly StatusBarItem[] }) {
  return (
    <section className={cx('ui-status-bar', className)} {...props}>
      {items.map((item, index) => (
        <div className="ui-status-item" key={`${readableTooltip(item.label) ?? 'status'}-${index}`} title={item.title}>
          <span className="ui-status-label">{item.label}</span>
          <strong className="ui-status-value">{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

export function ModalShell({
  actions,
  backdropClassName,
  children,
  className,
  heading,
  onBackdropClick,
  size = 'md',
  subheading,
  ...props
}: Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  actions?: ReactNode;
  backdropClassName?: string;
  heading: ReactNode;
  onBackdropClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  subheading?: ReactNode;
}) {
  const headingId = useId();
  return (
    <div className={cx('ui-modal-backdrop', backdropClassName)} onClick={onBackdropClick} role="presentation">
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className={cx('ui-modal-shell', `ui-modal-${size}`, className)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        {...props}
      >
        <header className="ui-modal-header">
          <div>
            <h2 id={headingId}>{heading}</h2>
            {subheading ? <span>{subheading}</span> : null}
          </div>
          {actions ? <div className="ui-modal-actions">{actions}</div> : null}
        </header>
        <div className="ui-modal-body">{children}</div>
      </section>
    </div>
  );
}

export function Pill({
  children,
  className,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  className?: string;
  tone?: PillTone;
  title?: string;
}) {
  const tooltip = title ?? readableTooltip(children);
  return (
    <span className={cx('ui-pill', `ui-pill-${tone}`, 'pill', `pill-${tone}`, className)} data-tone={tone} title={tooltip} aria-label={tooltip}>
      {children}
    </span>
  );
}

function readableTooltip(children: ReactNode): string | undefined {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return undefined;
}

export function SeverityPill({
  tier,
  count,
  onClick,
  title,
}: {
  tier: 'critical' | 'warning';
  /** Omit to render the tier word alone — for surfaces where a number would be ambiguous. */
  count?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  const label = count == null
    ? (tier === 'critical' ? 'Blocking' : 'Check')
    : (tier === 'critical' ? `${count} blocking` : `${count} to check`);
  const tooltip = title ?? (count == null ? tierHelp(tier) : `${count} ${tierNoun(tier, count)} — ${tierHelp(tier)}`);
  if (onClick) {
    return (
      <button className="severity-pill" data-severity={tier} type="button" onClick={onClick} title={tooltip}>
        {label}
      </button>
    );
  }
  return (
    <span className="severity-pill" data-severity={tier} title={tooltip}>
      {label}
    </span>
  );
}

export type ProvenanceState = 'fresh' | 'computing' | 'stale';

export function ProvenanceTag({ state, stamp }: { state: ProvenanceState; stamp?: string }) {
  const glyph = state === 'fresh' ? '●' : state === 'computing' ? '◐' : '◌';
  const label = state === 'fresh' ? 'fresh' : state === 'computing' ? 'computing' : 'as of previous edit';
  return (
    <span className="provenance-tag" data-state={state} title={stamp ? `${label} · ${stamp}` : label}>
      <span aria-hidden="true">{glyph}</span> {label}
    </span>
  );
}
