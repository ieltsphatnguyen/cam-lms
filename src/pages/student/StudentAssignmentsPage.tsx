import { useState, useEffect } from 'react';
import { ClipboardList, Calendar, Layers, BookOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatDate } from '@/lib/format';
import { fetchStudentAssignments } from '@/lib/templates';
import type { PublishedAssignmentWithDetails } from '@/types/database';

export default function StudentAssignmentsPage() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<PublishedAssignmentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAssignments() {
    if (!profile?.student_id) return;
    try {
      const data = await fetchStudentAssignments(profile.student_id);
      setAssignments(data);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, [profile?.student_id]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">My Assignments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Assignments your teachers have published to your classes.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
          <ClipboardList size={40} className="text-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">
            No assignments yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Assignments will appear here once your teacher publishes them.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-800">
                    {a.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {a.class_name}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Published
                </span>
              </div>

              {a.description && (
                <p className="mb-3 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">
                  {a.description}
                </p>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Layers size={11} />
                  {a.item_count} question
                  {a.item_count !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {formatDate(a.published_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
