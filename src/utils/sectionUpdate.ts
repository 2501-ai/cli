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
    const [previousSection, newSection] = diffSection
      .split(/=====/)
      // .map((part) => part.trim())
      .filter((c) => !!c);

    const previousContent = previousSection.replace('<<<<<', '');
    const newContent = newSection.replace('>>>>>', '');
    const startIdx = modifiedContent.indexOf(previousContent);
    if (startIdx === -1) {
      throw new Error('Previous content not found in the original content.');
    }

    const endIdx = startIdx + previousContent.length;
    modifiedContent =
      modifiedContent.slice(0, startIdx) +
      newContent +
      modifiedContent.slice(endIdx);
  });

  return modifiedContent;
}
