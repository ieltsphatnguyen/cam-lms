import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import PreFlightCheck from './PreFlightCheck';
import WritingWorkspace from './WritingWorkspace';
import SpeakingWorkspace from './SpeakingWorkspace';
import SubmissionReview from './SubmissionReview';
import { startAttempt } from '@/lib/attempts';
import type { StartAttemptResult, StudentAssignmentItem } from '@/types/database';

interface Props {
  item: StudentAssignmentItem;
  assignmentName: string;
  onBack: () => void;
  onComplete: () => void;
}

type Stage = 'preflight' | 'starting' | 'workspace' | 'completed' | 'error' | 'review';

export default function StudentWorkspace({ item, assignmentName, onBack, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>(
    item.item_status === 'completed' ? 'review' : 'preflight',
  );
  const [attempt, setAttempt] = useState<StartAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setStage('starting');
    setError(null);
    try {
      const result = await startAttempt(item.id);
      setAttempt(result);
      if (result.already_submitted) {
        setStage('completed');
      } else {
        setStage('workspace');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start attempt';
      setError(msg);
      setStage('error');
    }
  }

  if (stage === 'preflight' || stage === 'starting') {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 bg-white px-6 py-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={16} />}
            onClick={onBack}
            size="sm"
          >
            Back to {assignmentName}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {stage === 'starting' ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-slate-500">
                  Starting your attempt...
                </p>
              </div>
            </div>
          ) : (
            <PreFlightCheck
              item={item}
              onStart={handleStart}
              onCancel={onBack}
              starting={false}
            />
          )}
        </div>
      </div>
    );
  }

  if (stage === 'completed' || stage === 'review') {
    return <SubmissionReview item={item} onBack={onBack} />;
  }

  if (stage === 'error') {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 bg-white px-6 py-3">
          <Button
            variant="ghost"
            icon={<ArrowLeft size={16} />}
            onClick={onBack}
            size="sm"
          >
            Back
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
          <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg">
            <p className="text-sm font-medium text-red-600">
              {error ?? 'Something went wrong.'}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setStage('preflight');
              }}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!attempt) return null;

  return (
    <div className="flex h-full flex-col">
      {item.response_type === 'audio' ? (
        <SpeakingWorkspace attempt={attempt} onComplete={onComplete} />
      ) : (
        <WritingWorkspace attempt={attempt} onComplete={onComplete} />
      )}
    </div>
  );
}
