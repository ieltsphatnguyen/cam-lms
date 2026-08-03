import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Users,
  Clock,
  FileText,
  Mic,
  ArrowLeft,
  AlertCircle,
  ChevronLeft,
  Home,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { QUESTION_TYPE_IDS } from '@/lib/questions';
import { formatDateTime } from '@/lib/format';
import {
  fetchGradingHierarchy,
  fetchItemStudents,
  fetchAttemptForGrading,
  computeProgressColor,
  getItemTaskLabel,
  type ClassProgress,
  type AssignmentProgress,
  type ItemProgress,
  type GradingAttemptInfo,
  type GradingItemInfo,
  type ProgressColor,
  type GradingStatus,
} from '@/lib/grading';
import AnnotationWorkspace from '@/components/annotations/AnnotationWorkspace';
import { rpcErrorMessage } from '@/lib/rpc-errors';

type View =
  | { kind: 'explorer' }
  | {
      kind: 'studentList';
      item: GradingItemInfo;
      classId: number;
      className: string;
      assignmentName: string;
    }
  | {
      kind: 'submissionViewer';
      attemptId: number;
      item: GradingItemInfo;
      classId: number;
      className: string;
      assignmentName: string;
      students: GradingAttemptInfo[];
      currentIndex: number;
    };

const COLOR_STYLES: Record<ProgressColor, { dot: string; badge: string; border: string }> = {
  green: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', border: 'border-l-emerald-500' },
  yellow: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', border: 'border-l-amber-500' },
  red: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700', border: 'border-l-red-500' },
  grey: { dot: 'bg-slate-300', badge: 'bg-slate-100 text-slate-500', border: 'border-l-slate-300' },
};

const STATUS_STYLES: Record<GradingStatus, { label: string; badge: string }> = {
  not_started: { label: 'Not Started', badge: 'bg-slate-100 text-slate-500' },
  running: { label: 'Running', badge: 'bg-blue-50 text-blue-600' },
  submitted: { label: 'Submitted', badge: 'bg-amber-50 text-amber-700' },
  graded: { label: 'Graded', badge: 'bg-emerald-50 text-emerald-700' },
};

export default function TeacherGradingPage() {
  const [hierarchy, setHierarchy] = useState<ClassProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'explorer' });

  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef<number>(0);

  const loadHierarchy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGradingHierarchy();
      setHierarchy(data);
    } catch (e) {
      setError(rpcErrorMessage(e, 'Failed to load grading data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  useEffect(() => {
    if (view.kind === 'explorer' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosition.current;
    }
  }, [view]);

  function toggleClass(classId: number) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function toggleAssignment(classId: number, assignmentId: number) {
    const key = `${classId}-${assignmentId}`;
    setExpandedAssignments((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleOpenItem(item: GradingItemInfo, classId: number, className: string, assignmentName: string) {
    scrollPosition.current = scrollRef.current?.scrollTop ?? 0;
    setView({ kind: 'studentList', item, classId, className, assignmentName });
  }

  function handleOpenSubmission(
    attemptId: number,
    item: GradingItemInfo,
    classId: number,
    className: string,
    assignmentName: string,
    students: GradingAttemptInfo[],
    currentIndex: number,
  ) {
    setView({
      kind: 'submissionViewer',
      attemptId,
      item,
      classId,
      className,
      assignmentName,
      students,
      currentIndex,
    });
  }

  function handleBackToExplorer() {
    setView({ kind: 'explorer' });
  }

  function handleBackToStudentList() {
    if (view.kind !== 'submissionViewer') return;
    setView({
      kind: 'studentList',
      item: view.item,
      classId: view.classId,
      className: view.className,
      assignmentName: view.assignmentName,
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm font-medium text-red-600">{error}</p>
          <Button variant="secondary" onClick={loadHierarchy} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (view.kind === 'studentList') {
    return (
      <StudentListView
        item={view.item}
        classId={view.classId}
        className={view.className}
        assignmentName={view.assignmentName}
        onBack={handleBackToExplorer}
        onOpenSubmission={(attemptId, students, currentIndex) =>
          handleOpenSubmission(
            attemptId,
            view.item,
            view.classId,
            view.className,
            view.assignmentName,
            students,
            currentIndex,
          )
        }
      />
    );
  }

  if (view.kind === 'submissionViewer') {
    return (
      <SubmissionViewerView
        attemptId={view.attemptId}
        item={view.item}
        classId={view.classId}
        className={view.className}
        assignmentName={view.assignmentName}
        students={view.students}
        currentIndex={view.currentIndex}
        onBack={handleBackToStudentList}
        onNavigateStudent={(newIndex) => {
          const student = view.students[newIndex];
          if (student && student.id !== 0) {
            setView({
              ...view,
              attemptId: student.id,
              currentIndex: newIndex,
            });
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <CheckSquare size={22} className="text-blue-600" />
          <h1 className="text-lg font-bold text-slate-800">Grading</h1>
          <span className="text-sm text-slate-400">
            ({hierarchy.length} {hierarchy.length === 1 ? 'class' : 'classes'})
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {hierarchy.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <CheckSquare size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No assignments to grade yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Published assignments with student submissions will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-3">
            {hierarchy.map((classProgress) => (
              <ClassExplorerRow
                key={classProgress.classInfo.id}
                classProgress={classProgress}
                isExpanded={expandedClasses.has(classProgress.classInfo.id)}
                expandedAssignments={expandedAssignments}
                onToggleClass={() => toggleClass(classProgress.classInfo.id)}
                onToggleAssignment={(aid) => toggleAssignment(classProgress.classInfo.id, aid)}
                onOpenItem={(item, assignmentName) =>
                  handleOpenItem(item, classProgress.classInfo.id, classProgress.classInfo.name, assignmentName)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Breadcrumb Component ─────────────────────────────────────
function Breadcrumb({
  className,
  assignmentName,
  itemLabel,
  studentName,
  onClassClick,
  onAssignmentClick,
  onStudentListClick,
}: {
  className: string;
  assignmentName: string;
  itemLabel: string;
  studentName?: string;
  onClassClick: () => void;
  onAssignmentClick: () => void;
  onStudentListClick: () => void;
}) {
  return (
    <nav className="flex items-center gap-1.5 text-sm">
      <button
        onClick={onClassClick}
        className="flex items-center gap-1 text-slate-500 transition hover:text-blue-600"
      >
        <Home size={13} />
        {className}
      </button>
      <ChevronRight size={13} className="text-slate-300" />
      <button
        onClick={onAssignmentClick}
        className="text-slate-500 transition hover:text-blue-600"
      >
        {assignmentName}
      </button>
      <ChevronRight size={13} className="text-slate-300" />
      <button
        onClick={onStudentListClick}
        className="text-slate-500 transition hover:text-blue-600"
      >
        {itemLabel}
      </button>
      {studentName && (
        <>
          <ChevronRight size={13} className="text-slate-300" />
          <span className="font-medium text-slate-700">{studentName}</span>
        </>
      )}
    </nav>
  );
}

// ── Class Explorer Row ──────────────────────────────────────

function ClassExplorerRow({
  classProgress,
  isExpanded,
  expandedAssignments,
  onToggleClass,
  onToggleAssignment,
  onOpenItem,
}: {
  classProgress: ClassProgress;
  isExpanded: boolean;
  expandedAssignments: Set<string>;
  onToggleClass: () => void;
  onToggleAssignment: (assignmentId: number) => void;
  onOpenItem: (item: GradingItemInfo, assignmentName: string) => void;
}) {
  const color = computeProgressColor(classProgress.totalSubmissions, classProgress.totalGraded);
  const styles = COLOR_STYLES[color];

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${isExpanded ? styles.border : ''} border-l-4`}>
      <button onClick={onToggleClass} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
        {isExpanded ? <ChevronDown size={18} className="shrink-0 text-slate-400" /> : <ChevronRight size={18} className="shrink-0 text-slate-400" />}
        <div className={`h-3 w-3 shrink-0 rounded-full ${styles.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-800">{classProgress.classInfo.name}</span>
            {classProgress.classInfo.class_code && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">{classProgress.classInfo.class_code}</span>
            )}
          </div>
        </div>
        <div className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium ${styles.badge}`}>
          {classProgress.totalGraded} / {classProgress.totalSubmissions} graded
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/50">
          {classProgress.assignments.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400">No published assignments in this class.</p>
          ) : (
            <div className="space-y-1 p-3">
              {classProgress.assignments.map((assignment) => {
                const key = `${classProgress.classInfo.id}-${assignment.assignment.id}`;
                const aExpanded = expandedAssignments.has(key);
                return (
                  <AssignmentExplorerRow
                    key={assignment.assignment.id}
                    assignment={assignment}
                    isExpanded={aExpanded}
                    onToggle={() => onToggleAssignment(assignment.assignment.id)}
                    onOpenItem={(item) => onOpenItem(item, assignment.assignment.name)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Assignment Explorer Row ─────────────────────────────────

function AssignmentExplorerRow({
  assignment,
  isExpanded,
  onToggle,
  onOpenItem,
}: {
  assignment: AssignmentProgress;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenItem: (item: GradingItemInfo) => void;
}) {
  const color = computeProgressColor(assignment.totalSubmissions, assignment.totalGraded);
  const styles = COLOR_STYLES[color];

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
        {isExpanded ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
        <span className="flex-1 truncate text-sm font-medium text-slate-700">{assignment.assignment.name}</span>
        <div className={`shrink-0 rounded-md px-2.5 py-0.5 text-xs font-medium ${styles.badge}`}>
          {assignment.totalGraded} / {assignment.totalSubmissions} graded
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4">
          {assignment.items.length === 0 ? (
            <p className="text-xs text-slate-400">No items in this assignment.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assignment.items.map((itemProgress) => (
                <ItemCard key={itemProgress.item.id} itemProgress={itemProgress} onOpen={() => onOpenItem(itemProgress.item)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Item Card ───────────────────────────────────────────────

function ItemCard({ itemProgress, onOpen }: { itemProgress: ItemProgress; onOpen: () => void }) {
  const { item, totalStudents, submittedCount, gradedCount, lateCount } = itemProgress;
  const color = computeProgressColor(submittedCount, gradedCount);
  const styles = COLOR_STYLES[color];
  const isAudio = item.response_type === 'audio';

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex items-center gap-2">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
        <div className="flex items-center gap-1.5">
          {isAudio ? <Mic size={14} className="text-slate-400" /> : <FileText size={14} className="text-slate-400" />}
          <span className="text-sm font-semibold text-slate-800">{getItemTaskLabel(item)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Submitted</span>
          <span className="font-medium text-slate-700">{submittedCount} / {totalStudents}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Graded</span>
          <span className="font-medium text-slate-700">{gradedCount} / {submittedCount}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Late</span>
          <span className={`font-medium ${lateCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>{lateCount}</span>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={onOpen}>Open</Button>
      </div>
    </div>
  );
}

// ── Student List View ───────────────────────────────────────

function StudentListView({
  item,
  classId,
  className,
  assignmentName,
  onBack,
  onOpenSubmission,
}: {
  item: GradingItemInfo;
  classId: number;
  className: string;
  assignmentName: string;
  onBack: () => void;
  onOpenSubmission: (attemptId: number, students: GradingAttemptInfo[], currentIndex: number) => void;
}) {
  const [students, setStudents] = useState<GradingAttemptInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchItemStudents(item.id, classId);
        if (!cancelled) setStudents(data);
      } catch (e) {
        if (!cancelled) setError(rpcErrorMessage(e, 'Failed to load students'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [item.id, classId]);

  const itemLabel = getItemTaskLabel(item);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-2">
          <Breadcrumb
            className={className}
            assignmentName={assignmentName}
            itemLabel={itemLabel}
            onClassClick={onBack}
            onAssignmentClick={onBack}
            onStudentListClick={onBack}
          />
          <div className="flex items-center gap-3">
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack} size="sm">Back</Button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              {item.response_type === 'audio' ? <Mic size={18} className="text-slate-400" /> : <FileText size={18} className="text-slate-400" />}
              <h1 className="text-sm font-semibold text-slate-800">{itemLabel}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
              <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          </div>
        ) : students.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Users size={48} className="mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No students enrolled in this class.</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_120px_140px_80px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Student Name</span>
              <span>Status</span>
              <span>Submitted</span>
              <span className="text-right">Open</span>
            </div>
            {students.map((student, idx) => {
              const hasAttempt = student.id !== 0;
              const isSubmitted = student.status === 'submitted' || student.status === 'auto_submitted';
              const isGraded = (student as unknown as { graded?: boolean }).graded === true;
              const status: GradingStatus = !hasAttempt ? 'not_started' : isGraded ? 'graded' : isSubmitted ? 'submitted' : 'running';
              const statusStyle = STATUS_STYLES[status];
              const canOpen = hasAttempt && isSubmitted;

              return (
                <div
                  key={`${student.student_profile_id}-${idx}`}
                  onClick={() => canOpen && onOpenSubmission(student.id, students, idx)}
                  className={`grid grid-cols-[1fr_120px_140px_80px] gap-4 px-5 py-3 text-sm transition ${canOpen ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-slate-50'} ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <span className="truncate font-medium text-slate-700">{student.student_name}</span>
                  <span><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusStyle.badge}`}>{statusStyle.label}</span></span>
                  <span className="text-xs text-slate-500">{isSubmitted ? formatDateTime(student.submitted_at) : '—'}</span>
                  <span className="text-right">
                    {canOpen ? (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpenSubmission(student.id, students, idx); }}>Open</Button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Submission Viewer ───────────────────────────────────────

function SubmissionViewerView({
  attemptId,
  item,
  classId,
  className,
  assignmentName,
  students,
  currentIndex,
  onBack,
  onNavigateStudent,
}: {
  attemptId: number;
  item: GradingItemInfo;
  classId: number;
  className: string;
  assignmentName: string;
  students: GradingAttemptInfo[];
  currentIndex: number;
  onBack: () => void;
  onNavigateStudent: (newIndex: number) => void;
}) {
  const [attempt, setAttempt] = useState<GradingAttemptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAttemptForGrading(attemptId);
        if (!cancelled) setAttempt(data);
      } catch (e) {
        if (!cancelled) setError(rpcErrorMessage(e, 'Failed to load submission'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [attemptId]);

  const isAudio = item.response_type === 'audio';
  const itemLabel = getItemTaskLabel(item);
  const studentName = students[currentIndex]?.student_name ?? '';
  const hasPrev = currentIndex > 0 && students[currentIndex - 1]?.id !== 0;
  const hasNext = currentIndex < students.length - 1 && students[currentIndex + 1]?.id !== 0;

  // Filter to only students with submittable attempts for prev/next
  const submittableStudents = students.filter((s) => s.id !== 0 && (s.status === 'submitted' || s.status === 'auto_submitted'));
  const submittableIndex = submittableStudents.findIndex((s) => s.id === attemptId);
  const hasPrevSubmittable = submittableIndex > 0;
  const hasNextSubmittable = submittableIndex >= 0 && submittableIndex < submittableStudents.length - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-2">
          <Breadcrumb
            className={className}
            assignmentName={assignmentName}
            itemLabel={itemLabel}
            studentName={studentName}
            onClassClick={onBack}
            onAssignmentClick={onBack}
            onStudentListClick={onBack}
          />
          <div className="flex items-center gap-3">
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack} size="sm">Back to Student List</Button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              {isAudio ? <Mic size={18} className="text-slate-400" /> : <FileText size={18} className="text-slate-400" />}
              <h1 className="text-sm font-semibold text-slate-800">{itemLabel}</h1>
              {attempt && <span className="text-sm text-slate-400">— {attempt.student_name}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-slate-50">
        {loading ? (
          <div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>
        ) : error ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
              <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          </div>
        ) : !attempt ? (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-sm text-slate-500">Submission not found.</p>
          </div>
        ) : (
          <AnnotationWorkspace
            attempt={attempt}
            item={item}
            studentName={studentName}
            onPrevStudent={() => {
              if (hasPrevSubmittable) {
                const prevStudent = submittableStudents[submittableIndex - 1];
                onNavigateStudent(students.findIndex((s) => s.id === prevStudent.id));
              }
            }}
            onNextStudent={() => {
              if (hasNextSubmittable) {
                const nextStudent = submittableStudents[submittableIndex + 1];
                onNavigateStudent(students.findIndex((s) => s.id === nextStudent.id));
              }
            }}
            hasPrev={hasPrevSubmittable}
            hasNext={hasNextSubmittable}
          />
        )}
      </div>
    </div>
  );
}
