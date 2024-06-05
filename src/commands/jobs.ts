import axios from 'axios';

import { readConfig, listAgentsFromWorkspace } from '../utils/conf';
import { run_shell } from "../utils/actions";

import { API_HOST, API_VERSION } from '../constants';

export async function jobSubscriptionCommand(options: {
  subscribe?: boolean;
  workspace?: string;
  listen?: boolean;  
}): Promise<any> {
  const workspace = options.workspace || process.cwd();
  if(options.subscribe){
    const commandpath = await run_shell({command: `which @2501`});
    await run_shell({command: `(crontab -l 2>/dev/null; echo "* * * * * cd ${workspace} && ${commandpath} jobs --listen") | crontab -`})
    return console.log('Subscribed to the API for new jobs');
  }

  if(options.listen){
    try {
      const workspace = options.workspace || process.cwd();
      const config = await readConfig();

      const [agent] = await listAgentsFromWorkspace(workspace);

      console.log(`Listening for new jobs for agent ${agent.id}`);
      const response = await axios.get(
        `${API_HOST}${API_VERSION}/agents/${agent.id}/jobs?status=todo`,
        { headers: { Authorization: `Bearer ${config?.api_key}` } }
      );

      const jobs = response.data;
      if(!jobs.length){
        console.log('No jobs to execute');
        return;
      }

      console.log(`Found ${jobs.length} jobs to execute`);
      for(const idx in jobs){
        console.log(`Executing job ${idx} : "${jobs[idx].brief}"`);
      }

    } catch (error) {
      console.error(error);
    }
  }
}
