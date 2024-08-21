import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

import { applyContentUpdates } from '../actions';

// import modifyFileInput from './modify_file.mock.json';

const initialMockFileContent = fs.readFileSync(
  path.join(__dirname, './file.mock.ts'),
  'utf8'
);

/**
 * Removes lines from content.
 */
const removeLines = (
  content: string,
  [start, end]: [number, number?]
): string => {
  const data = content.split('\n');
  data.splice(start - 1, end && end >= 0 ? end - start : Infinity);
  return data.join('\n');
};

describe('utils/actions - applyContentUpdates', () => {
  beforeAll(() => {
    const test = `line1
    line2
    line3`;

    const test2 = `line1
    line3`;

    assert.equal(removeLines(test, [2, 3]).includes('line2'), false);
    assert.equal(removeLines(test, [2, 3]), test2);
    assert.equal(removeLines(test, [2]), 'line1');
  });

  it('should insert lines correctly #1', () => {
    const newContent = 'import fs from "fs";';
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: null,
        content: newContent,
      },
    ]);

    expect(result).toEqual(newContent + '\n' + initialMockFileContent);
  });

  it('should insert lines correctly #2', () => {
    const newContent =
      'export type NewFileMock = {\n' + '  metadata: any\n' + '} & FileMock\n';
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 7,
        lineEnd: null,
        content: newContent,
      },
    ]);

    expect(result).toEqual(
      removeLines(initialMockFileContent, [7]) +
        '\n' +
        newContent +
        '\n' +
        removeLines(initialMockFileContent, [1, 7])
    );
  });

  it('should insert lines correctly #3', () => {
    const newContent =
      'export type NewFileMock = {\n' + '  metadata: any\n' + '} & FileMock\n';
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 7,
        lineEnd: 7,
        content: newContent,
      },
    ]);

    expect(result).toEqual(
      removeLines(initialMockFileContent, [7]) +
        '\n' +
        newContent +
        '\n' +
        removeLines(initialMockFileContent, [1, 7])
    );
  });

  it('should replace content with same amount of content', () => {
    const newContent = `import fs from "fs";
interface FileMock {
  data: string;
  content: number;
  test: number;
}`;
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: 6,
        content: newContent,
      },
    ]);

    expect(result).toEqual(
      newContent + '\n' + removeLines(initialMockFileContent, [1, 6])
    );
  });

  it('should replace content with more content', () => {
    const newContent = `import fs from "fs";
interface FileMock {
  data: string;
  content: number;
  test: number;
}

export type Toto = 'toto';`;
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: 6,
        content: newContent,
      },
    ]);

    expect(result).toEqual(
      newContent + '\n' + removeLines(initialMockFileContent, [1, 6])
    );
  });

  it('should replace content with less content', () => {
    const newContent = `import fs from "fs";`;
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: 6,
        content: newContent,
      },
    ]);

    expect(result).toEqual(
      newContent + '\n' + removeLines(initialMockFileContent, [1, 6])
    );
  });

  it('should remove content properly #1', () => {
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: 6,
        content: '',
      },
    ]);

    expect(result).toEqual(removeLines(initialMockFileContent, [1, 6]));
  });

  it('should remove content properly #2', () => {
    const result = applyContentUpdates(initialMockFileContent, [
      {
        lineStart: 1,
        lineEnd: 6,
        content: null,
      },
    ]);

    expect(result).toEqual(removeLines(initialMockFileContent, [1, 6]));
  });
});
