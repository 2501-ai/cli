import { parseChunkedMessages, UPDATE_FILE_DELIMITERS } from '../streams';

const mockedContent =
  '{"status":"in_progress","message":"Processing"}{"status":"in_progress","message":"Processing"}{"status":"requires_action","actions":[{"function":"run_shell","args":{"answer":"Creating project structure and initializing Node.js project","command":"cd /Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39 && mkdir sample-express-app && cd sample-express-app && npm init -y"}},{"function":"update_file","args":{"answer":"Updating package.json with TypeScript and other dependencies","path":"/Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39/sample-express-app/package.json","sectionsDiff":["<<<<<\\n  \\"main\\": \\"index.js\\",\\n  \\"scripts\\": {\\n    \\"test\\": \\"echo \\\\\\"Error: no test specified\\\\\\" && exit 1\\"\\n  },\\n=====\\n  \\"main\\": \\"dist/app.js\\",\\n  \\"scripts\\": {\\n    \\"start\\": \\"node dist/app.js\\",\\n    \\"dev\\": \\"ts-node src/app.ts\\",\\n    \\"build\\": \\"tsc\\"\\n  },\\n>>>>>\\n","<<<<<\\n  \\"keywords\\": [],\\n  \\"author\\": \\"\\",\\n  \\"license\\": \\"ISC\\"\\n}\\n=====\\n  \\"keywords\\": [],\\n  \\"author\\": \\"\\",\\n  \\"license\\": \\"ISC\\",\\n  \\"dependencies\\": {\\n    \\"express\\": \\"^4.17.1\\"\\n  },\\n  \\"devDependencies\\": {\\n    \\"@types/express\\": \\"^4.17.13\\",\\n    \\"@types/node\\": \\"^16.11.12\\",\\n    \\"typescript\\": \\"^4.5.2\\",\\n    \\"ts-node\\": \\"^10.4.0\\"\\n  }\\n}\\n>>>>>\\n"]}},{"function":"run_shell","args":{"answer":"Installing dependencies","command":"cd /Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39/sample-express-app && npm install"}},{"function":"write_file","args":{"answer":"Creating tsconfig.json file","path":"/Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39/sample-express-app/tsconfig.json","content":"{\\n  \\"compilerOptions\\": {\\n    \\"target\\": \\"es6\\",\\n    \\"module\\": \\"commonjs\\",\\n    \\"outDir\\": \\"./dist\\",\\n    \\"rootDir\\": \\"./src\\",\\n    \\"strict\\": true,\\n    \\"esModuleInterop\\": true,\\n    \\"skipLibCheck\\": true,\\n    \\"forceConsistentCasingInFileNames\\": true\\n  },\\n  \\"include\\": [\\"src/**/*\\"],\\n  \\"exclude\\": [\\"node_modules\\"]\\n}"}},{"function":"write_file","args":{"answer":"Creating src/app.ts file","path":"/Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39/sample-express-app/src/app.ts","content":"import express from \'express\';\\nimport { todos } from \'./todos\';\\n\\nconst app = express();\\nconst port = 3000;\\n\\napp.use(express.json());\\n\\napp.get(\'/\', (req, res) => {\\n  res.send(\'Hello, World!\');\\n});\\n\\napp.get(\'/todos\', (req, res) => {\\n  res.json(todos);\\n});\\n\\napp.listen(port, () => {\\n  console.log(`Server running at http://localhost:${port}`);\\n});\\n\\nexport default app;"}},{"function":"write_file","args":{"answer":"Creating src/todos.ts file with 5 todos","path":"/Users/shide/Developments/2501-ai/honest_benchmark/datasets/honest_39/sample-express-app/src/todos.ts","content":"export const todos = [\\n  {\\n    id: 1,\\n    title: \'Implement user authentication\',\\n    completed: false\\n  },\\n  {\\n    id: 2,\\n    title: \'Add input validation for request bodies\',\\n    completed: false\\n  },\\n  {\\n    id: 3,\\n    title: \'Implement error handling middleware\',\\n    completed: false\\n  },\\n  {\\n    id: 4,\\n    title: \'Add request logging\',\\n    completed: false\\n  },\\n  {\\n    id: 5,\\n    title: \'Implement rate limiting for API endpoints\',\\n    completed: false\\n  }\\n];"}}],"message":"Certainly! I\'ll create a sample Node.js Express app using TypeScript, install the dependencies, and add at least 5 todos in the code without running it. Let\'s go through this step-by-step.\\n\\nFirst, let\'s create the project structure and initialize the Node.js project:\\n\\n\\n\\nNow, let\'s update the package.json file to include TypeScript and other dependencies:\\n\\n\\n\\nNow, let\'s install the dependencies:\\n\\n\\n\\nNext, let\'s create the TypeScript configuration file:\\n\\n\\n\\nNow, let\'s create the main app.ts file:\\n\\n\\n\\nFinally, let\'s create a todos.ts file with at least 5 todos:\\n\\n\\n\\nI have now created a sample Node.js Express app using TypeScript, installed the dependencies, and added 5 todos in the code. The project structure is set up, and a basic Express app is implemented with a separate file for todos.\\n\\nHere\'s a summary of the todos added in the todos.ts file:\\n\\n1. Implement user authentication\\n2. Add input validation for request bodies\\n3. Implement error handling middleware\\n4. Add request logging\\n5. Implement rate limiting for API endpoints\\n\\nThe app is now ready for further development and customization. As requested, I have not run the app. You can start the development server using `npm run dev` or build the project using `npm run build` followed by `npm start` to run the compiled version when you\'re ready to test it.::","usage":null}';

describe('streams', () => {
  it('should parseChunkedMessages correctly ', () => {
    const { remaining, parsed } = parseChunkedMessages(
      mockedContent,
      UPDATE_FILE_DELIMITERS
    );

    expect(remaining).toBe('');
    expect(parsed.length).toBe(3);
  });
});
