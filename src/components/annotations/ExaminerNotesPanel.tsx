import { useState, useCallback } from 'react';
import { X, GripVertical, MessageSquare, AudioLines } from 'lucide-react';
import type { Annotation, RubricCriterion, HighlightColor } from '@/types/database';
import { criterionColor } from './AnnotatableText';

// Displays annotations grouped by criterion.
// Annotations without a criterion are NOT shown here — they remain internal.
interface ExaminerNotesPanelProps {
  annotations: Annotation[];
  criteria: RubricCriterion[];
  onDeleteAnnotation: (annotationId: number) => void;
  onMoveAnnotation: (annotationId: number, targetCriterionId: number | null) => void;
  onAnnotationClick: (annotationId: number) => void;
}

const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

export default function ExaminerNotesPanel({
  annotations,
  criteria,
  onDeleteAnnotation,
  onMoveAnnotation,
  onAnnotationClick,
}: ExaminerNotesPanelProps) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverCriterion, setDragOverCriterion] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, annotationId: number) => {
    setDraggedId(annotationId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, criterionId: number | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCriterion(criterionId);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetCriterionId: number | null) => {
      e.preventDefault();
      setDragOverCriterion(null);
      if (draggedId !== null && targetCriterionId !== null) {
        onMoveAnnotation(draggedId, targetCriterionId);
      }
      setDraggedId(null);
    },
    [draggedId, onMoveAnnotation],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverCriterion(null);
  }, []);

  const renderTag = (ann: Annotation) => {
    const color = criterionColor(ann.criterion_id, criteria);
    return (
      <span
        key={ann.id}
        draggable
        onDragStart={(e) => handleDragStart(e, ann.id)}
        onDragEnd={handleDragEnd}
        onClick={() => onAnnotationClick(ann.id)}
        className={`group inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition hover:shadow-sm ${
          HIGHLIGHT_BG[color]
        } ${draggedId === ann.id ? 'opacity-40' : ''}`}
      >
        <GripVertical size={10} className="cursor-grab text-slate-400 opacity-0 group-hover:opacity-100" />
        <span className="max-w-[120px] truncate" title={ann.selected_text}>
          {ann.selected_text}
        </span>
        {ann.has_text_comment && (
          <MessageSquare size={11} className="shrink-0 text-slate-500" />
        )}
        {ann.has_audio_comment && (
          <AudioLines size={11} className="shrink-0 text-slate-500" />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteAnnotation(ann.id);
          }}
          className="ml-0.5 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-red-500"
        >
          <X size={11} />
        </button>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {criteria.map((criterion) => {
        const criterionAnnotations = annotations.filter(
          (a) => a.criterion_id === criterion.id,
        );
        const isDragOver = dragOverCriterion === criterion.id;
        return (
          <div
            key={criterion.id}
            onDragOver={(e) => handleDragOver(e, criterion.id)}
            onDrop={(e) => handleDrop(e, criterion.id)}
            className={`rounded-xl border p-3 transition ${
              isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {criterion.name}
              </span>
              <span className="text-xs text-slate-400">
                {criterionAnnotations.length} tag
                {criterionAnnotations.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {criterionAnnotations.map(renderTag)}
              {criterionAnnotations.length === 0 && (
                <span className="text-xs text-slate-300">No annotations yet</span>
              )}
            </div>
          </div>
        );
      })}
      {criteria.length === 0 && (
        <p className="text-xs text-slate-400">No criteria available.</p>
      )}
    </div>
  );
}
