import axios from 'axios';
import { terminal } from 'terminal-kit';

import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';
import { Logger } from '../utils/logger';

export async function configCommand() {
  try {
    const config = readConfig();
    const response = await axios.get(
      `${API_HOST}${API_VERSION}/configurations`,
      { headers: { Authorization: `Bearer ${config?.api_key}` } }
    );

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
  } catch (error) {
    if (error instanceof Error) {
      // Type-check the error object
      Logger.error('Failed to fetch configurations:', error.message);
    } else {
      Logger.error('An unexpected error occurred');
    }
  }
}
