import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, Mic, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/supabase';
import { fetchAttemptForItem } from '@/lib/attempts';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import { formatDateTime } from '@/lib/format';
import type { StudentAssignmentItem, StudentAttempt } from '@/types/database';

interface Props {
  item: StudentAssignmentItem;
  onBack: () => void;
}

export default function SubmissionReview({ item, onBack }: Props) {
  const [attempt, setAttempt] = useState<StudentAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

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
        if (!cancelled) {
          setAttempt(data);
          if (data?.audio_path) {
            const { data: urlData } = supabase.storage
              .from('question-images')
              .getPublicUrl(data.audio_path);
            if (!cancelled) setAudioUrl(urlData.publicUrl);
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
  }, [item.id]);

  const part3Questions = item.category_secondary
    ? item.category_secondary.split('\n').filter(Boolean)
    : [];

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
                      <p className="text-sm text-slate-600">
                        Write about the following topic:
                      </p>
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
                        Give reasons for your answer and include any relevant examples
                        from your own knowledge or experience.
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
                        <p className="text-sm text-slate-600">
                          {item.custom_instructions}
                        </p>
                      </div>
                    )}
                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {isPart2 ? 'Cue Card' : 'Prompt'}
                      </h4>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">
                        {item.content}
                      </p>
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
                      <p className="text-sm text-slate-400 italic">
                        Audio unavailable.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attempt?.word_count !== null &&
                      attempt?.word_count !== undefined && (
                        <span className="text-xs font-medium text-slate-500">
                          {attempt.word_count} words
                        </span>
                      )}
                    <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">
                      {attempt?.written_response || (
                        <span className="text-slate-400 italic">
                          No written response submitted.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Waiting for grading footer */}
      {!loading && (
        <div className="border-t border-slate-200 bg-amber-50 px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 text-sm font-medium text-amber-700">
            <Clock size={16} />
            Waiting for grading...
          </div>
        </div>
      )}
    </div>
  );
}
