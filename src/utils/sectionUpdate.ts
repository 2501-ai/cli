type ModifyCodeSectionsParams = {
  originalContent: string;
  diffSections: string[];
};

// Normalize escaped newlines
const normalizeEscapes = (content: string) => {
  return content
    .replace(/\\\\n/g, '\n') // Handle double escaped newlines
    .replace(/\\n/g, '\n'); // Handle single escaped newlines
};
export function modifyCodeSections({
  originalContent,
  diffSections,
}: ModifyCodeSectionsParams): string {
  let result = originalContent;

  for (const diffSection of diffSections) {
    // Extract old and new content using regex
    const oldContentMatch = diffSection.match(
      /<PREVIOUS_SECTION>([\s\S]*?)<\/PREVIOUS_SECTION>/
    );
    const newContentMatch = diffSection.match(
      /<NEW_SECTION>([\s\S]*?)<\/NEW_SECTION>/
    );

    if (!oldContentMatch || !newContentMatch) {
      throw new Error('Invalid diff section format');
    }

    const oldContent = oldContentMatch[1];
    const newContent = newContentMatch[1];

    // Handle empty previous content case (append to end)
    if (oldContent.trim() === '') {
      result = newContent + result;
      continue;
    }

    const normalizedOldContent = normalizeEscapes(oldContent);
    const normalizedNewContent = normalizeEscapes(newContent);

    // Find and replace the content
    const index = result.indexOf(normalizedOldContent);
    if (index === -1) {
      throw new Error('Old content not found in existing content');
    }

    // Replace the old content with new content
    result =
      result.slice(0, index) +
      normalizedNewContent +
      result.slice(index + normalizedOldContent.length);
  }

  return result;
}
