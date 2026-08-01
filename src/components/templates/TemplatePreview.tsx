import { useState, useEffect } from 'react';
import { Layers, Eye, FileText, Mic } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuestionPreview from '@/components/questions/QuestionPreview';
import { fetchTemplateQuestions } from '@/lib/templates';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type { Question, QuestionWithDetails } from '@/types/database';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  templateId: number;
  templateName: string;
}

export default function TemplatePreview({
  isOpen,
  onClose,
  templateId,
  templateName,
}: Props) {
  const [questions, setQuestions] = useState<QuestionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const [previewTypeName, setPreviewTypeName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchTemplateQuestions(templateId)
      .then((data) => setQuestions(data))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [isOpen, templateId]);

  function handlePreviewQ(q: QuestionWithDetails) {
    setPreviewQ(q);
    setPreviewTypeName(q.type_name);
  }

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
        ) : questions.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            This template has no questions.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers size={16} className="text-slate-500" />
              <span className="text-sm font-medium text-slate-700">
                {questions.length} question{questions.length !== 1 ? 's' : ''}
              </span>
            </div>

            {questions.map((q, idx) => (
              <div
                key={q.id}
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
            ))}
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
