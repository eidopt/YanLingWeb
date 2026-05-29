export function generateInteractiveTabsComponent(): string {
  return `import { useState } from 'react';

interface InteractiveTabsProps {
  tabs: string[];
  initialActive?: string;
  navigateTargets?: Record<string, string>;
  onNavigate: (pageId: string) => void;
}

export function InteractiveTabs({
  tabs,
  initialActive,
  navigateTargets = {},
  onNavigate,
}: InteractiveTabsProps) {
  const [activeTab, setActiveTab] = useState(initialActive || tabs[0] || '');

  return (
    <nav className="core-tabs">
      {tabs.map((tab) => {
        const targetPageId = navigateTargets[tab];
        return (
          <button
            className={Object.is(tab, activeTab) ? 'active' : ''}
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              if (targetPageId) {
                onNavigate(targetPageId);
              }
            }}
          >
            {tab}
          </button>
        );
      })}
    </nav>
  );
}
`;
}

export function generateInteractiveCarouselComponent(): string {
  return `import { useState } from 'react';

interface InteractiveCarouselProps {
  images: string[];
  altPrefix?: string;
}

export function InteractiveCarousel({
  images,
  altPrefix = 'Slide',
}: InteractiveCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = images.length;
  const activeImage = images[activeIndex] ?? '';

  if (!count) {
    return <div className="core-carousel" aria-hidden="true" />;
  }

  const goTo = (nextIndex: number) => {
    setActiveIndex((nextIndex + count) % count);
  };

  return (
    <section className="core-carousel" aria-roledescription="carousel">
      <img
        className="carousel-item"
        src={activeImage}
        alt={\`\${altPrefix} \${activeIndex + 1}\`}
      />
      {count > 1 && (
        <div className="carousel-controls">
          <button type="button" onClick={() => goTo(activeIndex - 1)} aria-label="Previous slide">
            Previous
          </button>
          <span>
            {activeIndex + 1} / {count}
          </span>
          <button type="button" onClick={() => goTo(activeIndex + 1)} aria-label="Next slide">
            Next
          </button>
        </div>
      )}
    </section>
  );
}
`;
}

export function generateInteractivePaginationComponent(): string {
  return `import { useState } from 'react';

interface InteractivePaginationProps {
  current?: number;
  total?: number;
  pageSize?: number;
}

function buildPages(current: number, totalPages: number): (number | 'left-ellipsis' | 'right-ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: (number | 'left-ellipsis' | 'right-ellipsis')[] = [1];
  if (current > 3) {
    pages.push('left-ellipsis');
  }
  for (let page = Math.max(2, current - 1); page <= Math.min(totalPages - 1, current + 1); page += 1) {
    pages.push(page);
  }
  if (current < totalPages - 2) {
    pages.push('right-ellipsis');
  }
  pages.push(totalPages);
  return pages;
}

export function InteractivePagination({
  current = 1,
  total = 1,
  pageSize = 10,
}: InteractivePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const initialPage = Math.max(1, Math.min(totalPages, current));
  const [currentPage, setCurrentPage] = useState(initialPage);
  const pages = buildPages(currentPage, totalPages);

  const goTo = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  };

  return (
    <nav className="core-pagination" aria-label="Pagination">
      <button
        type="button"
        className="page-prev"
        disabled={currentPage <= 1}
        aria-label="Previous page"
        onClick={() => goTo(currentPage - 1)}
      >
        Previous
      </button>
      {pages.map((page) =>
        typeof page === 'string' ? (
          <span key={page} className="ellipsis">
            ...
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={Object.is(page, currentPage) ? 'active' : ''}
            aria-current={Object.is(page, currentPage) ? 'page' : undefined}
            onClick={() => goTo(page)}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        className="page-next"
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        onClick={() => goTo(currentPage + 1)}
      >
        Next
      </button>
    </nav>
  );
}
`;
}

export function generateInteractiveRateComponent(): string {
  return `import { type CSSProperties, useState } from 'react';

interface InteractiveRateProps {
  value?: number;
  count?: number;
  disabled?: boolean;
  style?: CSSProperties;
}

export function InteractiveRate({
  value = 0,
  count = 5,
  disabled = false,
  style,
}: InteractiveRateProps) {
  const total = Math.max(1, Math.floor(count));
  const initialValue = Math.max(0, Math.min(total, Math.floor(value)));
  const [currentValue, setCurrentValue] = useState(initialValue);

  return (
    <div className="core-rate" role="radiogroup" aria-label="Rating" style={style}>
      {Array.from({ length: total }, (_, index) => {
        const nextValue = index + 1;
        const selected = nextValue <= currentValue;
        return (
          <button
            key={nextValue}
            type="button"
            className={selected ? 'rate-star filled' : 'rate-star'}
            disabled={disabled}
            role="radio"
            aria-checked={Object.is(nextValue, currentValue)}
            aria-label={\`\${nextValue} of \${total}\`}
            onClick={() => setCurrentValue(nextValue)}
          >
            {selected ? '★' : '☆'}
          </button>
        );
      })}
    </div>
  );
}
`;
}

export function generateInteractiveSwitchComponent(): string {
  return `import { type CSSProperties, useState } from 'react';

interface InteractiveSwitchProps {
  label?: string;
  initialChecked?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export function InteractiveSwitch({
  label = '',
  initialChecked = false,
  disabled = false,
  style,
}: InteractiveSwitchProps) {
  const [checked, setChecked] = useState(initialChecked);

  return (
    <button
      type="button"
      className="core-switch"
      data-checked={checked}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      style={style}
      onClick={() => setChecked((current) => !current)}
    >
      <span className="switch-track" data-checked={checked} data-disabled={disabled}>
        <span className="switch-thumb" />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}
`;
}

export function generateInteractiveFormComponent(): string {
  return `import { type ReactNode, useState } from 'react';

interface InteractiveFormProps {
  children?: ReactNode;
  labelAlign?: string;
  labelWidth?: string;
  successMessage?: string;
}

export function InteractiveForm({
  children,
  labelAlign = 'left',
  labelWidth = '80px',
  successMessage = 'Submitted',
}: InteractiveFormProps) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      className="core-form"
      data-label-align={labelAlign}
      style={{ '--label-width': labelWidth } as React.CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
    >
      {children}
      {submitted && (
        <p className="form-submit-status" role="status">
          {successMessage}
        </p>
      )}
    </form>
  );
}
`;
}

export function generateInteractiveDialogComponent(): string {
  return `import { type ReactNode, useState } from 'react';

interface InteractiveDialogProps {
  children?: ReactNode;
  title?: string;
  initialVisible?: boolean;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  confirmText?: string;
  cancelText?: string;
}

export function InteractiveDialog({
  children,
  title = '',
  initialVisible = true,
  visible,
  onVisibleChange,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}: InteractiveDialogProps) {
  const [localVisible, setLocalVisible] = useState(initialVisible);
  const currentVisible = typeof visible === 'boolean' ? visible : localVisible;
  const setCurrentVisible = (nextVisible: boolean) => {
    if (typeof visible === 'boolean') {
      onVisibleChange?.(nextVisible);
      return;
    }
    setLocalVisible(nextVisible);
  };

  if (!currentVisible) {
    return null;
  }

  return (
    <div className="dialog-overlay" role="presentation">
      <section className="core-dialog" role="dialog" aria-modal="true" aria-label={title || 'Dialog'}>
        {title && <div className="dialog-title">{title}</div>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-footer">
          <button type="button" className="dialog-cancel" onClick={() => setCurrentVisible(false)}>
            {cancelText}
          </button>
          <button type="button" className="dialog-confirm" onClick={() => setCurrentVisible(false)}>
            {confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}
`;
}

export function generateInteractiveDrawerComponent(): string {
  return `import { type ReactNode, useState } from 'react';

interface InteractiveDrawerProps {
  children?: ReactNode;
  title?: string;
  initialVisible?: boolean;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  placement?: string;
}

export function InteractiveDrawer({
  children,
  title = '',
  initialVisible = true,
  visible,
  onVisibleChange,
  placement = 'right',
}: InteractiveDrawerProps) {
  const [localVisible, setLocalVisible] = useState(initialVisible);
  const currentVisible = typeof visible === 'boolean' ? visible : localVisible;
  const setCurrentVisible = (nextVisible: boolean) => {
    if (typeof visible === 'boolean') {
      onVisibleChange?.(nextVisible);
      return;
    }
    setLocalVisible(nextVisible);
  };

  if (!currentVisible) {
    return null;
  }

  return (
    <div className="drawer-overlay" role="presentation">
      <aside className="core-drawer" data-placement={placement} aria-label={title || 'Drawer'}>
        <div className="drawer-title">
          {title && <span>{title}</span>}
          <button type="button" onClick={() => setCurrentVisible(false)} aria-label="Close drawer">
            Close
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}
`;
}

export function generateInteractiveAlertComponent(): string {
  return `import { type CSSProperties, useState } from 'react';

interface InteractiveAlertProps {
  text?: string;
  type?: string;
  closable?: boolean;
  style?: CSSProperties;
}

export function InteractiveAlert({
  text = '',
  type = 'info',
  closable = false,
  style,
}: InteractiveAlertProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <div className="core-alert" data-type={type} role="alert" style={style}>
      {text && <span>{text}</span>}
      {closable && (
        <button
          type="button"
          className="alert-close"
          aria-label="Close alert"
          onClick={() => setVisible(false)}
        >
          x
        </button>
      )}
    </div>
  );
}
`;
}
