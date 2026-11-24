'use client';

import * as React from 'react';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  CheckSquare,
  Heading2,
  Heading3,
  Quote,
  Code,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  ariaLabel?: string;
}

function normalizeInitialContent(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^<[a-z][\s\S]*>/i.test(trimmed)) {
    return raw;
  }
  return trimmed
    .split('\n')
    .map((line) => `<p>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}

interface ToolbarSnapshot {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  h2: boolean;
  h3: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function shallowEqualSnapshot(a: ToolbarSnapshot, b: ToolbarSnapshot | null): boolean {
  if (!b) return false;
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.strike === b.strike &&
    a.h2 === b.h2 &&
    a.h3 === b.h3 &&
    a.bulletList === b.bulletList &&
    a.orderedList === b.orderedList &&
    a.taskList === b.taskList &&
    a.blockquote === b.blockquote &&
    a.codeBlock === b.codeBlock &&
    a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo
  );
}

interface ToolbarItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const EditorToolbar = React.memo(function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }): ToolbarSnapshot => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      taskList: ed.isActive('taskList'),
      blockquote: ed.isActive('blockquote'),
      codeBlock: ed.isActive('codeBlock'),
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
    }),
    equalityFn: shallowEqualSnapshot,
  });

  const groups: ToolbarItem[][] = [
    [
      {
        id: 'bold',
        label: 'In đậm',
        shortcut: 'Ctrl+B',
        icon: Bold,
        active: state.bold,
        onClick: () => editor.chain().focus().toggleBold().run(),
      },
      {
        id: 'italic',
        label: 'In nghiêng',
        shortcut: 'Ctrl+I',
        icon: Italic,
        active: state.italic,
        onClick: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        id: 'strike',
        label: 'Gạch ngang',
        shortcut: 'Ctrl+Shift+S',
        icon: Strikethrough,
        active: state.strike,
        onClick: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        id: 'h2',
        label: 'Tiêu đề lớn',
        shortcut: '## ',
        icon: Heading2,
        active: state.h2,
        onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: 'h3',
        label: 'Tiêu đề nhỏ',
        shortcut: '### ',
        icon: Heading3,
        active: state.h3,
        onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
    ],
    [
      {
        id: 'bulletList',
        label: 'Danh sách chấm',
        shortcut: '- ',
        icon: List,
        active: state.bulletList,
        onClick: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: 'orderedList',
        label: 'Danh sách đánh số',
        shortcut: '1. ',
        icon: ListOrdered,
        active: state.orderedList,
        onClick: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: 'taskList',
        label: 'Danh sách việc cần làm',
        shortcut: '[ ] ',
        icon: CheckSquare,
        active: state.taskList,
        onClick: () => editor.chain().focus().toggleTaskList().run(),
      },
    ],
    [
      {
        id: 'blockquote',
        label: 'Trích dẫn',
        shortcut: '> ',
        icon: Quote,
        active: state.blockquote,
        onClick: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: 'codeBlock',
        label: 'Khối mã nguồn',
        shortcut: '```',
        icon: Code,
        active: state.codeBlock,
        onClick: () => editor.chain().focus().toggleCodeBlock().run(),
      },
    ],
    [
      {
        id: 'undo',
        label: 'Hoàn tác',
        shortcut: 'Ctrl+Z',
        icon: Undo2,
        disabled: !state.canUndo,
        onClick: () => editor.chain().focus().undo().run(),
      },
      {
        id: 'redo',
        label: 'Làm lại',
        shortcut: 'Ctrl+Y',
        icon: Redo2,
        disabled: !state.canRedo,
        onClick: () => editor.chain().focus().redo().run(),
      },
    ],
  ];

  return (
    <TooltipProvider delayDuration={350}>
      <div
        role="toolbar"
        aria-label="Thanh công cụ định dạng văn bản"
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5"
      >
        {groups.map((group, groupIdx) => (
          <React.Fragment key={groupIdx}>
            {groupIdx > 0 && (
              <span
                aria-hidden="true"
                className="mx-1 h-4 w-px bg-border shrink-0"
              />
            )}
            {group.map((btn) => {
              const Icon = btn.icon;
              const fullTitle = btn.shortcut
                ? `${btn.label} (${btn.shortcut})`
                : btn.label;

              return (
                <Tooltip key={btn.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={fullTitle}
                      aria-pressed={btn.active !== undefined ? Boolean(btn.active) : undefined}
                      disabled={btn.disabled}
                      onMouseDown={(e) => {
                        // Keep editor selection & focus intact on toolbar click
                        e.preventDefault();
                      }}
                      onClick={btn.onClick}
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35',
                        btn.active
                          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                          : 'hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="px-2.5 py-1 text-xs">
                    <span>{btn.label}</span>
                    {btn.shortcut && (
                      <kbd className="ml-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {btn.shortcut}
                      </kbd>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </React.Fragment>
        ))}

        <span className="ml-auto hidden sm:inline-flex items-center rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/60">
          Markdown
        </span>
      </div>
    </TooltipProvider>
  );
});

function RichTextEditorBase({
  value,
  onChange,
  placeholder = 'Nhập nội dung... (hỗ trợ Markdown: ## tiêu đề, - danh sách, **đậm**, *nghiêng*)',
  className,
  minHeight = '120px',
  ariaLabel = 'Trình soạn thảo văn bản',
}: RichTextEditorProps) {
  const isInternalChangeRef = React.useRef(false);
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = React.useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    [placeholder]
  );

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions,
    content: normalizeInitialContent(value),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        class: 'tiptap outline-none text-sm leading-relaxed',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalChangeRef.current = true;
      const html = ed.isEmpty ? '' : ed.getHTML();
      onChangeRef.current(html);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    const currentHtml = editor.isEmpty ? '' : editor.getHTML();
    const normalized = normalizeInitialContent(value);
    if (currentHtml !== normalized) {
      editor.commands.setContent(normalized, false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-lg border border-input bg-background overflow-hidden',
          className
        )}
      >
        <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-7 w-7 rounded-md bg-muted animate-pulse"
            />
          ))}
        </div>
        <div
          className="p-3 space-y-2 animate-pulse"
          style={{ minHeight }}
          aria-busy="true"
          aria-label="Đang tải trình soạn thảo"
        >
          <div className="h-3.5 w-2/5 rounded bg-muted/70" />
          <div className="h-3.5 w-3/5 rounded bg-muted/50" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-input bg-background overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        className
      )}
    >
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export const RichTextEditor = React.memo(RichTextEditorBase);
