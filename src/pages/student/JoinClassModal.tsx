import { useState, FormEvent } from 'react';
import { Hash, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onJoined: () => void;
}

export default function JoinClassModal({ isOpen, onClose, onJoined }: Props) {
  const { profile } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joined, setJoined] = useState<string | null>(null);

  function reset() {
    setCode('');
    setError('');
    setJoined(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a class code.');
      return;
    }

    setLoading(true);
    try {
      // Find the class by code
      const { data: cls, error: findError } = await supabase
        .from('classes')
        .select('id, name, archived_at')
        .eq('class_code', trimmed)
        .maybeSingle();

      if (findError) throw findError;

      if (!cls) {
        setError('No class found with that code. Double-check and try again.');
        setLoading(false);
        return;
      }

      // Block joining archived classes
      if (cls.archived_at !== null) {
        setError('This class is no longer accepting new students.');
        setLoading(false);
        return;
      }

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('classstudents')
        .select('id')
        .eq('student_id', profile!.student_id!)
        .eq('class_id', cls.id)
        .maybeSingle();

      if (existing) {
        setError('You are already enrolled in this class.');
        setLoading(false);
        return;
      }

      // Enroll
      const { error: enrollError } = await supabase
        .from('classstudents')
        .insert({ student_id: profile!.student_id!, class_id: cls.id });

      if (enrollError) throw enrollError;

      setJoined(cls.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not join the class.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Join a Class" size="sm">
      {joined ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle size={24} className="text-emerald-600" />
          </div>
          <p className="font-medium text-slate-800">Joined successfully!</p>
          <p className="text-sm text-slate-500">
            You are now enrolled in <strong>{joined}</strong>.
          </p>
          <Button
            className="w-full mt-1"
            onClick={() => {
              reset();
              onJoined();
            }}
          >
            Go to My Classes
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter the class code provided by your teacher.
          </p>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <Input
            label="Class code"
            placeholder="e.g. IELTS-A1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Join class
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
