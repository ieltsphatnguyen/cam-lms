import { FileText, Mic, Headphones } from 'lucide-react';
import {
  QUESTION_TYPE_IDS,
  SPEAKING_PART_2_META,
} from '@/lib/questions';
import type { Question } from '@/types/database';

interface Props {
  question: Question;
  typeName: string;
}

export default function QuestionPreview({ question, typeName }: Props) {
  const isSpeakingPart2 = question.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_2;
  const isWritingTask1 = question.type_id === QUESTION_TYPE_IDS.WRITING_TASK_1;
  const isCustom = question.type_id === QUESTION_TYPE_IDS.CUSTOM;
  const isSpeakingPart1 = question.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_1;

  // Build category display
  let categoryDisplay: string | null = null;
  if (question.category) {
    if (question.category === 'Others' && question.category_secondary) {
      categoryDisplay = question.category_secondary;
    } else if (isSpeakingPart1 && question.category_secondary) {
      categoryDisplay = `${question.category} / ${question.category_secondary}`;
    } else {
      categoryDisplay = question.category;
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
        <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {isCustom && question.custom_type_name
            ? question.custom_type_name
            : typeName}
        </span>
        {question.ielts_band && (
          <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {question.ielts_band}
          </span>
        )}
        {categoryDisplay && (
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {categoryDisplay}
          </span>
        )}
      </div>

      {/* IELTS instructions for Writing Task 1 */}
      {isWritingTask1 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            IELTS Writing Task 1
          </p>
          <p className="mt-1 text-xs text-amber-700">
            You should spend about 20 minutes on this task. Write at least 150
            words. Summarise the information by selecting and reporting the main
            features, and make comparisons where relevant.
          </p>
        </div>
      )}

      {/* IELTS instructions for Writing Task 2 */}
      {question.type_id === QUESTION_TYPE_IDS.WRITING_TASK_2 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-800">
            IELTS Writing Task 2
          </p>
          <p className="mt-1 text-xs text-amber-700">
            You should spend about 40 minutes on this task. Write at least 250
            words. Present a clear, well-structured argument with supporting
            evidence and examples.
          </p>
        </div>
      )}

      {/* IELTS instructions for Speaking Part 1 */}
      {isSpeakingPart1 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm font-medium text-violet-800">
            IELTS Speaking Part 1
          </p>
          <p className="mt-1 text-xs text-violet-700">
            The examiner will ask you general questions about yourself and a
            range of familiar topics. This part lasts 4–5 minutes.
          </p>
        </div>
      )}

      {/* Cue card for Speaking Part 2 */}
      {isSpeakingPart2 && (
        <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Cue Card
          </p>
          <p className="text-sm font-medium text-slate-800">
            {question.content}
          </p>
          {question.description && (
            <p className="mt-2 text-sm text-slate-600">
              {question.description}
            </p>
          )}
          <div className="mt-4 flex gap-4 border-t border-slate-200 pt-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Mic size={13} />
              Preparation: {SPEAKING_PART_2_META.preparationTime}s
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Headphones size={13} />
              Speaking: {SPEAKING_PART_2_META.speakingTime}s
            </div>
          </div>
        </div>
      )}

      {/* IELTS instructions for Speaking Part 3 */}
      {question.type_id === QUESTION_TYPE_IDS.SPEAKING_PART_3 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm font-medium text-violet-800">
            IELTS Speaking Part 3
          </p>
          <p className="mt-1 text-xs text-violet-700">
            The examiner will ask further questions connected to the topic in
            Part 2. This part lasts 4–5 minutes. Discuss abstract ideas and give
            extended answers.
          </p>
        </div>
      )}

      {/* Custom instructions */}
      {isCustom && question.custom_instructions && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">Instructions</p>
          <p className="mt-1 text-xs text-blue-700">
            {question.custom_instructions}
          </p>
        </div>
      )}

      {/* Image for Writing Task 1 / Speaking Part 2 / Custom */}
      {(isWritingTask1 || isSpeakingPart2 || isCustom) && question.image_url && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <img
            src={question.image_url}
            alt="Question visual"
            className="max-h-80 w-full object-contain bg-slate-50"
          />
        </div>
      )}

      {/* Description */}
      {question.description && !isSpeakingPart2 && (
        <p className="text-sm text-slate-600">{question.description}</p>
      )}

      {/* Prompt (not shown for Speaking Part 2 — it's in the cue card) */}
      {!isSpeakingPart2 && (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm leading-relaxed text-slate-800">
            {question.content}
          </p>
        </div>
      )}

      {/* Tags */}
      {question.tags && question.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {question.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer: response type only (no timer) */}
      <div className="flex items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          {question.response_type === 'audio' ? (
            <>
              <Headphones size={13} />
              Audio response
            </>
          ) : (
            <>
              <FileText size={13} />
              Text response
            </>
          )}
        </span>
      </div>
    </div>
  );
}
