import { useRef, useCallback, useState, useEffect } from 'react';
import { MessageSquare, AudioLines } from 'lucide-react';
import type { Annotation, HighlightColor, RubricCriterion, TextFormat } from '@/types/database';

export interface SelectionRange {
  start: number;
  end: number;
  text: string;
}

interface AnnotatableTextProps {
  text: string;
  annotations: Annotation[];
  textFormats?: TextFormat[];
  criteria: RubricCriterion[];
  onSelection: (range: SelectionRange | null) => void;
  onAnnotationClick: (annotationId: number) => void;
  flashAnnotationId: number | null;
  readOnly?: boolean;
}

const CRITERION_COLORS: HighlightColor[] = ['purple', 'yellow', 'green', 'cyan'];

export function criterionColor(
  criterionId: number | null,
  criteria: RubricCriterion[],
): HighlightColor {
  if (criterionId === null) return 'purple';
  const idx = criteria.findIndex((c) => c.id === criterionId);
  return CRITERION_COLORS[idx % CRITERION_COLORS.length] ?? 'purple';
}

export const HIGHLIGHT_STYLES: Record<HighlightColor, { bg: string; border: string }> = {
  purple: { bg: 'bg-purple-200/50', border: 'border-purple-500' },
  yellow: { bg: 'bg-yellow-200/50', border: 'border-yellow-600' },
  green: { bg: 'bg-emerald-200/50', border: 'border-emerald-500' },
  cyan: { bg: 'bg-cyan-200/50', border: 'border-cyan-500' },
};

const COMMENT_HIGHLIGHT_CLASS = 'bg-slate-200/60 border-b-2 border-slate-400';

interface CharSegment {
  text: string;
  annotations: Annotation[];
  formats: TextFormat[];
}

function buildSegments(
  text: string,
  annotations: Annotation[],
  textFormats: TextFormat[],
): CharSegment[] {
  const sortedAnns = [...annotations].sort((a, b) => a.start_offset - b.start_offset);

  const breakpoints = new Set<number>([0, text.length]);
  for (const ann of sortedAnns) {
    breakpoints.add(Math.max(0, Math.min(text.length, ann.start_offset)));
    breakpoints.add(Math.max(0, Math.min(text.length, ann.end_offset)));
  }
  for (const tf of textFormats) {
    breakpoints.add(Math.max(0, Math.min(text.length, tf.start_offset)));
    breakpoints.add(Math.max(0, Math.min(text.length, tf.end_offset)));
  }

  const points = Array.from(breakpoints).sort((a, b) => a - b);
  const segments: CharSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const segStart = points[i];
    const segEnd = points[i + 1];
    if (segStart >= segEnd) continue;

    const segText = text.slice(segStart, segEnd);
    const activeAnns = sortedAnns.filter(
      (a) => a.start_offset <= segStart && a.end_offset >= segEnd,
    );
    const activeFormats = textFormats.filter(
      (f) => f.start_offset <= segStart && f.end_offset >= segEnd,
    );

    segments.push({ text: segText, annotations: activeAnns, formats: activeFormats });
  }

  return segments;
}

function getFormattingStyle(anns: Annotation[], formats: TextFormat[]): React.CSSProperties {
  const style: React.CSSProperties = {};
  const hasBold = anns.some((a) => a.format_bold) || formats.some((f) => f.format_bold);
  const hasItalic = anns.some((a) => a.format_italic) || formats.some((f) => f.format_italic);
  const hasUnderline = anns.some((a) => a.format_underline) || formats.some((f) => f.format_underline);
  const hasStrikethrough =
    anns.some((a) => a.format_strikethrough) || formats.some((f) => f.format_strikethrough);
  const textColor = anns.find((a) => a.text_color)?.text_color;

  if (hasBold) style.fontWeight = 'bold';
  if (hasItalic) style.fontStyle = 'italic';
  if (hasUnderline) style.textDecoration = 'underline';
  else if (hasStrikethrough) style.textDecoration = 'line-through';
  if (textColor) style.color = textColor;

  return style;
}

function getSegmentClass(
  anns: Annotation[],
  criteria: RubricCriterion[],
  flashing: number | null,
): string {
  if (anns.length === 0) return '';

  const criterionAnns = anns.filter((a) => a.criterion_id !== null);
  const commentAnns = anns.filter(
    (a) => a.criterion_id === null && (a.has_text_comment || a.has_audio_comment),
  );

  if (criterionAnns.length > 0) {
    const colors = criterionAnns.map((a) => {
      if (a.highlight_color) {
        const style = HIGHLIGHT_STYLES[a.highlight_color];
        return style ?? HIGHLIGHT_STYLES.purple;
      }
      return HIGHLIGHT_STYLES[criterionColor(a.criterion_id, criteria)];
    });

    if (colors.length === 1) {
      const c = colors[0];
      const isFlashing = anns.some((a) => a.id === flashing);
      return `${c.bg} border-b-2 ${c.border} ${isFlashing ? 'ring-2 ring-amber-400 ring-offset-1 animate-pulse' : ''}`;
    }

    const gradientStops = colors
      .map((c) => `${c.bg.replace('bg-', '').replace('/50', '')}`)
      .join(', ');
    return `bg-gradient-to-r ${gradientStops} border-b-2 ${colors[0].border}`;
  }

  if (commentAnns.length > 0) {
    const isFlashing = anns.some((a) => a.id === flashing);
    return `${COMMENT_HIGHLIGHT_CLASS} ${isFlashing ? 'ring-2 ring-amber-400 ring-offset-1 animate-pulse' : ''}`;
  }

  return '';
}

export default function AnnotatableText({
  text,
  annotations,
  textFormats = [],
  criteria,
  onSelection,
  onAnnotationClick,
  flashAnnotationId,
  readOnly = false,
}: AnnotatableTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [flashing, setFlashing] = useState<number | null>(null);

  useEffect(() => {
    if (flashAnnotationId !== null) {
      setFlashing(flashAnnotationId);
      const timer = setTimeout(() => setFlashing(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [flashAnnotationId]);

  const handleMouseUp = useCallback(() => {
    if (readOnly) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      onSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      onSelection(null);
      return;
    }

    const fullText = containerRef.current.textContent ?? '';
    const preRange = document.createRange();
    preRange.selectNodeContents(containerRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedText = range.toString();
    const end = start + selectedText.length;

    if (selectedText.trim().length === 0) {
      onSelection(null);
      return;
    }

    onSelection({ start, end, text: selectedText });
  }, [onSelection, readOnly]);

  const segments = buildSegments(text, annotations, textFormats);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
    >
      {segments.map((seg, i) => {
        const hasContent = seg.annotations.length > 0 || seg.formats.length > 0;
        if (!hasContent) {
          return <span key={i}>{seg.text}</span>;
        }

        const clickAnn =
          seg.annotations.find((a) => a.criterion_id !== null) ??
          seg.annotations.find((a) => a.has_text_comment || a.has_audio_comment) ??
          seg.annotations[0];
        const isClickable =
          readOnly ||
          seg.annotations.some(
            (a) => a.criterion_id !== null || a.has_text_comment || a.has_audio_comment,
          );
        const segClass = getSegmentClass(seg.annotations, criteria, flashing);
        const formatStyle = getFormattingStyle(seg.annotations, seg.formats);

        const commentAnns = seg.annotations.filter(
          (a) => a.has_text_comment || a.has_audio_comment,
        );

        return (
          <span
            key={i}
            className={`relative rounded px-0.5 transition-all duration-300 ${segClass} ${
              isClickable ? 'cursor-pointer' : ''
            }`}
            style={formatStyle}
            title={clickAnn?.criterion_name ?? undefined}
            onClick={() => {
              if (isClickable && clickAnn) onAnnotationClick(clickAnn.id);
            }}
          >
            {seg.text}
            {commentAnns.length > 0 && (
              <span className="ml-0.5 inline-flex items-center gap-0.5 align-middle">
                {commentAnns.map((ann) => (
                  <span
                    key={ann.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnnotationClick(ann.id);
                    }}
                    className="relative z-10 inline-flex cursor-pointer items-center rounded p-0.5 transition hover:bg-white/80"
                    title={ann.criterion_name ?? 'Comment'}
                  >
                    {ann.has_text_comment && (
                      <MessageSquare size={11} className="text-slate-700" />
                    )}
                    {ann.has_audio_comment && !ann.has_text_comment && (
                      <AudioLines size={11} className="text-slate-700" />
                    )}
                  </span>
                ))}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
