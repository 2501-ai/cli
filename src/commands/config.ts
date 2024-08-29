import axios from 'axios';
import { terminal } from 'terminal-kit';

import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';
import { Logger } from '../utils/logger';
import { TaskManager } from '../managers/taskManager';

export async function configCommand() {
  try {
    await TaskManager.run([
      {
        title: 'Fetching configurations...',
        task: async (ctx) => {
          const config = readConfig();
          ctx.response = await axios.get(
            `${API_HOST}${API_VERSION}/configurations`,
            { headers: { Authorization: `Bearer ${config?.api_key}` } }
          );
        },
      },
      {
        title: 'Displaying configurations...',
        task: async (ctx) => {
          const { response } = ctx;
          terminal.table(
            [
              ['ID', 'Description'],
              ...response.data.map((c: { id: string; description: string }) => [
                c.id,
                c.description,
              ]),
            ],
            {
              hasBorder: true,
              contentHasMarkup: true,
              borderChars: 'lightRounded',
              borderAttr: { color: 'blue' },
              textAttr: { bgColor: 'default' },
              firstRowTextAttr: { bgColor: 'blue' },
              width: 80,
              fit: true,
            }
          );
        },
      },
    ]);
  } catch (error) {
    Logger.error('Failed to fetch configurations:', error);
  }
}
