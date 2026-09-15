import { Fragment, type ReactNode } from "react";

export function HelpMarkdown({
  markdown,
  onDocument,
}: {
  markdown: string;
  onDocument?: (slug: string) => void;
}) {
  const blocks: ReactNode[] = [];
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "), onDocument)}</p>);
    paragraph = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const Tag = heading[1].length < 3 ? "h2" : "h3";
      blocks.push(<Tag key={blocks.length}>{inline(heading[2], onDocument)}</Tag>);
      continue;
    }
    const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      flush();
      blocks.push(
        <div className="markdown-list-row" key={blocks.length}>
          <span>•</span>
          <p>{inline(item[1], onDocument)}</p>
        </div>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      blocks.push(<blockquote key={blocks.length}>{inline(line.replace(/^>\s?/, ""), onDocument)}</blockquote>);
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return <div className="markdown">{blocks}</div>;
}

function inline(text: string, onDocument?: (slug: string) => void) {
  const output: ReactNode[] = [];
  const token = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  for (const [index, match] of [...text.matchAll(token)].entries()) {
    if ((match.index || 0) > cursor) output.push(text.slice(cursor, match.index));
    const value = match[0];
    if (value.startsWith("**")) output.push(<strong key={index}>{value.slice(2, -2)}</strong>);
    else if (value.startsWith("`")) output.push(<code key={index}>{value.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = link?.[2] || "";
      if (/^\/[a-z0-9-]+$/i.test(href) && onDocument) {
        output.push(
          <button className="markdown-link" type="button" key={index} onClick={() => onDocument(href.slice(1))}>
            {link?.[1]}
          </button>,
        );
      } else {
        output.push(
          <a key={index} href={href} target="_blank" rel="noreferrer">
            {link?.[1]}
          </a>,
        );
      }
    }
    cursor = (match.index || 0) + value.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return <>{output.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>;
}
