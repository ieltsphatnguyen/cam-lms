import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, Clock, AlertCircle, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { StudentAssignmentItem } from '@/types/database';

interface Props {
  item: StudentAssignmentItem;
  onStart: () => void;
  onCancel: () => void;
  starting: boolean;
}

type MicState = 'unknown' | 'requesting' | 'granted' | 'denied';

export default function PreFlightCheck({ item, onStart, onCancel, starting }: Props) {
  const isSpeaking = item.response_type === 'audio';
  const [micState, setMicState] = useState<MicState>('unknown');
  const [micTestActive, setMicTestActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const [speakerTestDone, setSpeakerTestDone] = useState(false);

  const stopMicTest = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMicTestActive(false);
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => stopMicTest();
  }, [stopMicTest]);

  async function requestMicPermission() {
    setMicState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicState('granted');
    } catch {
      setMicState('denied');
    }
  }

  async function runMicTest() {
    if (micState !== 'granted' && micState !== 'requesting') {
      await requestMicPermission();
    }
    if (!streamRef.current) return;

    setMicTestActive(true);
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(streamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(100, (avg / 128) * 100));
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  function playSpeakerTest() {
    const osc = new AudioContext();
    const gain = osc.createGain();
    gain.gain.value = 0.1;
    const o = osc.createOscillator();
    o.frequency.value = 440;
    o.connect(gain);
    gain.connect(osc.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      osc.close();
    }, 500);
    setSpeakerTestDone(true);
  }

  const canStart = isSpeaking ? micState === 'granted' : true;

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
            {isSpeaking ? (
              <Mic size={24} className="text-blue-600" />
            ) : (
              <FileText size={24} className="text-blue-600" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isSpeaking ? 'Speaking Task' : 'Writing Task'}
            </h2>
            <p className="text-sm text-slate-500">
              {item.type_name}
              {item.custom_type_name ? ` — ${item.custom_type_name}` : ''}
            </p>
          </div>
        </div>

        {/* Time limit display */}
        {item.timed && item.time_limit && (
          <div className="mb-6 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <Clock size={18} className="text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Time limit: {item.time_limit}
              </p>
              <p className="text-xs text-amber-600">
                Your timer begins when you press Start.
              </p>
            </div>
          </div>
        )}

        {/* Speaking: microphone checks */}
        {isSpeaking && (
          <div className="mb-6 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                1. Microphone Permission
              </h3>
              {micState === 'unknown' && (
                <Button
                  variant="secondary"
                  icon={<Mic size={16} />}
                  onClick={requestMicPermission}
                >
                  Allow Microphone
                </Button>
              )}
              {micState === 'requesting' && (
                <p className="text-sm text-slate-400">Requesting permission...</p>
              )}
              {micState === 'granted' && (
                <p className="flex items-center gap-2 text-sm text-emerald-600">
                  <Mic size={16} /> Microphone access granted
                </p>
              )}
              {micState === 'denied' && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Microphone access denied. Please allow it in your browser settings.
                  </span>
                </div>
              )}
            </div>

            {micState === 'granted' && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  2. Microphone Test
                </h3>
                <div className="flex items-center gap-3">
                  <Button
                    variant={micTestActive ? 'danger' : 'secondary'}
                    icon={micTestActive ? <MicOff size={16} /> : <Mic size={16} />}
                    onClick={micTestActive ? stopMicTest : runMicTest}
                  >
                    {micTestActive ? 'Stop Test' : 'Test Microphone'}
                  </Button>
                  {micTestActive && (
                    <div className="flex-1">
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                          style={{ width: `${audioLevel}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Speak now — you should see the bar move
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {micState === 'granted' && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  3. Speaker Test (optional)
                </h3>
                <Button
                  variant="ghost"
                  icon={<Volume2 size={16} />}
                  onClick={playSpeakerTest}
                >
                  {speakerTestDone ? 'Play Again' : 'Play Test Sound'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Start confirmation */}
        <div className="mb-6 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm font-medium text-slate-700">
            Your attempt begins when you press Start.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">
            <li>• Timer cannot be paused.</li>
            <li>• Question becomes available.</li>
            <li>• Attempt officially begins.</li>
          </ul>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={starting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onStart}
            disabled={!canStart || starting}
            loading={starting}
            className="flex-1"
          >
            Start Task
          </Button>
        </div>
      </div>
    </div>
  );
}
