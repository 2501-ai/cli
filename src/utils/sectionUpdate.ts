type ModifyCodeSectionsParams = {
  originalContent: string;
  diffSections: string[];
};

// Convert previousContent into a regex pattern
function previousContentToRegex(previousContent: string) {
  // Split into non-whitespace tokens
  const tokens = previousContent.match(/\S+/g) || [];
  // Escape regex special characters in each token
  const escapedTokens = tokens.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  // Join tokens with optional whitespace
  const pattern = escapedTokens.join('\\s*');
  // Create regex with global and multiline flags
  return new RegExp(pattern, 'gm');
}

function removeLineNumbers(content: string): string {
  return content.replace(/^\d+:\s*/gm, (match) => ' '.repeat(match.length));
}

export function modifyCodeSections({
  originalContent,
  diffSections,
}: ModifyCodeSectionsParams): string {
  let modifiedContent = originalContent;

  diffSections.forEach((diffSection) => {
    const splittedDiffs = diffSection
      .split(/=====/)
      .map((part) => part.replace('<<<<<', '').replace('>>>>>', '').trim())
      .filter((c) => !!c);

    const previousContent = removeLineNumbers(splittedDiffs[0]);
    const newContent = removeLineNumbers(splittedDiffs[1]);

    if (/^\s*$/.test(previousContent)) {
      if (!/^\s*$/.test(newContent)) {
        modifiedContent += '\n' + newContent;
      } else {
        console.log(`Both previous and new content are empty: ${diffSection}`);
        throw new Error(`Both previous and new content are empty: 
          ${diffSection}`);
      }
    } else {
      const regex = previousContentToRegex(previousContent);
      const match = regex.exec(modifiedContent);

      if (!match) {
        console.log(
          `Previous content not found in the original content: ${previousContent}`
        );
        console.log(`Original content: ${originalContent}`);
        console.log(`Diff: ${diffSection}`);
        throw new Error(`Previous content not found in the original content: 
  ${previousContent}`);
      }

      const startIdx = match.index;
      const endIdx = startIdx + match[0].length;

      modifiedContent =
        modifiedContent.slice(0, startIdx) +
        newContent +
        modifiedContent.slice(endIdx);
    }
  });

  return modifiedContent;
}
