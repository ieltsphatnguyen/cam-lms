import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, CheckCircle, Clock, AlertCircle, FileText, Mic, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { formatDateTime, formatSeconds, formatTimeLimit } from '@/lib/format';
import { fetchPublishedAssignment } from '@/lib/templates';
import { fetchStudentAssignmentItems } from '@/lib/attempts';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import type {
  PublishedAssignmentWithDetails,
  StudentAssignmentItem,
  ItemStatus,
} from '@/types/database';

interface Props {
  assignmentId: number;
  onBack: () => void;
  onOpenItem: (item: StudentAssignmentItem) => void;
}

const statusConfig: Record<
  ItemStatus,
  { label: string; icon: typeof Lock; color: string; bg: string }
> = {
  locked: {
    label: 'Locked',
    icon: Lock,
    color: 'text-slate-400',
    bg: 'bg-slate-50 border-slate-200',
  },
  available: {
    label: 'Available',
    icon: Clock,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  overdue: {
    label: 'Overdue',
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 border-red-200',
  },
  revision_requested: {
    label: 'Revision Requested',
    icon: RotateCcw,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
  },
};

function getItemTimingInfo(item: StudentAssignmentItem): { label: string; value: string }[] {
  const timings: { label: string; value: string }[] = [];
  const isPart2 = item.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2;

  if (isPart2) {
    if (item.prep_time_seconds) {
      timings.push({ label: 'Preparation', value: formatSeconds(item.prep_time_seconds) });
    }
    if (item.recording_time_seconds) {
      timings.push({ label: 'Recording', value: formatSeconds(item.recording_time_seconds) });
    }
  } else if (item.timed && item.time_limit) {
    const formatted = formatTimeLimit(item.time_limit);
    if (formatted) {
      const isSpeaking = item.response_type === 'audio';
      timings.push({
        label: isSpeaking ? 'Recording Time' : 'Time Limit',
        value: formatted,
      });
    }
  }

  return timings;
}

export default function StudentAssignmentDetailPage({
  assignmentId,
  onBack,
  onOpenItem,
}: Props) {
  const { profile } = useAuth();
  const [assignment, setAssignment] =
    useState<PublishedAssignmentWithDetails | null>(null);
  const [items, setItems] = useState<StudentAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [a, i] = await Promise.all([
          fetchPublishedAssignment(assignmentId),
          fetchStudentAssignmentItems(assignmentId),
        ]);
        setAssignment(a);
        setItems(i);
      } catch {
        setAssignment(null);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assignmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6 md:p-8">
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>
          Back
        </Button>
        <p className="mt-8 text-sm text-slate-500">Assignment not found.</p>
      </div>
    );
  }

  const completedCount = items.filter(
    (i) => i.item_status === 'completed' || i.item_status === 'revision_requested',
  ).length;
  const revisionCount = items.filter(
    (i) => i.item_status === 'revision_requested',
  ).length;
  const isSpeaking = (item: StudentAssignmentItem) =>
    item.response_type === 'audio';

  return (
    <div className="p-6 md:p-8">
      <Button
        variant="ghost"
        icon={<ArrowLeft size={16} />}
        onClick={onBack}
        className="mb-4"
      >
        Back to Assignments
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{assignment.name}</h1>
        <div className="mt-2 space-y-1 text-sm text-slate-500">
          <p>
            <span className="font-medium text-slate-600">Published by:</span>{' '}
            {assignment.owner_display_name ?? 'Unknown'}
          </p>
          <p>
            <span className="font-medium text-slate-600">Published on:</span>{' '}
            {formatDateTime(assignment.published_at)}
          </p>
          <p>
            <span className="font-medium text-slate-600">Target Class:</span>{' '}
            {assignment.class_name}
          </p>
        </div>
        {assignment.description && (
          <p className="mt-3 text-sm text-slate-600">{assignment.description}</p>
        )}
      </div>

      <div className="mb-6 flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <CheckCircle size={16} className="text-emerald-600" />
          </div>
          <span className="text-slate-600">
            {completedCount} of {items.length} completed
          </span>
        </div>
        {revisionCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <RotateCcw size={16} className="text-amber-600" />
            </div>
            <span className="text-slate-600">
              {revisionCount} revision{revisionCount > 1 ? 's' : ''} requested
            </span>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <FileText size={32} className="text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No items in this assignment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const cfg = statusConfig[item.item_status];
            const Icon = cfg.icon;
            const ResponseIcon = isSpeaking(item) ? Mic : FileText;
            const canOpen = item.item_status !== 'locked';

            return (
              <button
                key={item.id}
                onClick={() => canOpen && onOpenItem(item)}
                disabled={!canOpen}
                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                  canOpen
                    ? 'border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 cursor-pointer'
                    : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-70'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">
                  {idx + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ResponseIcon size={14} className="text-slate-400" />
                    <h3 className="truncate text-sm font-semibold text-slate-800">
                      {item.type_name}
                      {item.custom_type_name ? ` — ${item.custom_type_name}` : ''}
                    </h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    {item.available_from && (
                      <span>Available: {formatDateTime(item.available_from)}</span>
                    )}
                    {item.due_date && (
                      <span>Due: {formatDateTime(item.due_date)}</span>
                    )}
                    {getItemTimingInfo(item).map((t, i) => (
                      <span key={i} className="font-medium text-slate-500">
                        {t.label}: {t.value}
                      </span>
                    ))}
                    {item.attempt_submitted_at && (
                      <span className="text-emerald-500">
                        Submitted: {formatDateTime(item.attempt_submitted_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}
                >
                  <Icon size={14} />
                  {item.item_status === 'completed'
                    ? 'View Submission'
                    : item.item_status === 'revision_requested'
                      ? 'Start Revision'
                      : cfg.label}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
