type ModifyCodeSectionsParams = {
  originalContent: string;
  diffSections: string[];
};

export function modifyCodeSections({
  originalContent,
  diffSections,
}: ModifyCodeSectionsParams): string {
  let modifiedContent = originalContent;

  function applyDiff(existingContent: string, diffSections: string[]) {
    // Split the existing content into lines
    const existingLines = existingContent.split('\n');
    let currentIndex = 0;

    for (const diffSection of diffSections) {
      const oldContent = diffSection
        .match(/<PREVIOUS_SECTION>([\s\S]*?)<\/PREVIOUS_SECTION>/)?.[1]
        .split('\n');
      const newContent = diffSection
        .match(/<NEW_SECTION>([\s\S]*?)<\/NEW_SECTION>/)?.[1]
        .split('\n');

      if (!oldContent || !newContent) {
        throw new Error('Invalid diff section format.');
      }

      const isOldContentEmpty = oldContent.every((line) => line.trim() === '');

      if (isOldContentEmpty) {
        // Append newContent to the end of the existing content
        existingLines.push(...newContent);
        // No need to update currentIndex since we're appending at the end
      } else {
        const index = existingLines.findIndex((line, i) => {
          if (i < currentIndex) {
            return false;
          }
          const allMatch = oldContent.every((oldLine, j) => {
            // HACK : To avoid hallucinations impacts, skip empty lines at the beginning and end of the oldContent
            // @TODO : may be removed later
            if (
              j === 0 ||
              (j === oldContent.length - 1 && oldLine.trim() === '')
            ) {
              return true;
            }
            return existingLines[i + j] === oldLine;
          });

          return allMatch;
        });

        if (index !== -1) {
          // Replace oldContent with newContent in existingLines
          existingLines.splice(index, oldContent.length, ...newContent);
          // Update currentIndex to prevent matching the same content again
          currentIndex = index + newContent.length;
        } else {
          throw new Error('Old content not found in existing content.');
        }
      }
    }

    // Join the existingLines back into a string
    const updatedContent = existingLines.join('\n');
    return updatedContent;
  }

  modifiedContent = applyDiff(modifiedContent, diffSections);
  return modifiedContent;
}
