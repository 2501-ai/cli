import fs from 'fs';
import path from 'path';

import { parseChunkedMessages, UPDATE_FILE_DELIMITERS } from '../streams';

describe('streams', () => {
  let chunks: string[];

  beforeAll(() => {
    const chunksRaw = fs.readFileSync(
      `${__dirname}${path.sep}mocks/streams.mock.jsonl`,
      'utf-8'
    );

    expect(chunksRaw).toBeTruthy();

    chunks = chunksRaw.split('\n');
    expect(chunks.length).toEqual(2);
  });

  it('should parseChunkedMessages with multiple chunks correctly ', () => {
    const { remaining, parsed } = parseChunkedMessages(
      chunks[0],
      UPDATE_FILE_DELIMITERS
    );

    expect(remaining).toBe('');
    expect(parsed.length).toBe(3);
  });

  it('should parseChunkedMessages with a requires_action status correctly ', () => {
    const { remaining, parsed } = parseChunkedMessages(
      chunks[1],
      UPDATE_FILE_DELIMITERS
    );

    expect(remaining).toBe('');
    expect(parsed.length).toBe(1);
  });
});
