#!/bin/bash -e

BIN_FILE=2501-macos

tsc
# Insert the require configuration at the top of the built file
sed -i '' '/"use strict";/a\
const { createRequire } = require('\''node:module'\'');\
require = createRequire(__filename);
' dist/index.js

# This is a skill issue from terminal-kit that causes the README file to be looked up by the Esbuild bundler.
rm node_modules/terminal-kit/lib/termconfig/README || true

# bundle the TS files to a single JS file.
npx esbuild \
	--format=cjs \
	--target=node20 \
	--platform=node \
	--bundle \
	--outfile=bundle.js \
	dist/index.js

echo "Generating the NodeJS executable for MacOS (cross-platform)..."

# Create a blob file that will be injected in the NodeJS executable.
node --experimental-sea-config sea-config.json

# Create the NodeJS executable that will be used to run the shell script.
cp $(command -v node) $BIN_FILE

# Remove the signature from the NodeJS executable.
codesign --remove-signature $BIN_FILE

# Inject the blob file in the NodeJS executable.
npx postject $BIN_FILE NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA

# Sign the binary.
codesign --sign - $BIN_FILE

# Cleanup
rm sea-prep.blob

echo "Done"