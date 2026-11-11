'use client';

import * as React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Heading2,
  Quote,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
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

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Nhập nội dung... (hỗ trợ Markdown: # tiêu đề, - danh sách, **đậm**, *nghiêng*)',
  className,
  minHeight = '120px',
}: RichTextEditorProps) {
  const isInternalChangeRef = React.useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
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
    content: normalizeInitialContent(value),
    editorProps: {
      attributes: {
        class: 'tiptap outline-none',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalChangeRef.current = true;
      const html = ed.isEmpty ? '' : ed.getHTML();
      onChange(html);
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
          'rounded-md border border-input bg-background p-3 text-sm text-muted-foreground',
          className
        )}
        style={{ minHeight }}
      >
        Đang tải trình soạn thảo...
      </div>
    );
  }

  const toolbarButtons = [
    {
      label: 'In đậm (Ctrl+B)',
      icon: Bold,
      active: editor.isActive('bold'),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'In nghiêng (Ctrl+I)',
      icon: Italic,
      active: editor.isActive('italic'),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Tiêu đề (# )',
      icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Danh sách (- )',
      icon: List,
      active: editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Danh sách số (1. )',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Checklist (- [ ])',
      icon: CheckSquare,
      active: editor.isActive('taskList'),
      onClick: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: 'Trích dẫn (> )',
      icon: Quote,
      active: editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Mã nguồn (```)',
      icon: Code,
      active: editor.isActive('codeBlock'),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1">
        {toolbarButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <button
              key={btn.label}
              type="button"
              title={btn.label}
              onClick={btn.onClick}
              className={cn(
                'p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
                btn.active && 'bg-primary/15 text-primary font-medium'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-muted-foreground hidden sm:inline px-1">
          Hỗ trợ Markdown
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

