import fs from 'fs';
import path from 'path';

import { parseChunkedMessages } from '../streams';

describe('streams', () => {
  let streamChunks: string[];

  beforeAll(() => {
    const streamChunksRaw = fs.readFileSync(
      `${__dirname}${path.sep}mocks/streams.mock.jsonl`,
      'utf-8'
    );

    expect(streamChunksRaw).toBeTruthy();

    streamChunks = streamChunksRaw.split('\n');
    expect(streamChunks.length).toEqual(3);
  });

  it('should parseChunkedMessages with multiple chunks correctly ', () => {
    const { remaining, parsed } = parseChunkedMessages(streamChunks[0]);

    expect(remaining).toBe('');
    expect(parsed.length).toBe(3);
  });

  it('should parseChunkedMessages with escaped double quotes correctly ', () => {
    const { remaining, parsed } = parseChunkedMessages(streamChunks[1]);

    expect(remaining).toBe('');
    expect(parsed.length).toBe(1);
  });

  it('should parseChunks with curly braces in it', () => {
    const { remaining, parsed } = parseChunkedMessages(streamChunks[2]);

    expect(remaining).toBe('');
    expect(parsed.length).toBe(5);
  });

  it('should have remains when content is incomplete', () => {
    const content = '{"status":"chunked_message","message":"';
    const { remaining, parsed } = parseChunkedMessages(content);

    expect(remaining).toBe(content);
    expect(parsed.length).toBe(0);
  });

  it('should parse content fully', () => {
    const content =
      '{"status":"chunked_message","message":"\\\\\\""}{"status":"chunked_message","message":"\\\\\\""}';
    const { remaining, parsed } = parseChunkedMessages(content);

    expect(remaining).toBe('');
    expect(parsed.length).toBe(2);
  });

  it('should have remains when trying to parse an incomplete content', () => {
    const content = '{"status":"chunked_message","message":"}';
    const { remaining, parsed } = parseChunkedMessages(content);

    expect(remaining).toBe(content);
    expect(parsed.length).toBe(0);
  });

  it('should have remains when invalid content is given', () => {
    const content = `{"status":"chunked_message","message":"\\"}`;
    const { remaining, parsed } = parseChunkedMessages(content);

    expect(remaining).toBe(content);
    expect(parsed.length).toBe(0);
  });
  it('should have remains when invalid content is given #2', () => {
    const content = `{"status":"chunked_message","message":"}`;
    const { remaining, parsed } = parseChunkedMessages(content);

    expect(remaining).toBe(content);
    expect(parsed.length).toBe(0);
  });
});
