import { RemoteExecutor } from '../remoteExecutor';
import {
  setupRemoteWorkspace,
  ensureRemoteWorkspaceExists,
} from '../remoteWorkspace';
import { RemoteExecConfig } from '../../utils/types';

// Ex usage : npx dotenv -e .env.test -- npx jest remoteWorkspace.e2e.test.ts

// WinRM environment variables
const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

// SSH environment variables
const { JEST_SSH_KEY, JEST_SSH_USER, JEST_SSH_HOST } = process.env;

const hasWinRMConfig = JEST_WINRM_PASS && JEST_WINRM_USER && JEST_WINRM_HOST;
const hasSSHConfig = JEST_SSH_KEY && JEST_SSH_USER && JEST_SSH_HOST;

if (!hasWinRMConfig && !hasSSHConfig) {
  throw new Error(
    'Missing environment variables. Provide either WinRM (JEST_WINRM_*) or SSH (JEST_SSH_*) credentials.'
  );
}

// WinRM Tests (Windows)
const describeWinRM = hasWinRMConfig ? describe : describe.skip;
describeWinRM('RemoteWorkspace - WinRM (Windows)', () => {
  const testWorkspacePath = `C:\\Users\\${JEST_WINRM_USER}\\2501-test-workspace`;

  const remoteExecConfig: RemoteExecConfig = {
    enabled: true,
    target: JEST_WINRM_HOST!,
    port: 5985,
    type: 'winrm',
    platform: 'windows',
    user: JEST_WINRM_USER!,
    remote_workspace: testWorkspacePath,
    password: JEST_WINRM_PASS,
  };

  beforeAll(async () => {
    RemoteExecutor.instance.init(remoteExecConfig);
    await RemoteExecutor.instance.validateConnection();
  });

  afterAll(async () => {
    const cleanupCmd = `if (Test-Path "${testWorkspacePath}") { Remove-Item -Path "${testWorkspacePath}" -Recurse -Force }`;
    await RemoteExecutor.instance.executeCommand(cleanupCmd);
    await RemoteExecutor.instance.disconnect();
  });

  it('ensureRemoteWorkspaceExists should not throw', async () => {
    await expect(
      ensureRemoteWorkspaceExists(true, testWorkspacePath)
    ).resolves.not.toThrow();
  });

  it('setupRemoteWorkspace should return expected path', async () => {
    const workspacePath = await setupRemoteWorkspace(remoteExecConfig, {
      remoteWorkspace: testWorkspacePath,
    });
    expect(workspacePath).toBe(testWorkspacePath);
  });

  it('setupRemoteWorkspace should return default path when not provided', async () => {
    const workspacePath = await setupRemoteWorkspace(remoteExecConfig, {});
    expect(workspacePath).toBe('C:\\ProgramData\\2501\\');
  });

  it('ensureRemoteWorkspaceExists should be idempotent', async () => {
    await expect(
      ensureRemoteWorkspaceExists(true, testWorkspacePath)
    ).resolves.not.toThrow();
    await expect(
      ensureRemoteWorkspaceExists(true, testWorkspacePath)
    ).resolves.not.toThrow();
  });
});

// SSH Tests (Unix)
const describeSSH = hasSSHConfig ? describe : describe.skip;
describeSSH('RemoteWorkspace - SSH (Unix)', () => {
  const testWorkspacePath = `/home/${JEST_SSH_USER}/2501-test-workspace`;

  const remoteExecConfig: RemoteExecConfig = {
    enabled: true,
    target: JEST_SSH_HOST!,
    port: 22,
    type: 'ssh',
    platform: 'unix',
    user: JEST_SSH_USER!,
    remote_workspace: testWorkspacePath,
    private_key: JEST_SSH_KEY,
  };

  beforeAll(async () => {
    RemoteExecutor.instance.init(remoteExecConfig);
    await RemoteExecutor.instance.validateConnection();
  });

  afterAll(async () => {
    const cleanupCmd = `rm -rf "${testWorkspacePath}"`;
    await RemoteExecutor.instance.executeCommand(cleanupCmd, undefined, true);
    await RemoteExecutor.instance.disconnect();
  });

  it('ensureRemoteWorkspaceExists should not throw', async () => {
    await expect(
      ensureRemoteWorkspaceExists(false, testWorkspacePath)
    ).resolves.not.toThrow();
  });

  it('setupRemoteWorkspace should return expected path', async () => {
    const workspacePath = await setupRemoteWorkspace(remoteExecConfig, {
      remoteWorkspace: testWorkspacePath,
    });
    expect(workspacePath).toBe(testWorkspacePath);
  });

  it('setupRemoteWorkspace should return default path when not provided', async () => {
    const workspacePath = await setupRemoteWorkspace(remoteExecConfig, {});
    expect(workspacePath).toBe(`/home/${JEST_SSH_USER}/.2501/workspace`);
  });

  it('ensureRemoteWorkspaceExists should be idempotent', async () => {
    await expect(
      ensureRemoteWorkspaceExists(false, testWorkspacePath)
    ).resolves.not.toThrow();
    await expect(
      ensureRemoteWorkspaceExists(false, testWorkspacePath)
    ).resolves.not.toThrow();
  });
});
