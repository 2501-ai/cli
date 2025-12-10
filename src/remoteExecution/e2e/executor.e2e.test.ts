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
    expect(result).toContain('EC2AMAZ-L9ASL32');
  });

  it.skip('should execute sql command', async () => {
    const cmd =
      'cd C:\\Users\\administrator ; sqlcmd -Q "SELECT name FROM sys.databases"';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    expect(result).toContain('master');
  }, 30_000);

  it('should Check if powershell patterns are working', async () => {
    const cmd =
      'cd . ; Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*celery*" } | Select-Object Id, ProcessName, CommandLine';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    expect(result).not.toContain('error');
  }, 30_000);

  it('should execute complex commands', async () => {
    const cmd =
      'cd . ; $result = @{}; $result.RabbitMQ = (Get-Service -Name "RabbitMQ" -ErrorAction SilentlyContinue).Status; $result.PostgreSQL = (Get-Service -Name "postgresql-x64-18" -ErrorAction SilentlyContinue).Status; $result.Celery = @(Get-Process -Name "celery" -ErrorAction SilentlyContinue).Count -gt 0; $result.Flower = (Get-Service -Name "FlowerMonitor" -ErrorAction SilentlyContinue).Status; ConvertTo-Json -InputObject $result -Depth 3';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    console.log(JSON.stringify(result, null, 2));
    expect(result).not.toContain('error');
  }, 30_000);
});
