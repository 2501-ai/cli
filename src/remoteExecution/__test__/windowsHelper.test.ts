import { sanitizeWindowsOutput, isCommandNotFound } from '../windowsHelper';

describe('sanitizeWindowsOutput', () => {
  it('should normalize CRLF to LF', () => {
    const input = '{\r\n    "foo": 1\r\n}';
    expect(sanitizeWindowsOutput(input)).toBe('{\n    "foo": 1\n}');
  });

  it('should normalize standalone CR to LF', () => {
    expect(sanitizeWindowsOutput('line1\rline2')).toBe('line1\nline2');
  });

  it('should remove null bytes and other junk', () => {
    expect(sanitizeWindowsOutput('hello\u0000world')).toBe('helloworld');
  });

  it('should preserve tabs and newlines', () => {
    expect(sanitizeWindowsOutput('col1\tcol2\nrow2')).toBe('col1\tcol2\nrow2');
  });

  it('should produce valid JSON from PowerShell output', () => {
    const psOutput = '{\r\n    "PostgreSQL": 4,\r\n    "Celery": true\r\n}';
    const result = sanitizeWindowsOutput(psOutput);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('should sanitize PowerShell ConvertTo-Json output', () => {
    // Simulates raw PowerShell output with Windows line endings
    const psOutput =
      '{\r\n    "PostgreSQL":  4,\r\n    "Celery":  true,\r\n    "RabbitMQ":  4,\r\n    "Flower":  4\r\n}';

    const result = sanitizeWindowsOutput(psOutput);
    console.log(result);

    // Should normalize CRLF to LF
    expect(result).not.toContain('\r\n');
    expect(result).not.toContain('\r');

    // Should preserve structure
    expect(result).toContain('\n');

    // Should be valid, parseable JSON
    expect(() => JSON.parse(result)).not.toThrow();

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      PostgreSQL: 4,
      Celery: true,
      RabbitMQ: 4,
      Flower: 4,
    });
  });

  it('should handle mixed escaped/unescaped line endings', () => {
    // The weird case: \r escaped but \n literal
    const weirdOutput = '{\\\r\n    "test": 1\\\r\n}';
    expect(() => JSON.parse(weirdOutput)).toThrow();
    const result = sanitizeWindowsOutput(weirdOutput);

    expect(result).not.toContain('\r');
    expect(result).toContain('\n');
  });
});

describe('isCommandNotFound', () => {
  it('should detect "not recognized" errors', () => {
    expect(
      isCommandNotFound(
        "'foo' is not recognized as an internal or external command"
      )
    ).toBe(true);
  });

  it('should return false for valid output', () => {
    expect(isCommandNotFound('C:\\Windows\\System32\\cmd.exe')).toBe(false);
  });
});
