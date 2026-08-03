import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Mic, Clock, CheckCircle2, MessageSquare, AudioLines } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { fetchAttemptForItem } from '@/lib/attempts';
import { fetchStudentFeedback, getAudioCommentUrl, fetchPublishedAnnotations, fetchPublishedTextFormats, fetchPublishedScores, fetchRubricCriteria } from '@/lib/annotations';
import { getAudioUrl } from '@/lib/grading';
import CommentModal, { type CommentModalAnnotation } from '@/components/annotations/CommentModal';
import AnnotatableText from '@/components/annotations/AnnotatableText';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import { formatDateTime } from '@/lib/format';
import type {
  StudentAssignmentItem,
  StudentAttempt,
  Annotation,
  AnnotationComment,
  RubricCriterion,
  TextFormat,
  PublishedScoreSnapshot,
} from '@/types/database';

interface Props {
  item: StudentAssignmentItem;
  onBack: () => void;
}

export default function SubmissionReview({ item, onBack }: Props) {
  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [feedbackPublished, setFeedbackPublished] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [textFormats, setTextFormats] = useState<TextFormat[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [publishedScores, setPublishedScores] = useState<PublishedScoreSnapshot[]>([]);
  const [audioCommentUrls, setAudioCommentUrls] = useState<Record<number, string>>({});
  const [selectedAnnotation, setSelectedAnnotation] = useState<CommentModalAnnotation | null>(null);

  const isSpeaking = item.response_type === 'audio';
  const isTask1 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_1;
  const isTask2 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_2;
  const isIELTSWriting = isTask1 || isTask2;
  const isPart2 = item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchAttemptForItem(item.id);
        if (cancelled) return;
        setAttempt(data);

        if (data?.audio_path) {
          const url = await getAudioUrl(data.audio_path);
          if (!cancelled && url) setAudioUrl(url);
        }

        if (data) {
          try {
            const fb = await fetchStudentFeedback(data.id);
            if (cancelled) return;
            if (fb) {
              setFeedback(fb.feedback);
              setTranscript(fb.transcript);
              setFeedbackPublished(fb.feedback_published);
            }
          } catch (err) {
            console.error('[SubmissionReview] fetchStudentFeedback failed:', err);
          }

          try {
            const [annData, tfData, scoreData] = await Promise.all([
              fetchPublishedAnnotations(data.id),
              fetchPublishedTextFormats(data.id),
              fetchPublishedScores(data.id),
            ]);
            if (cancelled) return;
            const anns = annData as unknown as Annotation[];
            setAnnotations(anns);
            setTextFormats(tfData);
            setPublishedScores(scoreData);

            const critData = await fetchRubricCriteria(item.type_id);
            if (!cancelled && critData) {
              setCriteria(critData as unknown as RubricCriterion[]);
            }

            const urls: Record<number, string> = {};
            for (const ann of anns) {
              for (const comment of ann.comments) {
                if (comment.type === 'audio' && comment.audio_path) {
                  const url = await getAudioCommentUrl(comment.audio_path);
                  if (url) urls[comment.id] = url;
                }
              }
            }
            if (!cancelled) setAudioCommentUrls(urls);
          } catch (err) {
            console.error('[SubmissionReview] fetchAnnotations failed:', err);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [item.id, item.type_id]);

  const part3Questions = item.category_secondary
    ? item.category_secondary.split('\n').filter(Boolean)
    : [];

  const handleAnnotationClick = (annotationId: number) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    setSelectedAnnotation({
      id: ann.id,
      selected_text: ann.selected_text,
      criterion_name: ann.criterion_name,
      comments: ann.comments,
    });
  };

  const renderAnnotatedText = (text: string) => (
    <AnnotatableText
      text={text}
      annotations={annotations}
      textFormats={textFormats}
      criteria={criteria}
      onSelection={() => {}}
      onAnnotationClick={handleAnnotationClick}
      flashAnnotationId={null}
      readOnly
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={16} />}
            onClick={onBack}
            size="sm"
          >
            Back to Assignment
          </Button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            {isSpeaking ? (
              <Mic size={18} className="text-slate-400" />
            ) : (
              <FileText size={18} className="text-slate-400" />
            )}
            <h2 className="text-sm font-semibold text-slate-700">
              {item.type_name}
              {item.custom_type_name ? ` — ${item.custom_type_name}` : ''}
            </h2>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              {/* Question section */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Question
                </h3>
                {isIELTSWriting ? (
                  <div className="space-y-3">
                    <h4 className="text-base font-bold text-slate-800">
                      Task {isTask1 ? '1' : '2'}
                    </h4>
                    <p className="text-sm text-slate-600">
                      You should spend about {isTask1 ? '20' : '40'} minutes on this task.
                    </p>
                    {isTask2 && (
                      <p className="text-sm text-slate-600">Write about the following topic:</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm font-medium text-slate-800">
                      {item.content}
                    </p>
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt="Task illustration"
                        className="w-full rounded-lg border border-slate-200"
                      />
                    )}
                    {isTask1 && (
                      <p className="text-sm text-slate-600">
                        Summarize the main features and make comparisons where relevant.
                      </p>
                    )}
                    {isTask2 && (
                      <p className="text-sm text-slate-600">
                        Give reasons for your answer and include any relevant examples from your own knowledge or experience.
                      </p>
                    )}
                    <p className="text-sm font-medium text-slate-700">
                      Write at least {isTask1 ? '150' : '250'} words.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {item.custom_instructions && (
                      <div>
                        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Instructions
                        </h4>
                        <p className="text-sm text-slate-600">{item.custom_instructions}</p>
                      </div>
                    )}
                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {isPart2 ? 'Cue Card' : 'Prompt'}
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{item.content}</p>
                    </div>
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt="Task illustration"
                        className="w-full rounded-lg border border-slate-200"
                      />
                    )}
                    {isPart2 && part3Questions.length > 0 && (
                      <div>
                        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Part 3 Questions
                        </h4>
                        <ul className="space-y-1.5 text-sm text-slate-600">
                          {part3Questions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Response section */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {isSpeaking ? 'Submitted Audio' : 'Submitted Essay'}
                  </h3>
                  {attempt?.submitted_at && (
                    <span className="text-xs text-slate-400">
                      Submitted {formatDateTime(attempt.submitted_at)}
                    </span>
                  )}
                </div>
                {isSpeaking ? (
                  <div>
                    {audioUrl ? (
                      <audio controls className="w-full">
                        <source src={audioUrl} type="audio/webm" />
                        Your browser does not support audio playback.
                      </audio>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Audio unavailable.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attempt?.word_count !== null && attempt?.word_count !== undefined && (
                      <span className="text-xs font-medium text-slate-500">
                        {attempt.word_count} words
                      </span>
                    )}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      {attempt?.written_response
                        ? feedbackPublished
                          ? renderAnnotatedText(attempt.written_response)
                          : attempt.written_response
                        : (
                          <span className="text-sm text-slate-400 italic">
                            No written response submitted.
                          </span>
                        )}
                    </div>
                  </div>
                )}
              </div>

              {/* Transcript section (for speaking with published transcript) */}
              {isSpeaking && transcript && feedbackPublished && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Teacher Transcript
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {renderAnnotatedText(transcript)}
                  </div>
                </div>
              )}

              {/* Teacher Feedback (always before scores) */}
              {feedbackPublished ? (
                <>
                  {/* Teacher Feedback */}
                  <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                        Teacher Feedback
                      </h3>
                    </div>
                    {feedback ? (
                      <div
                        className="prose prose-sm max-w-none text-slate-800"
                        dangerouslySetInnerHTML={{ __html: feedback }}
                      />
                    ) : (
                      <p className="text-sm text-slate-400 italic">No written feedback provided.</p>
                    )}
                  </div>

                  {/* Teacher Notes — criterion-grouped annotations with inline scores */}
                  {annotations.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Teacher Notes
                      </h3>
                      <div className="space-y-3">
                        {criteria.map((criterion) => {
                          const critAnnotations = annotations.filter(
                            (a) => a.criterion_id === criterion.id,
                          );
                          if (critAnnotations.length === 0) return null;
                          return (
                            <div key={criterion.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {criterion.name}
                                </span>
                                {(() => {
                                  const snap = publishedScores.find((s) => s.criterion_id === criterion.id);
                                  return snap?.score != null ? (
                                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                                      {snap.score.toFixed(1)}
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {critAnnotations.map((ann) => (
                                  <button
                                    key={ann.id}
                                    onClick={() => handleAnnotationClick(ann.id)}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:shadow-sm"
                                  >
                                    <span className="max-w-[120px] truncate" title={ann.selected_text}>
                                      {ann.selected_text}
                                    </span>
                                    {ann.has_text_comment && (
                                      <MessageSquare size={11} className="shrink-0 text-slate-500" />
                                    )}
                                    {ann.has_audio_comment && (
                                      <AudioLines size={11} className="shrink-0 text-slate-500" />
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Separator */}
                  <div className="border-t border-slate-200" />

                  {/* Overall Band */}
                  {(() => {
                    const overall = publishedScores[0]?.overall_band_score ?? null;
                    return (
                      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold uppercase tracking-wide text-blue-700">
                            Overall Band
                          </span>
                          <span className={`text-3xl font-bold ${overall != null ? 'text-blue-700' : 'text-slate-300'}`}>
                            {overall != null ? overall.toFixed(1) : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                    <Clock size={16} />
                    Waiting for grading...
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Comment Modal — read-only, opens when student clicks a highlight */}
      <CommentModal
        open={selectedAnnotation !== null}
        annotation={selectedAnnotation}
        initialMode="text"
        selectionRect={null}
        readOnly
        onClose={() => setSelectedAnnotation(null)}
        onSaveTextComment={async () => {}}
        onSaveAudioComment={async () => {}}
        onDeleteComment={async () => {}}
      />
    </div>
  );
}
