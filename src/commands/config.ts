import axios from 'axios';
import { terminal } from 'terminal-kit';

import Logger from '../utils/logger';

export const configCommand = async () => {
  const logger = new Logger();
  try {
    logger.start('Fetching configurations...');
    const response = await axios.get('/configurations');

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
    logger.stop('Failed to fetch configurations.', 1);
    throw error;
  }
};
