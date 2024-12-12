import fs from 'fs';

const diffSections = [
  "<PREVIOUS_SECTION>\nIn the stillness of the midnight hour,\nThe moon whispers secrets untold,\nDreams take flight on silver wings,\nIn the night, our stories unfold.\n</PREVIOUS_SECTION>\n<NEW_SECTION>\nIn the dawn's embrace, we find our way,\nWith hearts alight and spirits bold,\nThe journey unfolds with each new day,\nIn the tapestry of life, we are told.\n</NEW_SECTION>",
];

const originalContent = fs.readFileSync(
  '/Users/alexandrepereira/Desktop/Test/poem.txt',
  'utf-8'
);

import { modifyCodeSections } from './src/utils/sectionUpdate';

console.log(
  modifyCodeSections({
    originalContent,
    diffSections,
  })
);

console.log('Hello, TypeScript!');
