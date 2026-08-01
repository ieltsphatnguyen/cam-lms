import { useState, useEffect } from 'react';
import { Layers, Eye, FileText, Mic, Shuffle, Tag } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuestionPreview from '@/components/questions/QuestionPreview';
import {
  fetchTemplateQuestions,
  fetchTemplateRandomRules,
  canonicalTypeRank,
} from '@/lib/templates';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type { Question, QuestionWithDetails, RandomQuestionRule } from '@/types/database';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  templateId: number;
  templateName: string;
}

type PreviewItem =
  | { kind: 'question'; data: QuestionWithDetails }
  | { kind: 'rule'; data: RandomQuestionRule };

export default function TemplatePreview({
  isOpen,
  onClose,
  templateId,
  templateName,
}: Props) {
  const [questions, setQuestions] = useState<QuestionWithDetails[]>([]);
  const [rules, setRules] = useState<RandomQuestionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const [previewTypeName, setPreviewTypeName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      fetchTemplateQuestions(templateId),
      fetchTemplateRandomRules(templateId),
    ])
      .then(([qData, rData]) => {
        setQuestions(qData);
        setRules(rData);
      })
      .catch(() => {
        setQuestions([]);
        setRules([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, templateId]);

  function handlePreviewQ(q: QuestionWithDetails) {
    setPreviewQ(q);
    setPreviewTypeName(q.type_name);
  }

  // Build combined list sorted by canonical type rank
  const combined: PreviewItem[] = [
    ...questions.map((q) => ({ kind: 'question' as const, data: q })),
    ...rules.map((r) => ({ kind: 'rule' as const, data: r })),
  ];
  combined.sort((a, b) => {
    const rankA =
      a.kind === 'question'
        ? canonicalTypeRank(a.data.type_id)
        : canonicalTypeRank(a.data.question_type_id);
    const rankB =
      b.kind === 'question'
        ? canonicalTypeRank(b.data.type_id)
        : canonicalTypeRank(b.data.question_type_id);
    return rankA - rankB;
  });

  return (
    <>
      <Modal
        isOpen={isOpen && previewQ === null}
        onClose={onClose}
        title={`Preview: ${templateName}`}
        size="lg"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="md" />
          </div>
        ) : combined.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            This preset has no questions or rules.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">
                {questions.length} question{questions.length !== 1 ? 's' : ''}
                {rules.length > 0 &&
                  ` + ${rules.length} random rule${rules.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {combined.map((item, idx) => {
              if (item.kind === 'question') {
                const q = item.data;
                return (
                  <div
                    key={`q-${q.id}`}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-semibold text-blue-700">
                        {idx + 1}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {q.type_name}
                        </span>
                        {q.response_type === 'audio' ? (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <Mic size={10} /> Audio
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-xs text-slate-400">
                            <FileText size={10} /> Text
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handlePreviewQ(q)}
                        className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Eye size={13} />
                        Preview
                      </button>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">
                      {q.content}
                    </p>
                    {q.description && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-400">
                        {q.description}
                      </p>
                    )}
                  </div>
                );
              } else {
                const r = item.data;
                const typeName =
                  r.question_type_id === QUESTION_TYPE_IDS.WRITING_TASK_1
                    ? 'Writing Task 1'
                    : r.question_type_id === QUESTION_TYPE_IDS.WRITING_TASK_2
                      ? 'Writing Task 2'
                      : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_1
                        ? 'Speaking Part 1'
                        : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2
                          ? 'Speaking Part 2'
                          : r.question_type_id === QUESTION_TYPE_IDS.SPEAKING_PART_3
                            ? 'Speaking Part 3'
                            : r.question_type_id === QUESTION_TYPE_IDS.EXTRA_HOMEWORK
                              ? 'Extra Homework'
                              : 'Custom Question';
                return (
                  <div
                    key={`r-${r.id}`}
                    className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-xs font-semibold text-amber-700">
                        {idx + 1}
                      </span>
                      <Shuffle size={14} className="text-amber-500" />
                      <span className="text-sm font-semibold text-amber-800">
                        Random {typeName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.response_type === 'audio' ? (
                        <span className="flex items-center gap-0.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Mic size={10} /> Audio
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <FileText size={10} /> Text
                        </span>
                      )}
                      {r.category && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {r.category}
                        </span>
                      )}
                      {r.tags && r.tags.length > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Tag size={10} />
                          {r.tags.join(', ')}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-amber-600">
                      Dynamic placeholder — a matching question will be
                      randomly selected when creating an Assignment.
                    </p>
                  </div>
                );
              }
            })}
          </div>
        )}
      </Modal>

      {/* Individual question preview — layered on top */}
      <Modal
        isOpen={previewQ !== null}
        onClose={() => {
          setPreviewQ(null);
        }}
        title="Question Preview"
        size="lg"
      >
        {previewQ && (
          <QuestionPreview question={previewQ} typeName={previewTypeName} />
        )}
      </Modal>
    </>
  );
}
