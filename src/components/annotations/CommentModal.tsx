import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, Square, Trash2, MessageSquare, Type, AudioLines } from 'lucide-react';
import Button from '@/components/ui/Button';
import RichTextEditor from './RichTextEditor';
import { uploadAudioComment, getAudioCommentUrl } from '@/lib/annotations';
import type { AnnotationComment } from '@/types/database';

export interface CommentModalAnnotation {
  id: number;
  selected_text: string;
  criterion_name: string | null;
  comments: AnnotationComment[];
}

interface FloatingCommentModalProps {
  open: boolean;
  annotation: CommentModalAnnotation | null;
  initialMode: 'text' | 'audio';
  selectionRect: DOMRect | null;
  onClose: () => void;
  onSaveTextComment: (annotationId: number, content: string, commentId?: number) => Promise<void>;
  onSaveAudioComment: (annotationId: number, audioPath: string) => Promise<void>;
  onDeleteComment: (commentId: number) => Promise<void>;
  readOnly?: boolean;
}

const PANEL_WIDTH = 420;
const PANEL_MAX_HEIGHT = 480;
const MARGIN = 8;

function computePosition(
  rect: DOMRect | null,
  panelHeight: number,
): { left: number; top: number } | null {
  // Fallback: center in viewport when no rect (e.g. clicking an existing annotation tag)
  if (!rect) {
    const left = Math.max(MARGIN, (window.innerWidth - PANEL_WIDTH) / 2);
    const top = Math.max(MARGIN, (window.innerHeight - panelHeight) / 2);
    return { left, top };
  }

  let left: number;
  let top: number;

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const spaceRight = window.innerWidth - rect.right;
  const spaceLeft = rect.left;

  if (spaceBelow >= panelHeight + MARGIN) {
    top = rect.bottom + MARGIN;
  } else if (spaceAbove >= panelHeight + MARGIN) {
    top = rect.top - panelHeight - MARGIN;
  } else {
    top = Math.max(MARGIN, window.innerHeight - panelHeight - MARGIN);
  }

  if (spaceRight >= PANEL_WIDTH + MARGIN) {
    left = rect.right + MARGIN;
  } else if (spaceLeft >= PANEL_WIDTH + MARGIN) {
    left = rect.left - PANEL_WIDTH - MARGIN;
  } else {
    left = rect.left + rect.width / 2 - PANEL_WIDTH / 2;
    if (left < MARGIN) left = MARGIN;
    if (left + PANEL_WIDTH > window.innerWidth - MARGIN) {
      left = window.innerWidth - PANEL_WIDTH - MARGIN;
    }
  }

  return { left, top };
}

export default function CommentModal({
  open,
  annotation,
  initialMode,
  selectionRect,
  onClose,
  onSaveTextComment,
  onSaveAudioComment,
  onDeleteComment,
  readOnly = false,
}: FloatingCommentModalProps) {
  const [textContent, setTextContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [existingAudioUrls, setExistingAudioUrls] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<'text' | 'audio'>('text');
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Reset state and set initial mode when opening
  useEffect(() => {
    if (open && annotation) {
      setTextContent('');
      setEditingCommentId(null);
      setAudioBlob(null);
      setAudioUrl(null);
      setIsRecording(false);
      setMode(initialMode);

      const audioComments = annotation.comments.filter((c) => c.type === 'audio' && c.audio_path);
      if (audioComments.length > 0) {
        Promise.all(
          audioComments.map(async (c) => {
            const url = await getAudioCommentUrl(c.audio_path!);
            return [c.id, url] as const;
          }),
        ).then((entries) => {
          const map: Record<number, string> = {};
          for (const [id, url] of entries) {
            if (url) map[id] = url;
          }
          setExistingAudioUrls(map);
        });
      } else {
        setExistingAudioUrls({});
      }
    }
  }, [open, annotation, initialMode]);

  // Compute adaptive position
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const pos = computePosition(selectionRect, PANEL_MAX_HEIGHT);
    setPosition(pos);
  }, [open, selectionRect]);

  // Focus editor when text mode opens
  useEffect(() => {
    if (open && initialMode === 'text' && position) {
      setTimeout(() => {
        const editable = panelRef.current?.querySelector('[contenteditable]') as HTMLElement | null;
        editable?.focus();
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, position]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Re-fetch audio URLs when annotation comments change (e.g. after saving a new audio comment)
  useEffect(() => {
    if (!open || !annotation) return;
    const audioComments = annotation.comments.filter((c) => c.type === 'audio' && c.audio_path);
    const knownIds = new Set(Object.keys(existingAudioUrls).map(Number));
    const newAudioComments = audioComments.filter((c) => !knownIds.has(c.id));
    if (newAudioComments.length > 0) {
      Promise.all(
        newAudioComments.map(async (c) => {
          const url = await getAudioCommentUrl(c.audio_path!);
          return [c.id, url] as const;
        }),
      ).then((entries) => {
        setExistingAudioUrls((prev) => {
          const map = { ...prev };
          for (const [id, url] of entries) {
            if (url) map[id] = url;
          }
          return map;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, annotation]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      alert('Could not access microphone. Please grant permission and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleSaveText = useCallback(async () => {
    if (!annotation || !textContent.trim()) return;
    setUploading(true);
    try {
      await onSaveTextComment(annotation.id, textContent, editingCommentId ?? undefined);
      setTextContent('');
      setEditingCommentId(null);
    } catch {
      alert('Failed to save comment. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [annotation, textContent, editingCommentId, onSaveTextComment]);

  const handleSaveAudio = useCallback(async () => {
    if (!annotation || !audioBlob) return;
    setUploading(true);
    try {
      const path = await uploadAudioComment(annotation.id, audioBlob);
      await onSaveAudioComment(annotation.id, path);
      setAudioBlob(null);
      setAudioUrl(null);
    } catch {
      alert('Failed to upload audio. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [annotation, audioBlob, onSaveAudioComment]);

  const handleEditComment = useCallback((comment: AnnotationComment) => {
    if (comment.type === 'text') {
      setMode('text');
      setTextContent(comment.content ?? '');
      setEditingCommentId(comment.id);
    }
  }, []);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    try {
      await onDeleteComment(commentId);
    } catch {
      alert('Failed to delete comment.');
    }
  }, [onDeleteComment]);

  const handleSwitchMode = useCallback(() => {
    setMode((prev) => (prev === 'text' ? 'audio' : 'text'));
    setTextContent('');
    setEditingCommentId(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  if (!open || !annotation || !position) return null;

  const sortedComments = [...annotation.comments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const style: React.CSSProperties = {
    position: 'fixed',
    left: `${position.left}px`,
    top: `${position.top}px`,
    width: `${PANEL_WIDTH}px`,
    maxHeight: `${PANEL_MAX_HEIGHT}px`,
    zIndex: 55,
  };

  return (
    <>
      {/* Transparent backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-[54]" onClick={onClose} />

      <div
        ref={panelRef}
        style={style}
        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 truncate">
              {annotation.comments.length === 1
                ? 'Teacher Comment'
                : 'Teacher Comments'}
            </h3>
            <p className="text-xs text-slate-400 truncate">
              &ldquo;{annotation.selected_text.length > 60
                ? annotation.selected_text.slice(0, 60) + '…'
                : annotation.selected_text}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {sortedComments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {readOnly ? 'No comments on this annotation.' : 'No comments yet. Add one below.'}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedComments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {comment.type === 'text' ? (
                        <div
                          className="prose prose-sm max-w-none text-slate-700"
                          dangerouslySetInnerHTML={{ __html: comment.content ?? '' }}
                        />
                      ) : (
                        <div>
                          <p className="mb-1 text-xs text-slate-400">Audio comment</p>
                          {existingAudioUrls[comment.id] ? (
                            <audio controls className="w-full max-w-sm">
                              <source src={existingAudioUrls[comment.id]} type="audio/webm" />
                            </audio>
                          ) : (
                            <p className="text-xs text-slate-400 italic">Loading audio…</p>
                          )}
                        </div>
                      )}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {comment.type === 'text' && (
                          <button
                            onClick={() => handleEditComment(comment)}
                            className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                            title="Edit"
                          >
                            <MessageSquare size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Editor area — hidden in read-only mode */}
        {!readOnly && (
        <div className="border-t border-slate-200 px-4 py-3">
          {mode === 'text' ? (
            <div className="space-y-2">
              <RichTextEditor
                value={textContent}
                onChange={setTextContent}
                placeholder="Type your comment…"
                minHeight="80px"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<AudioLines size={14} />}
                  onClick={handleSwitchMode}
                  title="Switch to audio comment"
                >
                  Switch to Audio
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTextContent('');
                      setEditingCommentId(null);
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveText}
                    disabled={uploading || !textContent.trim()}
                  >
                    {uploading
                      ? 'Saving…'
                      : editingCommentId !== null
                        ? 'Update Comment'
                        : 'Save Comment'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Recording-ready state: shows Start Recording button */}
              {!isRecording && !audioBlob && (
                <div className="flex flex-col items-center justify-center py-6">
                  <button
                    onClick={startRecording}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
                    title="Start recording"
                  >
                    <Mic size={20} />
                  </button>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    Click to start recording
                  </p>
                </div>
              )}

              {/* Recording state: shows Stop button */}
              {isRecording && (
                <div className="flex flex-col items-center justify-center py-6">
                  <button
                    onClick={stopRecording}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
                    title="Stop recording"
                  >
                    <Square size={20} />
                  </button>
                  <p className="mt-2 text-xs font-medium text-red-500">Recording…</p>
                </div>
              )}

              {/* Recorded state: shows playback + discard/re-record */}
              {!isRecording && audioBlob && audioUrl && (
                <div className="space-y-2">
                  <audio controls src={audioUrl} className="w-full" />
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setAudioBlob(null);
                        setAudioUrl(null);
                        startRecording();
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700"
                    >
                      <Mic size={12} />
                      Re-record
                    </button>
                    <button
                      onClick={() => {
                        setAudioBlob(null);
                        setAudioUrl(null);
                      }}
                      className="flex items-center gap-1 text-xs text-red-500 transition hover:text-red-600"
                    >
                      <Trash2 size={12} />
                      Discard
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Type size={14} />}
                  onClick={handleSwitchMode}
                  title="Switch to text comment"
                >
                  Switch to Text
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAudioBlob(null);
                      setAudioUrl(null);
                      setIsRecording(false);
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveAudio}
                    disabled={uploading || !audioBlob}
                  >
                    {uploading ? 'Uploading…' : 'Save Audio Comment'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  );
}
