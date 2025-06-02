import axios from 'axios';
import { terminal } from 'terminal-kit';

import { API_HOST, API_VERSION } from '../constants';
import Logger from '../utils/logger';
import { withErrorHandler } from '../middleware/errorHandler';

export const configCommand = withErrorHandler(async () => {
  const logger = new Logger();
  try {
    logger.start('Fetching configurations...');
    const response = await axios.get(
      `${API_HOST}${API_VERSION}/configurations`
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
});
