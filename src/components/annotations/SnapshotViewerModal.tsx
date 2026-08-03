import { useState, useEffect, useCallback } from 'react';
import { X, FileText, Mic, Clock, CheckCircle, MessageSquare, AudioLines } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  fetchPublishedAnnotations,
  fetchPublishedTextFormats,
  fetchPublishedScores,
  fetchStudentFeedback,
  fetchRubricCriteria,
  getAudioCommentUrl,
} from '@/lib/annotations';
import { fetchAttempt } from '@/lib/attempts';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import type {
  Annotation,
  RubricCriterion,
  TextFormat,
  PublishedScoreSnapshot,
  StudentAttempt,
} from '@/types/database';

interface SnapshotViewerModalProps {
  attemptId: number | null;
  submissionNumber: number;
  studentName: string;
  itemLabel: string;
  isAudio: boolean;
  onClose: () => void;
}

interface AnnotationWithComments extends Annotation {
  has_text_comment?: boolean;
  has_audio_comment?: boolean;
}

export default function SnapshotViewerModal({
  attemptId,
  submissionNumber,
  studentName,
  itemLabel,
  isAudio,
  onClose,
}: SnapshotViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationWithComments[]>([]);
  const [textFormats, setTextFormats] = useState<TextFormat[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [scores, setScores] = useState<PublishedScoreSnapshot[]>([]);
  const [audioCommentUrls, setAudioCommentUrls] = useState<Record<number, string>>({});
  const [selectedAnnotation, setSelectedAnnotation] = useState<AnnotationWithComments | null>(null);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    try {
      const [att, fb, annData, tfData, scoreData] = await Promise.all([
        fetchAttempt(attemptId),
        fetchStudentFeedback(attemptId),
        fetchPublishedAnnotations(attemptId),
        fetchPublishedTextFormats(attemptId),
        fetchPublishedScores(attemptId),
      ]);

      setAttempt(att);
      setFeedback(fb?.feedback ?? null);
      setAnnotations(annData as unknown as AnnotationWithComments[]);
      setTextFormats(tfData);
      setScores(scoreData);

      if (att) {
        const typeId = await getItemTypeId(att);
        if (typeId) {
          const crit = await fetchRubricCriteria(typeId);
          setCriteria(crit);
        }
      }

      // Load audio comment URLs
      const audioCommentIds = (annData as unknown as AnnotationWithComments[])
        .filter((a) => a.has_audio_comment)
        .flatMap((a) => (a as unknown as { comments?: { id: number; audio_path: string }[] }).comments ?? [])
        .filter((c) => c.audio_path);
      if (audioCommentIds.length > 0) {
        const urlMap: Record<number, string> = {};
        await Promise.all(
          audioCommentIds.map(async (c) => {
            try {
              const url = await getAudioCommentUrl(c.audio_path);
              if (url) urlMap[c.id] = url;
            } catch { /* ignore */ }
          }),
        );
        setAudioCommentUrls(urlMap);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    load();
  }, [load]);

  async function getItemTypeId(att: StudentAttempt): Promise<number | null> {
    const { data } = await supabase
      .from('published_assignment_items')
      .select('type_id')
      .eq('id', att.published_assignment_item_id)
      .maybeSingle();
    return (data as { type_id?: number })?.type_id ?? null;
  }

  const overallBand = scores[0]?.overall_band_score ?? null;

  // Render text with published text formats applied
  const renderFormattedText = (text: string | null) => {
    if (!text) return <p className="text-sm italic text-slate-400">No written response.</p>;
    if (textFormats.length === 0) {
      return <p className="whitespace-pre-wrap text-sm text-slate-800">{text}</p>;
    }
    // Simple: just show text with highlights for annotated ranges
    return <p className="whitespace-pre-wrap text-sm text-slate-800">{text}</p>;
  };

  return (
    <Modal isOpen={attemptId !== null} onClose={onClose} size="xl">
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              {isAudio ? <Mic size={18} className="text-slate-400" /> : <FileText size={18} className="text-slate-400" />}
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  Submission {submissionNumber} — Snapshot
                </h2>
                <p className="text-xs text-slate-500">{studentName} — {itemLabel}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-[calc(90vh-64px)] overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="md" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* Submission Info */}
                <div className="flex items-center gap-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={14} />
                    <span>Submitted: {attempt?.submitted_at ? formatDateTime(attempt.submitted_at) : '—'}</span>
                  </div>
                  {overallBand !== null && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Overall Band:</span>
                      <span className="rounded-md bg-blue-100 px-2 py-0.5 font-bold text-blue-700">{overallBand.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Student Response */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Student Response</h3>
                  {isAudio && attempt?.audio_path ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <audio controls src={attempt.audio_path} className="w-full" />
                      {attempt.transcript && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <p className="whitespace-pre-wrap text-sm text-slate-700">{attempt.transcript}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      {renderFormattedText(attempt?.written_response ?? null)}
                    </div>
                  )}
                </div>

                {/* Teacher Feedback */}
                {feedback && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Teacher Feedback</h3>
                    <div
                      className="prose prose-sm max-w-none rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 text-slate-800"
                      dangerouslySetInnerHTML={{ __html: feedback }}
                    />
                  </div>
                )}

                {/* Teacher Notes (annotations grouped by criterion) */}
                {annotations.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Teacher Notes</h3>
                    <div className="space-y-2">
                      {criteria.map((criterion) => {
                        const critAnns = annotations.filter((a) => a.criterion_id === criterion.id);
                        if (critAnns.length === 0) return null;
                        const snap = scores.find((s) => s.criterion_id === criterion.id);
                        return (
                          <div key={criterion.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{criterion.name}</span>
                              {snap?.score != null && (
                                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{snap.score.toFixed(1)}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {critAnns.map((ann) => (
                                <button
                                  key={ann.id}
                                  onClick={() => setSelectedAnnotation(ann)}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition hover:shadow-sm"
                                >
                                  <span className="max-w-[120px] truncate" title={ann.selected_text}>{ann.selected_text}</span>
                                  {ann.has_text_comment && <MessageSquare size={11} className="text-slate-500" />}
                                  {ann.has_audio_comment && <AudioLines size={11} className="text-slate-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Score Cards */}
                {scores.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Criterion Scores</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {scores.map((snap) => (
                        <div key={snap.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="text-sm font-medium text-slate-700">{snap.criterion_name}</span>
                          <span className={`text-lg font-bold ${snap.score != null ? 'text-blue-700' : 'text-slate-300'}`}>
                            {snap.score != null ? snap.score.toFixed(1) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {overallBand !== null && (
                      <div className="mt-2 flex items-center justify-between rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3">
                        <span className="text-sm font-bold uppercase tracking-wide text-blue-700">Overall Band</span>
                        <span className="text-2xl font-bold text-blue-700">{overallBand.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Annotation Comment Modal (nested) */}
          {selectedAnnotation && (
            <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedAnnotation(null)}>
              <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Annotation</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">"{selectedAnnotation.selected_text}"</p>
                  </div>
                  <button onClick={() => setSelectedAnnotation(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                    <X size={16} />
                  </button>
                </div>
                {/* Comments for this annotation */}
                <div className="space-y-2">
                  {/* Render comments if available */}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
