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
      // Parse the diffSection to get old content and new content
      const [oldContent, newContent] = ['<<<<<', '====='].map(
        (startMarker, index) => {
          const endMarker = index === 0 ? '=====' : '>>>>>';
          const regex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
          const match = diffSection.match(regex);
          return match
            ? match[1].replace(/^\r?\n+|\r?\n+$/g, '').split('\n')
            : [];
        }
      );

      const isOldContentEmpty = oldContent.every((line) => line.trim() === '');

      if (isOldContentEmpty) {
        // Append newContent to the end of the existing content
        existingLines.push(...newContent);
        // No need to update currentIndex since we're appending at the end
      } else {
        // Find the index in existingLines where oldContent matches, starting from currentIndex
        const index = findIndexOfSequence(
          existingLines,
          oldContent,
          currentIndex
        );

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

  function findIndexOfSequence(
    haystack: string[],
    needle: string[],
    startIndex = 0
  ) {
    // haystack: array of lines
    // needle: array of lines
    // Returns index in haystack where needle starts, or -1 if not found

    // Handle empty needle (oldContent)
    if (needle.length === 0) {
      return -1;
    }

    for (let i = startIndex; i <= haystack.length - needle.length; i++) {
      let match = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return i;
      }
    }
    return -1;
  }

  modifiedContent = applyDiff(modifiedContent, diffSections);
  return modifiedContent;
}
