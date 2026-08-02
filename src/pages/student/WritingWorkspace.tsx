import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Send, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { submitAttempt, countWords } from '@/lib/attempts';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type { StartAttemptResult } from '@/types/database';

interface Props {
  attempt: StartAttemptResult;
  onComplete: () => void;
}

export default function WritingWorkspace({ attempt, onComplete }: Props) {
  const [text, setText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const endTimeRef = useRef<number | null>(null);

  const { item, attempt_id, time_limit_seconds, started_at } = attempt;
  const attemptIdRef = useRef(attempt_id);
  const textRef = useRef(text);
  textRef.current = text;

  // Refresh / page unload handler — terminates the attempt immediately
  useEffect(() => {
    function handleBeforeUnload() {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      try {
        fetch(`${supabaseUrl}/rest/v1/rpc/submit_attempt`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            p_attempt_id: attemptIdRef.current,
            p_written_response: textRef.current,
            p_audio_path: null,
            p_word_count: countWords(textRef.current),
            p_status: 'auto_submitted',
          }),
        }).catch(() => {});
      } catch {
        // Best effort
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Calculate end time from server-set started_at
  useEffect(() => {
    if (time_limit_seconds) {
      const startTime = new Date(started_at).getTime();
      endTimeRef.current = startTime + time_limit_seconds * 1000;
      const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }
  }, [time_limit_seconds, started_at]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleAutoSubmit();
      return;
    }
    const interval = setInterval(() => {
      if (endTimeRef.current) {
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          handleAutoSubmit();
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const doSubmit = useCallback(
    async (status: 'submitted' | 'auto_submitted') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await submitAttempt(attempt_id, {
          written_response: text,
          word_count: countWords(text),
          status,
        });
        onComplete();
      } catch {
        setError('Failed to submit. Please try again.');
        submittedRef.current = false;
        setSubmitting(false);
      }
    },
    [attempt_id, text, onComplete],
  );

  function handleAutoSubmit() {
    doSubmit('auto_submitted');
  }

  function handleSubmit() {
    doSubmit('submitted');
  }

  const wordCount = countWords(text);
  const hasTimeLimit = time_limit_seconds !== null && secondsLeft !== null;
  const timeUp = hasTimeLimit && secondsLeft <= 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const isTask1 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_1;
  const isTask2 = item.type_id === QUESTION_TYPE_IDS.WRITING_TASK_2;
  const isCustom = item.type_id === QUESTION_TYPE_IDS.CUSTOM;
  const isIELTSWriting = isTask1 || isTask2;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {item.type_name}
            {item.custom_type_name ? ` — ${item.custom_type_name}` : ''}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          {hasTimeLimit && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold ${
                secondsLeft <= 30
                  ? 'bg-red-50 text-red-600'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Clock size={16} />
              {formatTime(secondsLeft)}
            </div>
          )}
          <Button
            onClick={handleSubmit}
            disabled={submitting || timeUp}
            loading={submitting}
            icon={<Send size={16} />}
            size="sm"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* Two-column workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: prompt (35-40%) */}
        <div className="w-[38%] overflow-y-auto border-r border-slate-200 bg-slate-50 p-6">
          <div className="space-y-4">
            {isIELTSWriting ? (
              /* Full IELTS Writing prompt as published */
              <div className="space-y-3">
                <h3 className="text-base font-bold text-slate-800">
                  Task {isTask1 ? '1' : '2'}
                </h3>
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
              /* Non-IELTS-writing: show custom instructions + prompt */
              <>
                {item.custom_instructions && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Instructions
                    </h3>
                    <p className="text-sm text-slate-600">{item.custom_instructions}</p>
                  </div>
                )}

                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Prompt
                  </h3>
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

                {item.ielts_band && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Target Band
                    </h3>
                    <p className="text-sm text-slate-600">{item.ielts_band}</p>
                  </div>
                )}

                {isCustom && (
                  <div>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Word Count
                    </h3>
                    <p className="text-sm text-slate-600">
                      Aim for at least 150 words (Task 1) or 250 words (Task 2).
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column: editor (60-65%) */}
        <div className="flex w-[62%] flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-2">
            <span className="text-xs text-slate-400">Your response</span>
            <span
              className={`text-xs font-medium ${
                wordCount >= 250
                  ? 'text-emerald-600'
                  : wordCount >= 150
                    ? 'text-blue-600'
                    : 'text-slate-400'
              }`}
            >
              {wordCount} words
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting || timeUp}
            placeholder="Start writing your response here..."
            className="flex-1 resize-none border-0 p-6 text-sm text-slate-800 outline-none placeholder:text-slate-300 disabled:bg-slate-50"
            autoFocus
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
          />
        </div>
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-700 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
