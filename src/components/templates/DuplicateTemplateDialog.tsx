import { AlertTriangle, ExternalLink, Pencil } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  duplicate: { id: number; name: string } | null;
  onClose: () => void;
  onReturnToEditing: () => void;
  onOpenExisting?: (id: number) => void;
}

export default function DuplicateTemplateDialog({
  isOpen,
  duplicate,
  onClose,
  onReturnToEditing,
  onOpenExisting,
}: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Duplicate Template Detected"
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            This template is identical to{' '}
            <span className="font-semibold">"{duplicate?.name}"</span> — it
            contains the exact same set of Question Bank questions.
          </p>
        </div>
        <p className="text-sm text-slate-500">
          You can open the existing template, or return to editing to modify
          your template before saving.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            icon={<ExternalLink size={14} />}
            onClick={() => {
              if (duplicate && onOpenExisting) {
                onOpenExisting(duplicate.id);
              }
            }}
            disabled={!onOpenExisting}
          >
            Open Existing Template
          </Button>
          <Button
            variant="secondary"
            icon={<Pencil size={14} />}
            onClick={onReturnToEditing}
          >
            Return to Editing
          </Button>
        </div>
      </div>
    </Modal>
  );
}
