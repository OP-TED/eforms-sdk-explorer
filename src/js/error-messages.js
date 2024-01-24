export const ERROR_GENERATING_OVERVIEW = 'Error generating overview';
export const ERROR_FETCHING_DIRECTORY_LISTING = 'Error fetching directory listing from GitHub';

export const ERROR_GENERATING_DIFF = (filename) => `Error while generating diff for ${filename}`;
export const ERROR_CHECKING_CHANGES = (filename) => `Error while checking for changes in ${filename}`;
export const ERROR_FETCHING_FILE = (filename, sdkVersion) => `Error while downloading file ${filename} for SDK ${sdkVersion}`;
