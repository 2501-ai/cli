import {
  configureRemoteExecution,
  parseConnectionString,
} from '../connectionParser';

describe('configureRemoteExecution for unix', () => {
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
      password: undefined,
      platform: 'unix',
      private_key: undefined,
      remote_workspace: '',
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
      password: undefined,
      platform: 'unix',
      private_key: undefined,
      remote_workspace: '',
    });
  });
});

describe('configureRemoteExecution for winrm', () => {
  it('should configure remote execution for winrm', () => {
    const config = configureRemoteExecution({
      remoteExec: 'user@host:5985',
      remoteExecType: 'winrm',
    });
    expect(config).toEqual({
      enabled: true,
      target: 'host',
      port: 5985,
      type: 'winrm',
      user: 'user',
      password: undefined,
      platform: 'windows',
      private_key: undefined,
      remote_workspace: '',
    });
  });
  it('should configure remote execution with default port', () => {
    const config = configureRemoteExecution({
      remoteExec: 'user@host',
      remoteExecType: 'winrm',
    });
    expect(config).toEqual({
      enabled: true,
      target: 'host',
      port: 5985,
      type: 'winrm',
      user: 'user',
      password: undefined,
      platform: 'windows',
      private_key: undefined,
      remote_workspace: '',
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
    expect(() => parseConnectionString('user@host 22')).toThrow(
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

  it('should parse UPN username for WinRM (user@domain.com format)', () => {
    const config = parseConnectionString(
      'user@company.com@192.168.1.1',
      'winrm'
    );
    expect(config).toEqual({
      user: 'user@company.com',
      host: '192.168.1.1',
      port: '5985',
    });
  });

  it('should parse UPN username with hostname and port for WinRM', () => {
    const config = parseConnectionString(
      'user@company.com@myserver.local:5985',
      'winrm'
    );
    expect(config).toEqual({
      user: 'user@company.com',
      host: 'myserver.local',
      port: '5985',
    });
  });

  it('should parse Windows domain username (DOMAIN\\user format)', () => {
    const config = parseConnectionString('DOMAIN\\user@192.168.1.1', 'winrm');
    expect(config).toEqual({
      user: 'DOMAIN\\user',
      host: '192.168.1.1',
      port: '5985',
    });
  });

  it('should parse Windows domain username with port', () => {
    const config = parseConnectionString('DOMAIN\\user@host:5985', 'winrm');
    expect(config).toEqual({
      user: 'DOMAIN\\user',
      host: 'host',
      port: '5985',
    });
  });
});
