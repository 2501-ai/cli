/**
 * Telemetry API Client
 */
import axios, { AxiosError } from 'axios';
import { TelemetryPayload } from './types';

/**
 * Send telemetry to API
 */
export const sendTelemetry = async (
  payload: TelemetryPayload
): Promise<void> => {
  try {
    await axios.post('/telemetry', payload, { timeout: 3_000 });
  } catch (error) {
    // Silent fail
    if (process.env.TFZO_DEBUG === 'true') {
      console.error(
        '[Telemetry] Failed to send:',
        (error as AxiosError).toJSON()
      );
    }
  }
};
