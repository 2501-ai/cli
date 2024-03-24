import { Command } from 'commander';
import axios from 'axios';

// Define API configuration variables
const apiHost = 'http://localhost:1337';
const apiVersion = '/api/v1';

const program = new Command();

program
  .name('2501')
  .description('CLI to wrap an API');

program.command('config')
  .description('Fetch configuration from API')
  .action(async () => {
    try {
      const response = await axios.get(`${apiHost}${apiVersion}/configurations`);
      console.log(response.data);
    } catch (error) {
      if (error instanceof Error) { // Type-check the error object
        console.error('Failed to fetch configurations:', error.message);
      } else {
        console.error('An unexpected error occurred');
      }
    }
  });

program.parse(process.argv);