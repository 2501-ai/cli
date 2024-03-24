import axios from 'axios';

// Define API configuration variables
const apiHost = 'http://localhost:1337';
const apiVersion = '/api/v1';

export async function configCommand() {
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
}