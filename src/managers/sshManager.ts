import { NodeSSH } from 'node-ssh';

export interface SSHConfig {
  host: string;
  username: string;
  privateKey?: string;
  password?: string;
}

export class SSHManager {
  private connections: Map<string, NodeSSH> = new Map();

  async connect(config: SSHConfig): Promise<string> {
    const ssh = new NodeSSH();
    await ssh.connect(config);

    const connectionId = crypto.randomUUID();
    this.connections.set(connectionId, ssh);
    return connectionId;
  }

  async executeCommand(connectionId: string, command: string): Promise<string> {
    const ssh = this.connections.get(connectionId);
    if (!ssh) throw new Error('No SSH connection found');

    const result = await ssh.execCommand(command);
    return result.stdout || result.stderr;
  }
}
