import path from 'path';
import { getDirectoryFiles } from '../files';
import { IgnoreManager } from '../ignore';
import { DEFAULT_MAX_DEPTH, DEFAULT_MAX_DIR_SIZE } from '../../constants';

describe('getDirectoryFiles', () => {
  let ignoreManagerInstance: IgnoreManager;
  const mockBasePath = path.join(__dirname, 'mocks/workspace');

  beforeEach(() => {
    ignoreManagerInstance = new IgnoreManager();
    jest
      .spyOn(IgnoreManager, 'getInstance')
      .mockImplementation(() => ignoreManagerInstance);
  });

  it('should return the correct file hashes for mock dir', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: '',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(2827);
    expect(result.fileHashes.size).toEqual(4);
    expect(result.fileHashes.has('example/.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('example/index.html')).toStrictEqual(true);
    expect(result.fileHashes.has('example/other/.gitignore')).toStrictEqual(
      true
    );
    expect(result.fileHashes.has('example/other/myfile.csv')).toStrictEqual(
      true
    );
    expect(result.fileHashes.has('example/other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data/data.txt')).toStrictEqual(false);
  });

  it('should return the correct file hashes for mock dir and depth 1', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: 1,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: '',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(2822);
    expect(result.fileHashes.size).toEqual(2);
    expect(result.fileHashes.has('example/.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('example/index.html')).toStrictEqual(true);
    expect(result.fileHashes.has('example/other/.gitignore')).toStrictEqual(
      false
    );
    expect(result.fileHashes.has('example/other/myfile.csv')).toStrictEqual(
      false
    );
    expect(result.fileHashes.has('example/other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data/data.txt')).toStrictEqual(false);
  });

  it('should return the correct file hashes for mock dir/other', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: 'example/other',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(5);
    expect(result.fileHashes.size).toEqual(2);

    expect(result.fileHashes.has('example/.gitignore')).toStrictEqual(false);
    expect(result.fileHashes.has('example/index.html')).toStrictEqual(false);
    expect(result.fileHashes.has('example/other/.gitignore')).toStrictEqual(
      true
    );
    expect(result.fileHashes.has('example/other/myfile.csv')).toStrictEqual(
      true
    );
    expect(result.fileHashes.has('example/other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data')).toStrictEqual(false);
    expect(result.fileHashes.has('example/data/data.txt')).toStrictEqual(false);
  });
});

describe('getDirectoryFiles from subfolder', () => {
  let ignoreManagerInstance: IgnoreManager;
  const mockBasePath = path.join(__dirname, 'mocks/workspace/example');

  beforeEach(() => {
    ignoreManagerInstance = new IgnoreManager();
    jest
      .spyOn(IgnoreManager, 'getInstance')
      .mockImplementation(() => ignoreManagerInstance);
  });

  it('should return the correct file hashes for mock dir', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: '',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(2827);
    expect(result.fileHashes.size).toEqual(4);
    expect(result.fileHashes.has('.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('index.html')).toStrictEqual(true);
    expect(result.fileHashes.has('other/.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('other/myfile.csv')).toStrictEqual(true);
    expect(result.fileHashes.has('other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('data')).toStrictEqual(false);
    expect(result.fileHashes.has('data/data.txt')).toStrictEqual(false);
  });

  it('should return the correct file hashes for mock dir and depth 1', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: 1,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: '',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(2827);
    expect(result.fileHashes.size).toEqual(4);
    expect(result.fileHashes.has('.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('index.html')).toStrictEqual(true);
    expect(result.fileHashes.has('other/.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('other/myfile.csv')).toStrictEqual(true);
    expect(result.fileHashes.has('other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('data')).toStrictEqual(false);
    expect(result.fileHashes.has('data/data.txt')).toStrictEqual(false);
  });

  it('should return the correct file hashes for mock dir/other', () => {
    const result = getDirectoryFiles({
      directoryPath: mockBasePath,
      maxDepth: DEFAULT_MAX_DEPTH,
      maxDirSize: DEFAULT_MAX_DIR_SIZE,
      currentPath: 'other',
      currentDepth: 0,
      currentTotalSize: 0,
      ignoreManager: ignoreManagerInstance,
    });

    expect(result.totalSize).toEqual(5);
    expect(result.fileHashes.size).toEqual(2);

    expect(result.fileHashes.has('.gitignore')).toStrictEqual(false);
    expect(result.fileHashes.has('index.html')).toStrictEqual(false);
    expect(result.fileHashes.has('other/.gitignore')).toStrictEqual(true);
    expect(result.fileHashes.has('other/myfile.csv')).toStrictEqual(true);
    expect(result.fileHashes.has('other/.env')).toStrictEqual(false);
    expect(result.fileHashes.has('data')).toStrictEqual(false);
    expect(result.fileHashes.has('data/data.txt')).toStrictEqual(false);
  });
});
