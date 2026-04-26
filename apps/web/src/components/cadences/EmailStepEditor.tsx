'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TOKENS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{rep_name}}', '{{deal_value}}'];

export function EmailStepEditor({ value, onChange, placeholder = 'Write your email...' }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: value,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
  }, [editor, value]);

  const insertToken = (token: string) => {
    editor?.chain().focus().insertContent(token).run();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-sm font-bold ${editor?.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`rounded px-2 py-1 text-sm italic ${editor?.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`rounded px-2 py-1 text-sm ${editor?.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}`}
        >
          • List
        </button>
        <div className="mx-1 h-4 w-px bg-gray-300" />
        <span className="me-1 text-xs text-gray-500">Insert:</span>
        {TOKENS.map((token) => (
          <button
            type="button"
            key={token}
            onClick={() => insertToken(token)}
            className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
          >
            {token}
          </button>
        ))}
      </div>
      <div className="prose prose-sm min-h-[200px] max-w-none p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
