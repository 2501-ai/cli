import { RemoteExecutor } from '../remoteExecutor';

const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

if (!JEST_WINRM_PASS || !JEST_WINRM_USER || !JEST_WINRM_HOST) {
  throw new Error('Missing environment variables');
}
// Ex usage : npx dotenv -e .env.test -- npx jest executor.test.ts
// Skip it not to make it run in the CI.
describe('RemoteExecutor - WinRM', () => {
  beforeAll(async () => {
    RemoteExecutor.instance.init({
      enabled: true,
      target: JEST_WINRM_HOST,
      port: 5985,
      type: 'winrm',
      platform: 'windows',
      user: JEST_WINRM_USER,
      remote_workspace: `C:\\Users\\${JEST_WINRM_USER}`,
      password: JEST_WINRM_PASS,
    });
    await RemoteExecutor.instance.validateConnection();
  });

  it('should retrieve the hostname', async () => {
    const cmd = 'hostname';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    console.log(result);
    expect(result).toContain('EC2AMAZ-3MERTNG');
  });

  it('should execute sql command', async () => {
    const cmd =
      'cd C:\\Users\\administrator ; sqlcmd -Q "SELECT name FROM sys.databases"';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    expect(result).toContain('master');
  }, 30_000);

  it('should Check if powershell patterns are working', async () => {
    const cmd =
      'cd . ; Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*celery*" } | Select-Object Id, ProcessName, CommandLine';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    console.log(result);
    expect(result).not.toContain('error');
  }, 30_000);
});
