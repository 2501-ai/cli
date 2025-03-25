import { modifyCodeSections } from '../sectionUpdate';

const originalContentMock = `{
  "name": "auth-boilerplate",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "ts-node src/app.ts",
    "dev": "nodemon --exec ts-node src/app.ts",
    "build": "tsc"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "devDependencies": {
    "@types/node": "^22.5.4",
    "nodemon": "^3.1.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  },
  "dependencies": {
    "@prisma/client": "^5.19.1",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}`;

describe('sectionUpdate', () => {
  it('should update json content correctly', () => {
    const sectionsDiff = [
      '<PREVIOUS_SECTION>\n    "build": "tsc"\n  </PREVIOUS_SECTION><NEW_SECTION>\n    "build": "tsc",\n    "test": "jest",\n    "lint": "eslint . --ext .ts"\n  </NEW_SECTION>',
    ];

    const res = modifyCodeSections({
      originalContent: originalContentMock,
      diffSections: sectionsDiff,
    });

    expect(res).toEqual(`{
  "name": "auth-boilerplate",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "ts-node src/app.ts",
    "dev": "nodemon --exec ts-node src/app.ts",
    "build": "tsc",
    "test": "jest",
    "lint": "eslint . --ext .ts"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "devDependencies": {
    "@types/node": "^22.5.4",
    "nodemon": "^3.1.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  },
  "dependencies": {
    "@prisma/client": "^5.19.1",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}`);
  });

  it('should update json with empty previous content', () => {
    const sectionsDiff = [
      '<PREVIOUS_SECTION></PREVIOUS_SECTION><NEW_SECTION>{newContent}</NEW_SECTION>',
    ];

    const res = modifyCodeSections({
      originalContent: originalContentMock,
      diffSections: sectionsDiff,
    });

    expect(res).toEqual('{newContent}' + originalContentMock);
  });

  it('should update json with empty newContent', () => {
    const sectionsDiff = [
      '<PREVIOUS_SECTION>\n  "keywords": [],</PREVIOUS_SECTION><NEW_SECTION></NEW_SECTION>',
    ];

    const res = modifyCodeSections({
      originalContent: originalContentMock,
      diffSections: sectionsDiff,
    });

    expect(res).toEqual(`{
  "name": "auth-boilerplate",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "ts-node src/app.ts",
    "dev": "nodemon --exec ts-node src/app.ts",
    "build": "tsc"
  },
  "author": "",
  "license": "ISC",
  "description": "",
  "devDependencies": {
    "@types/node": "^22.5.4",
    "nodemon": "^3.1.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  },
  "dependencies": {
    "@prisma/client": "^5.19.1",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}`);
  });

  it('should remove content', () => {
    const sectionsDiff = [
      '<PREVIOUS_SECTION>\n    "build": "tsc"\n  </PREVIOUS_SECTION><NEW_SECTION>\n  </NEW_SECTION>',
    ];

    const res = modifyCodeSections({
      originalContent: originalContentMock,
      diffSections: sectionsDiff,
    });

    expect(res).toEqual(`{
  "name": "auth-boilerplate",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "ts-node src/app.ts",
    "dev": "nodemon --exec ts-node src/app.ts",
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "devDependencies": {
    "@types/node": "^22.5.4",
    "nodemon": "^3.1.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  },
  "dependencies": {
    "@prisma/client": "^5.19.1",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.6",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  }
}`);
  });

  it('should not add new content', () => {
    const originalcontent =
      "\napp.get('/', (req, res) => {\n  res.send('Hello World!');\n});\n\napp.get('/about', (req, res) => {\n  res.send('About Page');\n});\n\napp.post('/submit', (req, res) => {\n  res.send('Data Submitted');\n});\n\napp.put('/update', (req, res) => {\n  res.send('Data Updated');\n});\n\napp.delete('/delete', (req, res) => {\n  res.send('Data Deleted');\n});\n\napp.use((err, req, res, next) => {\n  console.error(err.stack);\n  res.status(500).send('Something broke!');\n});\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(`Server is running on port ${PORT}`);\n});";
    const diffSections = [
      "<PREVIOUS_SECTION>app.post('/submit', (req, res) => {\\n  res.send('Data Submitted');\\n});\\n</PREVIOUS_SECTION><NEW_SECTION></NEW_SECTION>",
    ];

    expect(() =>
      modifyCodeSections({
        originalContent: originalcontent,
        diffSections: diffSections,
      })
    ).toThrow();
  });
});
