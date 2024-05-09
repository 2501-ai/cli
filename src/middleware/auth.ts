import { readConfig } from "../utils/conf";

export async function authMiddleware(){
    const config = await readConfig();
    if(!config || !config.api_key){
        console.log('Please run the command `@2501 set api_key {YOUR_API_KEY}` to configure the API key before running any other command.');
        process.exit(1);
    }
}