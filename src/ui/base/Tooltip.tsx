'use client';

import styles from './Tooltip.module.css';
import { cx } from 'base/classname';
import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type FocusEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
interface TooltipPosition { left: number; top: number }

export type TooltipProps<T extends ElementType = 'span'> = Omit<
  ComponentPropsWithoutRef<T>,
  'as' | 'children' | 'content'
> & {
  as?: T;
  bounce?: number;
  children: ReactNode;
  className?: string;
  content: ReactNode;
  placement?: TooltipPlacement;
};

const TOOLTIP_OFFSET = 10;
const VIEWPORT_PADDING = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolvePlacement(
  preferredPlacement: TooltipPlacement,
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
) {
  const fitsTop =
    triggerRect.top >= tooltipRect.height + TOOLTIP_OFFSET + VIEWPORT_PADDING;
  const fitsBottom =
    window.innerHeight - triggerRect.bottom
    >= tooltipRect.height + TOOLTIP_OFFSET + VIEWPORT_PADDING;
  const fitsLeft =
    triggerRect.left >= tooltipRect.width + TOOLTIP_OFFSET + VIEWPORT_PADDING;
  const fitsRight =
    window.innerWidth - triggerRect.right
    >= tooltipRect.width + TOOLTIP_OFFSET + VIEWPORT_PADDING;

  switch (preferredPlacement) {
    case 'top':
      return fitsTop || !fitsBottom ? 'top' : 'bottom';
    case 'bottom':
      return fitsBottom || !fitsTop ? 'bottom' : 'top';
    case 'left':
      return fitsLeft || !fitsRight ? 'left' : 'right';
    case 'right':
      return fitsRight || !fitsLeft ? 'right' : 'left';
    default:
      return preferredPlacement;
  }
}

function resolveTooltipPosition(
  placement: TooltipPlacement,
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
): TooltipPosition {
  switch (placement) {
    case 'top':
      return {
        left:
          triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        top: triggerRect.top - tooltipRect.height - TOOLTIP_OFFSET,
      };
    case 'bottom':
      return {
        left:
          triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        top: triggerRect.bottom + TOOLTIP_OFFSET,
      };
    case 'left':
      return {
        left: triggerRect.left - tooltipRect.width - TOOLTIP_OFFSET,
        top:
          triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
    case 'right':
      return {
        left: triggerRect.right + TOOLTIP_OFFSET,
        top:
          triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      };
    default:
      return {
        left: triggerRect.left,
        top: triggerRect.top,
      };
  }
}

export function Tooltip<T extends ElementType = 'span'>({
  as,
  bounce = 500,
  children,
  className,
  content,
  placement = 'top',
  ...restProps
}: TooltipProps<T>) {
  const tooltipId = useId();
  const Root = (as ?? 'span');
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] =
    useState<TooltipPlacement>(placement);
  const [position, setPosition] =
    useState<TooltipPosition>({ left: 0, top: 0 });

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const triggerElement = triggerRef.current;
    const tooltipElement = tooltipRef.current;
    if (!triggerElement || !tooltipElement) {
      return;
    }

    const updatePosition = () => {
      const nextTriggerRect = triggerElement.getBoundingClientRect();
      const nextTooltipRect = tooltipElement.getBoundingClientRect();
      const nextPlacement = resolvePlacement(
        placement, nextTriggerRect, nextTooltipRect,
      );
      const nextPosition = resolveTooltipPosition(
        nextPlacement, nextTriggerRect, nextTooltipRect,
      );

      setResolvedPlacement(nextPlacement);
      setPosition({
        left: clamp(
          nextPosition.left,
          VIEWPORT_PADDING,
          window.innerWidth - nextTooltipRect.width - VIEWPORT_PADDING,
        ),
        top: clamp(
          nextPosition.top,
          VIEWPORT_PADDING,
          window.innerHeight - nextTooltipRect.height - VIEWPORT_PADDING,
        ),
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(triggerElement);
    resizeObserver.observe(tooltipElement);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [content, isOpen, placement]);

  function clearOpenTimer() {
    if (openTimerRef.current === null) {
      return;
    }

    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function scheduleOpen() {
    clearOpenTimer();

    if (bounce <= 0) {
      setIsOpen(true);
      return;
    }

    openTimerRef.current = window.setTimeout(() => {
      setIsOpen(true);
      openTimerRef.current = null;
    }, bounce);
  }

  function closeTooltip() {
    clearOpenTimer();
    setIsOpen(false);
  }

  function handlePointerEnter() {
    scheduleOpen();
  }

  function handlePointerLeave() {
    closeTooltip();
  }

  function handleFocus() {
    scheduleOpen();
  }

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (
      event.relatedTarget instanceof Node
      && event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    closeTooltip();
  }

  function handlePointerDown() {
    closeTooltip();
  }

  return (
    <Root
      className={cx(styles.root, className)}
      {...restProps}
    >
      <span
        ref={triggerRef}
        className={styles.trigger}
        aria-describedby={tooltipId}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </span>
      {isOpen
        ? createPortal(
            <span
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              className={cx(styles.content, styles[resolvedPlacement])}
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
              }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </Root>
  );
}
