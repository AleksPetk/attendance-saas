import { Fragment, type ReactNode } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, space, type } from "../../theme/tokens";
import { classifyContentHref, stripLeadingDocumentTitle } from "./markdown";

const INLINE_TOKEN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

function Inline({ text, onDocument }: { text: string; onDocument: (slug: string) => void }) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    if ((match.index ?? 0) > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `inline-${index++}`;
    if (token.startsWith("`")) nodes.push(<Text key={key} style={styles.codeInline}>{token.slice(1, -1)}</Text>);
    else if (token.startsWith("**")) nodes.push(<Text key={key} style={styles.strong}>{token.slice(2, -2)}</Text>);
    else if (token.startsWith("*")) nodes.push(<Text key={key} style={styles.emphasis}>{token.slice(1, -1)}</Text>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const label = link?.[1] || token;
      const target = classifyContentHref(link?.[2] || "");
      if (target.kind === "internal-document") nodes.push(<Text accessibilityRole="link" key={key} onPress={() => onDocument(target.slug)} style={styles.link}>{label}</Text>);
      else if (target.kind === "external") nodes.push(<Text accessibilityRole="link" key={key} onPress={() => void Linking.openURL(target.href)} style={styles.link}>{label}</Text>);
      else nodes.push(label);
    }
    cursor = (match.index ?? 0) + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>;
}

function cells(line: string) { return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()); }

export function MarkdownContent({ markdown, title = "", onDocument }: { markdown: string; title?: string; onDocument: (slug: string) => void }) {
  const lines = stripLeadingDocumentTitle(markdown, title).replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const value = paragraph.join(" "); paragraph = [];
    blocks.push(<Text key={`p-${blocks.length}`} style={styles.paragraph}><Inline onDocument={onDocument} text={value} /></Text>);
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) { flush(); continue; }
    if (/^```/.test(line)) {
      flush(); const code: string[] = []; index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      blocks.push(<ScrollView horizontal key={`code-${blocks.length}`} style={styles.codeBlock}><Text style={styles.codeText}>{code.join("\n")}</Text></ScrollView>); continue;
    }
    if (line.includes("|") && index + 1 < lines.length && cells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      flush(); const headers = cells(line); const rows: string[][] = []; index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
      index -= 1;
      blocks.push(<ScrollView horizontal key={`table-${blocks.length}`}><View style={styles.table}>{[headers, ...rows].map((row, rowIndex) => <View key={rowIndex} style={[styles.tableRow, rowIndex === 0 && styles.tableHead]}>{headers.map((_, cellIndex) => <Text key={cellIndex} style={[styles.tableCell, rowIndex === 0 && styles.strong]}>{row[cellIndex] || ""}</Text>)}</View>)}</View></ScrollView>); continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) { flush(); blocks.push(<Text accessibilityRole="header" key={`h-${blocks.length}`} style={heading[1].length <= 2 ? styles.heading : styles.subheading}><Inline onDocument={onDocument} text={heading[2]} /></Text>); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push(<View key={`hr-${blocks.length}`} style={styles.rule} />); continue; }
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) { flush(); blocks.push(<View key={`q-${blocks.length}`} style={styles.quote}><Text style={styles.paragraph}><Inline onDocument={onDocument} text={quote[1]} /></Text></View>); continue; }
    const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) { flush(); blocks.push(<View key={`li-${blocks.length}`} style={styles.listRow}><Text style={styles.bullet}>•</Text><Text style={styles.listText}><Inline onDocument={onDocument} text={item[1]} /></Text></View>); continue; }
    paragraph.push(line.trim());
  }
  flush();
  return <View style={styles.content}>{blocks}</View>;
}

const styles = StyleSheet.create({
  content: { gap: space.md }, paragraph: { ...type.body, color: colors.textSecondary },
  heading: { ...type.headline, color: colors.text, marginTop: space.md }, subheading: { ...type.bodyStrong, color: colors.text, marginTop: space.sm },
  strong: { fontWeight: "700" }, emphasis: { fontStyle: "italic" }, link: { color: colors.blue, textDecorationLine: "underline" },
  codeInline: { fontFamily: "Courier", color: colors.navySoft, backgroundColor: colors.surfaceSubtle }, codeBlock: { backgroundColor: colors.navy, borderRadius: radii.sm, padding: space.md }, codeText: { fontFamily: "Courier", color: colors.textInverse, fontSize: 13, lineHeight: 19 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.cyan, backgroundColor: colors.surfaceMuted, padding: space.md, borderRadius: radii.sm },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.sm }, listRow: { flexDirection: "row", gap: space.sm }, bullet: { ...type.body, color: colors.blue }, listText: { ...type.body, color: colors.textSecondary, flex: 1 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, overflow: "hidden" }, tableRow: { flexDirection: "row" }, tableHead: { backgroundColor: colors.surfaceSubtle }, tableCell: { ...type.caption, color: colors.textSecondary, width: 160, padding: space.sm, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
});
