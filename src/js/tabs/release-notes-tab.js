import { TabController } from "./tab-controller.js";
import { appConfig } from "../config.js";
import { appState } from "../state.js";

export class ReleaseNotesTab extends TabController {

    constructor() {
        super('release-notes-tab');
    }

    async fetchAndRender() {
        const releaseNotesUrl = `${appConfig.rawBaseUrl}/${appState.mainVersion}/CHANGELOG.md`;
        try {
            const markdownContent = await this.ajaxRequest({ url: releaseNotesUrl, dataType: 'text' });
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