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
      '<<<<<\n    "build": "tsc"\n  =====\n    "build": "tsc",\n    "test": "jest",\n    "lint": "eslint . --ext .ts"\n  >>>>>',
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
    const sectionsDiff = ['<<<<<====={newContent}>>>>>'];

    const res = modifyCodeSections({
      originalContent: originalContentMock,
      diffSections: sectionsDiff,
    });

    expect(res).toEqual('{newContent}' + originalContentMock);
  });

  it('should update json with empty newContent', () => {
    const sectionsDiff = ['<<<<<\n  "keywords": [],=====>>>>>'];

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
});
