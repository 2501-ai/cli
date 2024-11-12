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

export function modifyCodeSections({
  originalContent,
  diffSections,
}: ModifyCodeSectionsParams): string {
  let modifiedContent = originalContent;

  diffSections.forEach((diffSection) => {
    const [previousContent, newContent] = diffSection
      .split(/=====/)
      .map((part) => part.replace('<<<<<', '').replace('>>>>>', '').trim())
      .filter((c) => !!c);

    if (/^\s*$/.test(previousContent)) {
      if (!/^\s*$/.test(newContent)) {
        modifiedContent += '\n' + newContent;
      } else {
        throw new Error(`Both previous and new content are empty: 
          ${diffSection}`);
      }
    } else {
      const regex = previousContentToRegex(previousContent);
      const match = regex.exec(modifiedContent);

      if (!match) {
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
