// Opening book reader and lookup. Replaces OpeningBookBuilder.Read, OpeningBookNode and
// OpeningBookSearch. Design section 9. Line format: <childCount>||<ply>||<variationName>.
import { readFile } from 'node:fs/promises';

export const MAX_BOOK_PLIES = 20;

interface BookNode {
  ply: string;
  /** Allocated only on nodes with children, which is most of the memory saving over C#. */
  children: Map<string, BookNode> | null;
}

/** OpeningBookNode.FixPly. */
export function fixPly(ply: string): string {
  let fixed = ply;
  if (/(!!|\?\?|!\?|\?!)$/.test(fixed)) fixed = fixed.slice(0, -2);
  if (/[+#!?]$/.test(fixed)) fixed = fixed.slice(0, -1);
  return fixed;
}

export class BookFormatError extends Error {}

export class OpeningBook {
  private readonly root: BookNode;
  readonly nodeCount: number;

  private constructor(root: BookNode, nodeCount: number) {
    this.root = root;
    this.nodeCount = nodeCount;
  }

  static empty(): OpeningBook {
    return new OpeningBook({ ply: '', children: null }, 1);
  }

  static parse(text: string): OpeningBook {
    let cursor = 0;
    let nodeCount = 0;
    const nextLine = (): string => {
      if (cursor >= text.length) throw new BookFormatError('Unexpected end of opening book');
      let end = text.indexOf('\n', cursor);
      if (end < 0) end = text.length;
      const line = text.slice(cursor, end);
      cursor = end + 1;
      return line;
    };
    const readNode = (): BookNode | null => {
      const parts = nextLine().trim().split('||');
      const childCount = Number(parts[0]);
      if (parts.length < 2 || !Number.isInteger(childCount) || childCount < 0) {
        throw new BookFormatError(`Malformed opening book line near offset ${cursor}`);
      }
      const node: BookNode = { ply: fixPly(parts[1]), children: null };
      for (let i = 0; i < childCount; i++) {
        const child = readNode();
        if (child) (node.children ??= new Map()).set(child.ply, child);
      }
      if (parts[1] === '*') return null; // PGN result tokens are not moves (ledger E12).
      nodeCount++;
      return node;
    };
    const root = readNode() as BookNode;
    return new OpeningBook(root, nodeCount);
  }

  static async load(path: string): Promise<OpeningBook> {
    return OpeningBook.parse(await readFile(path, 'utf8'));
  }

  /** Replies from this game history, in file order. Empty past the limit or off the book. */
  lookup(plies: string[]): string[] {
    if (plies.length >= MAX_BOOK_PLIES) return [];
    let node = this.root;
    for (const ply of plies) {
      const next = node.children?.get(ply);
      if (!next) return [];
      node = next;
    }
    return node.children ? [...node.children.keys()] : [];
  }
}
