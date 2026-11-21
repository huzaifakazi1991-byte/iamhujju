'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

function CodeBlock({ children, onCopy }: { children: React.ReactNode; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3">
      <pre className="overflow-x-auto rounded-xl bg-[#1e1b15] text-[#f5f1e8] dark:bg-black/50">{children}</pre>
      <button
        className="absolute right-2 top-2 rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
        onClick={async () => {
          const code = document.activeElement?.closest('div')?.querySelector('pre')?.textContent ?? '';
          await navigator.clipboard.writeText(code);
          setCopied(true);
          onCopy?.();
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat text-[0.95rem] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: (props) => <CodeBlock>{props.children}</CodeBlock>,
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
