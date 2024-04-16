import axios from 'axios';
import { API_HOST, API_VERSION } from '../constants';

export async function configCommand() {
  try {
    const response = await axios.get(`${API_HOST}${API_VERSION}/configurations`);
    console.log(response.data);
  } catch (error) {
    if (error instanceof Error) {
      // Type-check the error object
      console.error('Failed to fetch configurations:', error.message);
    } else {
      console.error('An unexpected error occurred');
    }
  }
}