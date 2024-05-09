import { API_HOST, API_VERSION } from '../constants';
import { readConfig, setValue } from '../utils/conf';

export async function setCommand() {
    const config = await readConfig();
    if (!config) return;
    
    const key = process.argv[3];
    const value = process.argv[4];
    
    if (!key) {
        console.error('Please provide a key to set.');
        return;
    }
    
    if (!value) {
        console.error('Please provide a value to set.');
        return;
    }
    
    if (key === 'api_key') {
        await setValue(key, value);
        console.log('API key set successfully.');
    } else {
        console.error('Invalid key.');
    }
}