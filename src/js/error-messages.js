export const ERROR_GENERATING_OVERVIEW = 'Error generating overview';
export const ERROR_FETCHING_DIRECTORY_LISTING = 'Error fetching directory listing from GitHub';
export const ERROR_FETCHING_VERSIONS = 'Error fetching the list of SDK versions';

/** What the user can do when start-up stops without versions: a failed list of versions is not kept, so a reload tries again. */
export const RELOAD_TO_RETRY = 'Reload the page to try again.';

export const ERROR_GENERATING_DIFF = (filename) => `Error while generating diff for ${filename}`;
export const ERROR_CHECKING_CHANGES = (filename) => `Error while checking for changes in ${filename}`;
export const ERROR_FETCHING_FILE = (filename, sdkVersion) => `Error while downloading file ${filename} for SDK ${sdkVersion}`;
export const ERROR_UNEXPECTED_FILE_CONTENT = (filename, sdkVersion, arrayName) => `File ${filename} of SDK ${sdkVersion} has no ${arrayName} list`;
