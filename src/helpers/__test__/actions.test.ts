import * as fs from 'fs';
import { update_file } from '../actions';
import path from 'path';

describe('Action - sectionUpdate', () => {
  beforeEach(() => {
    // copy the mock file mocks/content.mock.jsonl to a temp file for edition
    fs.copyFileSync(
      `${__dirname}${path.sep}mocks/content.mock.jsonl`,
      `${__dirname}${path.sep}mocks/content.temp.jsonl`
    );
  });

  afterAll(() => {
    // remove the temporary file at the end of the tests.
    fs.unlinkSync(`${__dirname}${path.sep}mocks/content.temp.jsonl`);
  });

  it('should update a file correctly', () => {
    const action = {
      function: 'update_file',
      args: {
        answer:
          'Updating the config/honest_benchmark.jsonl file with new test questions',
        path: `${__dirname}${path.sep}mocks/content.temp.jsonl`,
        sectionsDiff: [
          '<PREVIOUS_SECTION>\n{"id": "honest_48", "input": "", ",test_script": "", ",tags": [""]}\n</PREVIOUS_SECTION><NEW_SECTION>\n{"id": "honest_48", "input": "What are the main causes of climate change?", "test_script": "output = \\"PASS\\" if any(keyword in open(\'./datasets/honest_48/answer.txt\').read().lower() for keyword in [\'greenhouse gases\', \'carbon dioxide\', \'deforestation\', \'fossil fuels\']) else \\"FAIL\\"", "tags": ["general_knowledge,environment,science"]}\n</NEW_SECTION>',
          '<PREVIOUS_SECTION>\n{"id": "honest_49", "input": "", ",test_script": "", ",tags": [""]}\n</PREVIOUS_SECTION><NEW_SECTION>\n{"id": "honest_49", "input": "Can you help me write a professional email to request a meeting with my boss?", "test_script": "output = \\"PASS\\" if all(keyword in open(\'./datasets/honest_49/email.txt\').read().lower() for keyword in [\'dear\', \'meeting\', \'sincerely\', \'thank you\']) else \\"FAIL\\"", "tags": ["writing,professional_communication,email"]}\n</NEW_SECTION>',
          '<PREVIOUS_SECTION>\n{"id": "honest_50", "input": "", ",test_script": "", ",tags": [""]}</PREVIOUS_SECTION><NEW_SECTION>\n{"id": "honest_50", "input": "What are some healthy meal prep ideas for a busy week?", "test_script": "output = \\"PASS\\" if len(open(\'./datasets/honest_50/meal_ideas.txt\').read().splitlines()) >= 3 else \\"FAIL\\"", "tags": ["health,nutrition,meal_planning"]}\n</NEW_SECTION>',
        ],
      },
    };

    const res = update_file(action.args);
    expect(res.includes('File updated')).toEqual(true);
  });

  it('should update a file correctly', () => {
    const action = {
      function: 'update_file',
      args: {
        answer:
          'Adding three new questions to the config/honest_benchmark.jsonl file',
        path: `${__dirname}${path.sep}mocks/content.temp.jsonl`,
        sectionsDiff: [
          '<PREVIOUS_SECTION>\n{"id": "honest_48", "input": "", ",test_script": "", ",tags": [""]}\n{"id": "honest_49", "input": "", ",test_script": "", ",tags": [""]}\n{"id": "honest_50", "input": "", ",test_script": "", ",tags": [""]}</PREVIOUS_SECTION><NEW_SECTION>\n{"id": "honest_48", "input": "Create a simple REST API using Flask that has endpoints for GET, POST, PUT, and DELETE operations on a \'users\' resource.", "test_script": "import requests; response = requests.get(\'http://localhost:5000/users\'); output = \'PASS\' if response.status_code == 200 else \'FAIL\'", "tags": ["python,flask,api,rest"]}\n{"id": "honest_49", "input": "Implement a basic machine learning model using scikit-learn to predict house prices based on features like square footage and number of bedrooms.", "test_script": "import os; output = \'PASS\' if os.path.exists(\'./datasets/honest_49/model.pkl\') else \'FAIL\'", "tags": ["python,machine-learning,scikit-learn"]}\n{"id": "honest_50", "input": "Create a React component that fetches data from an API and displays it in a table format with sorting capabilities.", "test_script": "import os; output = \'PASS\' if os.path.exists(\'./datasets/honest_50/src/components/DataTable.js\') else \'FAIL\'", "tags": ["javascript,react,api,frontend"]}\n</NEW_SECTION>',
        ],
      },
    };

    const res = update_file(action.args);
    expect(res.includes('File updated')).toEqual(true);
  });
});
