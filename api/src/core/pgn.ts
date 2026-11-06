// Single-game PGN move text parser, replacing cachCore/utils/PGNParser.cs. Used to load test games.

export class PgnError extends Error {}

export function parsePgnPlies(pgn: string): string[] {
  const text = pgn.replace(/\s+(1\/2-1\/2|0-1|1-0)?\s*$/, '');
  const plies: string[] = [];
  let moveNumber = 1;
  for (const part of text.trim().split(/\s+/).filter(Boolean)) {
    const match = /^(\d+)\.\s*(.*)$/.exec(part);
    if (!match) {
      plies.push(part);
      continue;
    }
    if (Number(match[1]) !== moveNumber) throw new PgnError(`Unexpected move sequence number: ${match[1]}`);
    moveNumber++;
    if (match[2]) plies.push(match[2]);
  }
  return plies;
}
