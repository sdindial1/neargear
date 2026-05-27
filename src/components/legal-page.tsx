import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom renderers — Tailwind v4 doesn't ship `prose` utilities here, so each
// element is styled explicitly. Targets the navy/orange brand and prioritizes
// readability of long legal copy on mobile.
const components: Components = {
  h1: (props) => (
    <h1
      className="font-heading text-3xl md:text-4xl font-bold text-white mb-2"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="font-heading text-2xl md:text-3xl font-bold text-orange mt-12 mb-4"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="font-heading text-lg md:text-xl font-bold text-white mt-8 mb-3"
      {...props}
    />
  ),
  p: (props) => (
    <p className="text-base text-gray-200 leading-relaxed mb-4" {...props} />
  ),
  strong: (props) => (
    <strong className="text-orange-light font-semibold" {...props} />
  ),
  em: (props) => <em className="text-gray-300 italic" {...props} />,
  a: (props) => (
    <a
      className="text-orange underline underline-offset-2 hover:text-orange-light"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  ul: (props) => (
    <ul className="ml-6 my-4 space-y-2 list-disc text-gray-200" {...props} />
  ),
  ol: (props) => (
    <ol className="ml-6 my-4 space-y-2 list-decimal text-gray-200" {...props} />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  hr: () => <hr className="my-10 border-white/10" />,
  blockquote: (props) => (
    <blockquote
      className="border-l-4 border-orange pl-4 my-4 text-gray-300 italic"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="bg-white/10 text-orange-light px-1.5 py-0.5 rounded text-sm font-mono"
      {...props}
    />
  ),
  // Tables (remark-gfm).
  table: (props) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full border-collapse" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-orange/15" {...props} />,
  th: (props) => (
    <th
      className="text-left text-orange-light font-semibold p-3 border-b border-white/10"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="p-3 border-b border-white/10 text-gray-200 align-top"
      {...props}
    />
  ),
};

interface Props {
  content: string;
}

export function LegalPage({ content }: Props) {
  return (
    <div className="min-h-screen bg-[#071520] text-white">
      <div className="container mx-auto max-w-4xl px-4 py-12 md:py-20">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
