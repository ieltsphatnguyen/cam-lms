import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Mic, Bold, Italic, Underline, Strikethrough } from 'lucide-react';
import type { RubricCriterion } from '@/types/database';
import type { SelectionRange } from './AnnotatableText';

export interface FormatToggle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
}

interface FloatingToolbarProps {
  selection: SelectionRange | null;
  criteria: RubricCriterion[];
  onCreateAnnotation: (criterionId: number) => void;
  onAddTextComment: () => void;
  onAddAudioComment: () => void;
  onFormat: (format: Partial<FormatToggle>) => void;
  activeFormat: FormatToggle;
}

export default function FloatingToolbar({
  selection,
  criteria,
  onCreateAnnotation,
  onAddTextComment,
  onAddAudioComment,
  onFormat,
  activeFormat,
}: FloatingToolbarProps) {
  const [position, setPosition] = useState<{ x: number; y: number; width: number } | null>(null);
  const [criterionOpen, setCriterionOpen] = useState(false);
  const [dropDirection, setDropDirection] = useState<'up' | 'down'>('up');
  const toolbarRef = useRef<HTMLDivElement>(null);
  const criterionCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selection) {
      setPosition(null);
      setCriterionOpen(false);
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setPosition(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      width: rect.width,
    });
  }, [selection]);

  const computeAdaptivePosition = useCallback((pos: { x: number; y: number; width: number }) => {
    const toolbarWidth = 380;
    const toolbarHeight = 44;
    const margin = 8;

    let x = pos.x - toolbarWidth / 2;
    let y = pos.y - toolbarHeight;

    if (x < margin) x = margin;
    if (x + toolbarWidth > window.innerWidth - margin) {
      x = window.innerWidth - toolbarWidth - margin;
    }

    if (y < margin) {
      y = pos.y + toolbarHeight + margin;
    }

    return { x, y };
  }, []);

  useEffect(() => {
    if (criterionOpen && position) {
      const dropdownHeight = 200;
      const spaceAbove = position.y;
      const spaceBelow = window.innerHeight - (position.y - 40);
      setDropDirection(spaceAbove < dropdownHeight && spaceBelow > dropdownHeight ? 'down' : 'up');
    }
  }, [criterionOpen, position]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setCriterionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openCriterion = useCallback(() => {
    if (criterionCloseTimer.current) {
      clearTimeout(criterionCloseTimer.current);
      criterionCloseTimer.current = null;
    }
    setCriterionOpen(true);
  }, []);

  const scheduleCriterionClose = useCallback(() => {
    if (criterionCloseTimer.current) clearTimeout(criterionCloseTimer.current);
    criterionCloseTimer.current = setTimeout(() => setCriterionOpen(false), 150);
  }, []);

  const handleCriterionSelect = (criterionId: number) => {
    if (criterionCloseTimer.current) {
      clearTimeout(criterionCloseTimer.current);
      criterionCloseTimer.current = null;
    }
    setCriterionOpen(false);
    onCreateAnnotation(criterionId);
  };

  if (!position) return null;

  const adaptivePos = computeAdaptivePosition(position);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: `${adaptivePos.x}px`,
    top: `${adaptivePos.y}px`,
    zIndex: 50,
  };

  const dropdownClass =
    dropDirection === 'up'
      ? 'absolute bottom-full left-0 pt-1'
      : 'absolute top-full left-0 pb-1';

  return (
    <div
      ref={toolbarRef}
      style={style}
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Criterion dropdown — opens on hover, stays open while moving into it */}
      <div
        className="relative"
        onMouseEnter={openCriterion}
        onMouseLeave={scheduleCriterionClose}
      >
        <button
          onClick={() => setCriterionOpen(!criterionOpen)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Criterion
          <span className="text-slate-400">▼</span>
        </button>
        {criterionOpen && (
          <div
            className={`${dropdownClass} w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg`}
            onMouseEnter={openCriterion}
            onMouseLeave={scheduleCriterionClose}
          >
            {criteria.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No criteria available</p>
            ) : (
              criteria.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleCriterionSelect(c.id)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  {c.name}
                  <span className="text-slate-300">→</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="h-5 w-px bg-slate-200" />

      {/* Formatting toggles — format selected text only, never create annotations */}
      <ToolbarFormatButton
        onClick={() => onFormat({ bold: !activeFormat.bold })}
        active={activeFormat.bold}
        title="Bold"
      >
        <Bold size={13} />
      </ToolbarFormatButton>
      <ToolbarFormatButton
        onClick={() => onFormat({ italic: !activeFormat.italic })}
        active={activeFormat.italic}
        title="Italic"
      >
        <Italic size={13} />
      </ToolbarFormatButton>
      <ToolbarFormatButton
        onClick={() => onFormat({ underline: !activeFormat.underline })}
        active={activeFormat.underline}
        title="Underline"
      >
        <Underline size={13} />
      </ToolbarFormatButton>
      <ToolbarFormatButton
        onClick={() => onFormat({ strikethrough: !activeFormat.strikethrough })}
        active={activeFormat.strikethrough}
        title="Strikethrough"
      >
        <Strikethrough size={13} />
      </ToolbarFormatButton>

      <div className="h-5 w-px bg-slate-200" />

      {/* Comment and Audio Comment — create annotation with null criterion */}
      <ToolbarIconButton onClick={onAddTextComment} title="Text Comment">
        <MessageSquare size={13} />
      </ToolbarIconButton>
      <ToolbarIconButton onClick={onAddAudioComment} title="Audio Comment">
        <Mic size={13} />
      </ToolbarIconButton>
    </div>
  );
}

function ToolbarIconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      className="rounded p-1 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function ToolbarFormatButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      className={`rounded p-1 transition ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
