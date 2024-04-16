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
