import axios from 'axios';
import { terminal } from 'terminal-kit';

import { API_HOST, API_VERSION } from '../constants';
import { readConfig } from '../utils/conf';
import Logger from '../utils/logger';

export async function configCommand() {
  const logger = new Logger();
  try {
    logger.start('Fetching configurations...');

    const config = readConfig();
    const response = await axios.get(
      `${API_HOST}${API_VERSION}/configurations`,
      {
        headers: { Authorization: `Bearer ${config?.api_key}` },
      }
    );

    logger.stop('Configurations fetched successfully.');
    logger.outro('Configurations :');

    terminal.table(
      [
        ['Key', 'Description'],
        ...response.data.map((c: { key: string; description: string }) => [
          c.key,
          c.description,
        ]),
      ],
      {
        // hasBorder: true,
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
    Logger.error('Failed to fetch configurations:');
  }
}
