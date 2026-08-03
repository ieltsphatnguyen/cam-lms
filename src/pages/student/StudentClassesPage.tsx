import { useState, useEffect } from 'react';
import { School, Hash, UserMinus, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import JoinClassModal from './JoinClassModal';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Plus } from 'lucide-react';

interface EnrolledClass {
  enrollment_id: number;
  id: number;
  name: string;
  class_code: string | null;
  archived_at: string | null;
}

export default function StudentClassesPage() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [leaveError, setLeaveError] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);

  async function loadClasses() {
    if (!profile?.student_id) return;
    const { data } = await supabase
      .from('classstudents')
      .select('id, class_id, classes(id, name, class_code, archived_at)')
      .eq('student_id', profile.student_id);

    const rows: EnrolledClass[] = (data ?? [])
      .filter((r) => r.classes)
      .map((r) => {
        const cls = r.classes as {
          id: number;
          name: string;
          class_code: string | null;
          archived_at: string | null;
        };
        return {
          enrollment_id: r.id,
          id: cls.id,
          name: cls.name,
          class_code: cls.class_code,
          archived_at: cls.archived_at,
        };
      })
      // Only show active classes in the normal view
      .filter((r) => r.archived_at === null);

    setClasses(rows);
    setLoading(false);
  }

  useEffect(() => {
    loadClasses();
  }, [profile?.student_id]);

  async function leaveClass(enrollmentId: number) {
    setLeaveError('');
    setLeaving(enrollmentId);
    const { error } = await supabase
      .from('classstudents')
      .delete()
      .eq('id', enrollmentId);
    if (error) {
      setLeaveError('Could not leave the class. Please try again.');
    } else {
      setClasses((prev) => prev.filter((c) => c.enrollment_id !== enrollmentId));
    }
    setLeaving(null);
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Classes</h1>
          <p className="mt-1 text-sm text-slate-500">Classes you're currently enrolled in.</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setJoinOpen(true)}>
          Join a Class
        </Button>
      </div>

      {leaveError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {leaveError}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : classes.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 text-center">
          <School size={36} className="text-slate-300" />
          <div>
            <p className="font-medium text-slate-600">No classes yet</p>
            <p className="mt-0.5 text-sm text-slate-400">
              Ask your teacher for the class code and join below.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setJoinOpen(true)}>
            Join a class
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div
              key={cls.enrollment_id}
              className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <School size={20} className="text-blue-600" />
                </div>
                <button
                  onClick={() => leaveClass(cls.enrollment_id)}
                  disabled={leaving === cls.enrollment_id}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:cursor-wait"
                  title="Leave class"
                >
                  {leaving === cls.enrollment_id ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <UserMinus size={14} />
                  )}
                </button>
              </div>
              <h3 className="font-semibold text-slate-800 leading-snug">{cls.name}</h3>
              {cls.class_code && (
                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 w-fit">
                  <Hash size={12} className="text-slate-400" />
                  <span className="font-mono text-sm font-medium text-slate-700">
                    {cls.class_code}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <JoinClassModal
        isOpen={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          loadClasses();
        }}
      />
    </div>
  );
}
