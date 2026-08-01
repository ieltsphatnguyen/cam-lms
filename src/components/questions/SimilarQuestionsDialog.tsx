import { useState } from 'react';
import { Copy, Eye, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import QuestionPreview from '@/components/questions/QuestionPreview';
import { fetchQuestion, duplicateQuestion } from '@/lib/questions';
import type { SimilarQuestion, Question } from '@/types/database';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  similarQuestions: SimilarQuestion[];
  currentUserId: string;
  onDuplicate: (question: Question) => void;
}

export default function SimilarQuestionsDialog({
  isOpen,
  onClose,
  similarQuestions,
  currentUserId,
  onDuplicate,
}: Props) {
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<Question | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function handlePreview(id: number) {
    setPreviewId(id);
    setLoadingPreview(true);
    setPreviewData(null);
    try {
      const q = await fetchQuestion(id);
      setPreviewData(q);
    } catch {
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleDuplicate(id: number) {
    try {
      const q = await fetchQuestion(id);
      if (!q) return;
      const dup = await duplicateQuestion(q, currentUserId);
      onDuplicate(dup);
      setActionMsg(`Duplicated the question — it's now in your library.`);
      setTimeout(() => setActionMsg(null), 3000);
    } catch {
      setActionMsg('Failed to duplicate. Please try again.');
      setTimeout(() => setActionMsg(null), 3000);
    }
  }

  return (
    <>
      {/* Main similar questions dialog */}
      <Modal
        isOpen={isOpen && previewId === null}
        onClose={onClose}
        title="Similar Questions"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            We found {similarQuestions.length} similar question
            {similarQuestions.length !== 1 ? 's' : ''} in the Question Bank.
            You can duplicate one of these, or continue writing your own.
          </p>

          {actionMsg && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              {actionMsg}
            </div>
          )}

          {similarQuestions.map((sq) => (
            <div
              key={sq.id}
              className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm font-medium text-slate-800">
                    {sq.content}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {sq.type_name}
                    </span>
                    {sq.category && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {sq.category}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      by {sq.owner_display_name}
                    </span>
                    <span className="text-xs text-slate-400">
                      · {Math.round(sq.sim * 100)}% match
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Eye size={13} />}
                  onClick={() => handlePreview(sq.id)}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy size={13} />}
                  onClick={() => handleDuplicate(sq.id)}
                >
                  Duplicate
                </Button>
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose} icon={<X size={14} />}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Preview modal — layered on top, does NOT close the main dialog */}
      <Modal
        isOpen={previewId !== null}
        onClose={() => {
          setPreviewId(null);
          setPreviewData(null);
        }}
        title="Question Preview"
        size="lg"
      >
        {loadingPreview ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-400">
            Loading preview...
          </div>
        ) : previewData ? (
          <QuestionPreview
            question={previewData}
            typeName={
              similarQuestions.find((sq) => sq.id === previewId)?.type_name ??
              'Unknown'
            }
          />
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">
            Could not load preview.
          </div>
        )}
      </Modal>
    </>
  );
}
