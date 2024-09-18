export const convertFormToJSON = (inputString: string): string => {
  try {
    // Attempt to parse the string as JSON
    const parsed = JSON.parse(inputString);
    // Check if the result is an object and not an array or null
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return inputString;
    }
  } catch (error) {
    // If JSON.parse fails, assume the string is in the format "key=value"
    const [key, value] = inputString.split('=');
    if (key && value) {
      return JSON.stringify({ [key]: value });
    }
  }
  // Return empty object if none of the above conditions are met
  return '';
};

const controlCharacters: Record<string, string> = {
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

// map with all escape characters
const escapeCharacters: Record<string, string> = {
  '"': '\\"',
  '/': '\\/',
};

export function cleanupBackticks(jsonString: string) {
  // Replace backticks (`) with double quotes (")
  return jsonString.replace(/`([^`]*)`/g, (_, p1: string) => {
    // Escape any quotes or backslashes inside the backticks
    let escapedContent = p1;

    // Replace escape characters
    for (const [char, escape] of Object.entries(escapeCharacters)) {
      escapedContent = escapedContent.split(char).join(escape);
    }

    // Replace control characters
    for (const [char, escape] of Object.entries(controlCharacters)) {
      escapedContent = escapedContent.split(char).join(escape);
    }

    return `"${escapedContent}"`;
  });
}
