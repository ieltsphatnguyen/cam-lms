import {
  useState,
  useRef,
  useLayoutEffect,
  ReactNode,
  useCallback,
} from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
  content: ReactNode;
  iconSize?: number;
  iconClassName?: string;
  children?: ReactNode;
}

type Direction = 'top' | 'bottom' | 'left' | 'right';

interface Position {
  direction: Direction;
  top: number;
  left: number;
}

const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 12;

export default function SmartTooltip({
  content,
  iconSize = 14,
  iconClassName = '',
  children,
}: Props) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<Position>({
    direction: 'top',
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine which directions have enough space
    const space = {
      top: triggerRect.top,
      bottom: vh - triggerRect.bottom,
      left: triggerRect.left,
      right: vw - triggerRect.right,
    };

    const needs = {
      width: tooltipRect.width + TOOLTIP_GAP + VIEWPORT_PADDING,
      height: tooltipRect.height + TOOLTIP_GAP + VIEWPORT_PADDING,
    };

    // Pick the direction with the most space that fits
    const candidates: Direction[] = [];
    if (space.top >= needs.height) candidates.push('top');
    if (space.bottom >= needs.height) candidates.push('bottom');
    if (space.right >= needs.width) candidates.push('right');
    if (space.left >= needs.width) candidates.push('left');

    // Fallback: pick the direction with the most space even if it doesn't fully fit
    let direction: Direction = candidates[0] ?? 'top';
    if (candidates.length === 0) {
      const maxSpace = Math.max(space.top, space.bottom, space.left, space.right);
      if (maxSpace === space.top) direction = 'top';
      else if (maxSpace === space.bottom) direction = 'bottom';
      else if (maxSpace === space.right) direction = 'right';
      else direction = 'left';
    }

    let top = 0;
    let left = 0;

    switch (direction) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - TOOLTIP_GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + TOOLTIP_GAP;
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - TOOLTIP_GAP;
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + TOOLTIP_GAP;
        break;
    }

    // Clamp to viewport so the tooltip never overflows
    left = Math.max(
      VIEWPORT_PADDING,
      Math.min(left, vw - tooltipRect.width - VIEWPORT_PADDING),
    );
    top = Math.max(
      VIEWPORT_PADDING,
      Math.min(top, vh - tooltipRect.height - VIEWPORT_PADDING),
    );

    setPosition({ direction, top, left });
  }, []);

  useLayoutEffect(() => {
    if (show) {
      computePosition();
      window.addEventListener('resize', computePosition);
      window.addEventListener('scroll', computePosition, true);
      return () => {
        window.removeEventListener('resize', computePosition);
        window.removeEventListener('scroll', computePosition, true);
      };
    }
  }, [show, computePosition]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children ?? (
        <HelpCircle
          size={iconSize}
          className={`cursor-help text-slate-400 transition hover:text-slate-600 ${iconClassName}`}
        />
      )}

      {/* Tooltip — rendered as fixed-position overlay so it never gets clipped */}
      {show && (
        <div
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 w-80 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            opacity: show && position.top !== 0 ? 1 : 0,
            transition: 'opacity 150ms ease-in-out',
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
}
