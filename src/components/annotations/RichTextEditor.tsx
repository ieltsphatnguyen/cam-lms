import { useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, Strikethrough } from 'lucide-react';

type ColorName = 'black' | 'red' | 'blue' | 'green';

const COLOR_MAP: Record<ColorName, string> = {
  black: '#1e293b',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
};

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Type here…',
  minHeight = '120px',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Initialize content once — never re-inject from props
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = value;
      initializedRef.current = true;
    }
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handleColor = useCallback((color: ColorName) => {
    exec('foreColor', COLOR_MAP[color]);
  }, [exec]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
        <ToolbarButton onClick={() => exec('bold')} title="Bold">
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('italic')} title="Italic">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('underline')} title="Underline">
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec('strikeThrough')} title="Strikethrough">
          <Strikethrough size={14} />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        {(['black', 'red', 'blue', 'green'] as ColorName[]).map((c) => (
          <button
            key={c}
            onClick={() => handleColor(c)}
            title={c}
            className="rounded p-1 transition hover:bg-slate-200"
          >
            <span
              className="block h-4 w-4 rounded-full border border-slate-300"
              style={{ backgroundColor: COLOR_MAP[c] }}
            />
          </button>
        ))}
      </div>

      {/* Editable area — uncontrolled, LTR enforced */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        dir="ltr"
        data-placeholder={placeholder}
        className="px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 [&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)]"
        style={{ minHeight }}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded p-1.5 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
