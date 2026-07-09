'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/cn';

interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  disabled?: boolean;
}

function ToolbarButton({
  editor: _editor,
  action,
  active,
  icon: Icon,
  title,
}: {
  editor: Editor;
  action: () => void;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={action}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
          : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Start typing...',
  className,
  minHeight = '120px',
  disabled,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden bg-white dark:bg-gray-900',
        disabled && 'opacity-60 pointer-events-none',
        className
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-gray-50 dark:bg-gray-800">
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          icon={Bold}
          title="Bold"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          icon={Italic}
          title="Italic"
        />
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={List}
          title="Bullet List"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          icon={ListOrdered}
          title="Numbered List"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          icon={Quote}
          title="Quote"
        />
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().undo().run()}
          active={false}
          icon={Undo}
          title="Undo"
        />
        <ToolbarButton
          editor={editor}
          action={() => editor.chain().focus().redo().run()}
          active={false}
          icon={Redo}
          title="Redo"
        />
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none dark:prose-invert px-3 py-2"
        style={{ minHeight }}
      />
    </div>
  );
}
