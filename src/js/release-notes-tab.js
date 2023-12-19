import { TabController } from "./tab-controller.js";
import { appConfig } from "./config.js";
import { appState } from "./state.js";

export class ReleaseNotesTab extends TabController {

    constructor() {
        super('release-notes-tab');
    }

    async fetchAndRender() {
        const releaseNotesUrl = `${appConfig.rawBaseUrl}/${appState.sdkVersion}/CHANGELOG.md`;
        try {
            const response = await fetch(releaseNotesUrl);
            const markdownContent = await response.text();
            this.#displayMarkdownAsHtml(markdownContent);
        } catch (error) {
            console.error('Error fetching release notes:', error);
            $('#release-notes').html('<p>Error loading release notes.</p>');
        }
    }

    #displayMarkdownAsHtml(markdownContent) {
        const converter = new showdown.Converter();
        const htmlContent = converter.makeHtml(markdownContent);
        $('#release-notes').html(htmlContent);
    }
}