import { configureRemoteExecution, parseConnectionString } from '../index';

describe('configureRemoteExecution', () => {
  it('should configure remote execution for unix', () => {
    const config = configureRemoteExecution({
      remoteExec: 'user@host:22',
      remoteExecType: 'ssh',
    });
    expect(config).toEqual({
      enabled: true,
      target: 'host',
      port: 22,
      type: 'ssh',
      user: 'user',
    });
  });
  it('should configure remote execution with default port', () => {
    const config = configureRemoteExecution({
      remoteExec: 'user@host',
      remoteExecType: 'ssh',
    });
    expect(config).toEqual({
      enabled: true,
      target: 'host',
      port: 22,
      type: 'ssh',
      user: 'user',
    });
  });
});

describe('parseConnectionString', () => {
  it('should parse connection string', () => {
    const config = parseConnectionString('user@host:22');
    expect(config).toEqual({
      user: 'user',
      host: 'host',
      port: '22',
    });
  });

  it('should parse connection string with default port', () => {
    const config = parseConnectionString('user@host');
    expect(config).toEqual({
      user: 'user',
      host: 'host',
      port: '22',
    });
  });

  it('should throw an error if the connection string is invalid', () => {
    expect(() => parseConnectionString('user@host')).toThrow(
      'Invalid connection format. Use: user@host:port'
    );
  });

  it('should throw an error if the connection string is invalid', () => {
    expect(() => parseConnectionString('user@host:22 sshh')).toThrow(
      'Invalid connection format. Use: user@host:port'
    );
  });

  it('should throw an error if the connection string is invalid', () => {
    expect(() => parseConnectionString('user@host: 22 ssh')).toThrow(
      'Invalid connection format. Use: user@host:port'
    );
  });
});
