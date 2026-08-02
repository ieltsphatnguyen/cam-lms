import { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Mic, Square, Send, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { submitAttempt } from '@/lib/attempts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type { StartAttemptResult } from '@/types/database';

interface Props {
  attempt: StartAttemptResult;
  onComplete: () => void;
}

type Phase = 'preparation' | 'speaking' | 'submitted';

export default function SpeakingWorkspace({ attempt, onComplete }: Props) {
  const { profile } = useAuth();
  const { item, attempt_id, started_at } = attempt;

  // Determine speaking part type
  const isPart1 = item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_1;
  const isPart2 = item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2;
  const isPart3 = item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_3;
  const isCustomSpeaking =
    item.type_id === QUESTION_TYPE_IDS.CUSTOM && item.response_type === 'audio';

  // Part 2 and Custom Speaking use prep + recording timers.
  // Part 1, Part 3, and Homework Speaking use time_limit_seconds only.
  const hasPrepPhase = isPart2 || isCustomSpeaking;

  const prepSeconds = item.prep_time_seconds ?? 60;
  const recordingSeconds = item.recording_time_seconds ?? 120;
  const timeLimitSeconds = attempt.time_limit_seconds ?? 180;

  const speakSeconds = hasPrepPhase ? recordingSeconds : timeLimitSeconds;

  const [phase, setPhase] = useState<Phase>(hasPrepPhase ? 'preparation' : 'speaking');
  const [prepSecondsLeft, setPrepSecondsLeft] = useState(prepSeconds);
  const [speakSecondsLeft, setSpeakSecondsLeft] = useState(speakSeconds);
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const submittedRef = useRef(false);
  const prepEndRef = useRef<number>(0);
  const speakEndRef = useRef<number>(0);
  const attemptIdRef = useRef<number>(attempt_id);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Initialize timers
  useEffect(() => {
    if (!hasPrepPhase) {
      startSpeaking();
      return;
    }
    const startTime = new Date(started_at).getTime();
    prepEndRef.current = startTime + prepSeconds * 1000;
    const remaining = Math.max(0, Math.round((prepEndRef.current - Date.now()) / 1000));
    setPrepSecondsLeft(remaining);
  }, [started_at, hasPrepPhase, prepSeconds]);

  // Prep countdown
  useEffect(() => {
    if (phase !== 'preparation') return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((prepEndRef.current - Date.now()) / 1000));
      setPrepSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        startSpeaking();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  // Speaking countdown
  useEffect(() => {
    if (phase !== 'speaking') return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((speakEndRef.current - Date.now()) / 1000));
      setSpeakSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        stopRecordingAndSubmit('auto_submitted');
      }
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  // Refresh / page unload handler — terminates the attempt immediately
  useEffect(() => {
    function handleBeforeUnload() {
      if (submittedRef.current) return;
      submittedRef.current = true;
      // Stop recording synchronously
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Use fetch with keepalive to submit (sendBeacon can't set auth headers)
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
            p_written_response: null,
            p_audio_path: null,
            p_word_count: null,
            p_status: 'auto_submitted',
          }),
        }).catch(() => {});
      } catch {
        // Best effort — can't do anything more during unload
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Audio level monitor
  function startAudioMonitor(stream: MediaStream) {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setAudioLevel(Math.min(100, (avg / 128) * 100));
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopAudioMonitor() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }

  const startSpeaking = useCallback(async () => {
    setPhase('speaking');
    // Recording timer always starts with the full configured duration
    speakEndRef.current = Date.now() + speakSeconds * 1000;
    setSpeakSecondsLeft(speakSeconds);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startAudioMonitor(stream);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError('Failed to access microphone. Please check permissions.');
      setPhase('preparation');
    }
  }, [speakSeconds]);

  function startRecordingEarly() {
    startSpeaking();
  }

  async function uploadAudio(blob: Blob): Promise<string> {
    const fileName = `attempt-${attempt_id}-${Date.now()}.webm`;
    const userId = profile?.id;
    if (!userId) throw new Error('Not authenticated');
    // Upload to student-audio/{uid}/ path — matches storage RLS policy
    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(`student-audio/${userId}/${fileName}`, blob, {
        contentType: 'audio/webm',
      });

    if (uploadError) throw uploadError;
    return `student-audio/${userId}/${fileName}`;
  }

  const stopRecordingAndSubmit = useCallback(
    async (status: 'submitted' | 'auto_submitted') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);

      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAudioMonitor();
      setRecording(false);
      setPhase('submitted');

      // Wait for the onstop callback to flush all chunks
      setTimeout(async () => {
        try {
          const blob =
            chunksRef.current.length > 0
              ? new Blob(chunksRef.current, { type: 'audio/webm' })
              : null;

          let audioPath: string | null = null;
          if (blob && blob.size > 0) {
            audioPath = await uploadAudio(blob);
          }

          await submitAttempt(attempt_id, {
            audio_path: audioPath,
            status,
          });
          onComplete();
        } catch (e) {
          setError(
            e instanceof Error
              ? `Failed to submit: ${e.message}`
              : 'Failed to submit recording. Please try again.',
          );
          // Allow retry — do NOT set submittedRef to true again
          submittedRef.current = false;
          setSubmitting(false);
        }
      }, 500);
    },
    [attempt_id, onComplete, profile?.id],
  );

  function handleStopAndSubmit() {
    stopRecordingAndSubmit('submitted');
  }

  function handleRetrySubmit() {
    setError(null);
    stopRecordingAndSubmit('submitted');
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAudioMonitor();
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Part 3 questions from category_secondary
  const part3Questions = item.category_secondary
    ? item.category_secondary.split('\n').filter(Boolean)
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h2 className="text-sm font-semibold text-slate-700">
          {item.type_name}
          {item.custom_type_name ? ` — ${item.custom_type_name}` : ''}
        </h2>
        <div className="flex items-center gap-4">
          {phase === 'preparation' && hasPrepPhase && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm font-mono font-semibold text-amber-700">
              <Clock size={16} />
              Prep: {formatTime(prepSecondsLeft)}
            </div>
          )}
          {phase === 'speaking' && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold ${
                speakSecondsLeft <= 10
                  ? 'bg-red-50 text-red-600'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Clock size={16} />
              {formatTime(speakSecondsLeft)}
            </div>
          )}
          {phase === 'speaking' && recording && (
            <Button
              onClick={handleStopAndSubmit}
              disabled={submitting}
              loading={submitting}
              icon={<Send size={16} />}
              size="sm"
            >
              Stop & Submit
            </Button>
          )}
        </div>
      </div>

      {/* Two-column workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: prompt (35-40%) */}
        <div className="w-[38%] overflow-y-auto border-r border-slate-200 bg-slate-50 p-6">
          <div className="space-y-4">
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
                {isPart2 ? 'Cue Card' : 'Prompt'}
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

            {isPart2 && part3Questions.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Part 3 Questions
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {part3Questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {phase === 'preparation' && hasPrepPhase && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Preparation Notes
                </h3>
                <p className="text-xs text-slate-400">
                  Use this time to prepare. You may take notes on paper.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: recorder (60-65%) */}
        <div className="flex w-[62%] flex-col items-center justify-center bg-white p-6">
          {phase === 'preparation' && hasPrepPhase && (
            <div className="text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50">
                <Clock size={36} className="text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                Preparation Time
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Recording will start automatically in {formatTime(prepSecondsLeft)}
              </p>
              <Button
                onClick={startRecordingEarly}
                className="mt-6"
                icon={<Mic size={16} />}
              >
                Start Recording Early
              </Button>
            </div>
          )}

          {phase === 'speaking' && recording && (
            <div className="flex flex-col items-center">
              <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full bg-red-100"
                  style={{
                    transform: `scale(${1 + audioLevel / 200})`,
                    opacity: 0.3 + audioLevel / 200,
                  }}
                />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-500">
                  <Mic size={32} className="text-white" />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-700">Recording...</p>
              <p className="mt-1 text-xs text-slate-400">
                Speak clearly. Press Stop & Submit when done.
              </p>

              {/* Audio level bar */}
              <div className="mt-4 w-48">
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {phase === 'submitted' && !error && (
            <div className="text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
                <Square size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                Submitting...
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Uploading your recording.
              </p>
            </div>
          )}

          {error && (
            <div className="text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
                <AlertCircle size={32} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                Submission Failed
              </h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">{error}</p>
              <Button
                onClick={handleRetrySubmit}
                className="mt-6"
                icon={<Send size={16} />}
              >
                Retry Submit
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
