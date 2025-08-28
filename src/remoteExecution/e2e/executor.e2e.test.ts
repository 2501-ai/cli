import { detectPromptWithLLM } from '../../helpers/api';
import { authMiddleware } from '../../middleware/auth';
import { RemoteExecutor } from '../remoteExecutor';

const { JEST_WINRM_PASS, JEST_WINRM_USER, JEST_WINRM_HOST } = process.env;

if (!JEST_WINRM_PASS || !JEST_WINRM_USER || !JEST_WINRM_HOST) {
  throw new Error('Missing environment variables');
}
// Ex usage : npx dotenv -e .env.test -- npx jest executor.test.ts
// Skip it not to make it run in the CI.
describe('RemoteExecutor - WinRM', () => {
  beforeAll(async () => {
    await authMiddleware();
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
    expect(result.stdout).toContain('EC2AMAZ-3MERTNG');
  });
  it.skip('should execute sql command', async () => {
    const cmd =
      'cd C:\\Users\\administrator ; sqlcmd -Q "SELECT name FROM sys.databases"';
    const result = await RemoteExecutor.instance.executeCommand(cmd);
    expect(result.stdout).toContain('Microsoft ODBC Driver 17 for SQL Server');
  }, 30_000);

  it('Should handle an interactive prompt', async () => {
    const cmd = 'powershell -Command "Get-Service -Name hostname"';
    const onPrompt = async (command: string, stdout: string) => {
      console.log('onPrompt', command, stdout);
      return 'John';
    };
    const detectPrompt = async (content: string) => {
      console.log('detectPrompt', content);
      const { response } = await detectPromptWithLLM('123', '123', content);
      return response === 'yes';
    };
    const result = await RemoteExecutor.instance.executeCommand(
      cmd,
      '',
      false,
      onPrompt,
      detectPrompt
    );
    expect(result.stdout).toContain('Hello,');
  }, 30_000);
});
