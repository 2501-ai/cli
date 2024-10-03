type ModifyCodeSectionsParams = {
  originalContent: string;
  diffSections: string[];
};

export function modifyCodeSections({
  originalContent,
  diffSections,
}: ModifyCodeSectionsParams): string {
  let modifiedContent = originalContent;

  diffSections.forEach((diffSection) => {
    const [previousContent, newContent] = diffSection
      .split(/=====/)
      // trim removes whitespaces and new lines chars.
      .map((part) => part.replace('<<<<<', '').replace('>>>>>', '').trim())
      .filter((c) => !!c);

    const startIdx = modifiedContent.indexOf(previousContent);
    if (startIdx === -1) {
      throw new Error(`Previous content not found in the original content: 
 ${previousContent}`);
    }

    const endIdx = startIdx + previousContent.length;
    modifiedContent =
      modifiedContent.slice(0, startIdx) +
      newContent +
      modifiedContent.slice(endIdx);
  });

  return modifiedContent;
}
