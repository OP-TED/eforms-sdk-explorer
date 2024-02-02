/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { TabController } from "./tab-controller.js";
import { appConfig } from "../config.js";
import { appState } from "../state.js";
import { AjaxError, CustomError } from "../custom-error.js";
import { ERROR_FETCHING_FILE } from "../error-messages.js";

export class ReleaseNotesTab extends TabController {

    constructor() {
        super('release-notes-tab');
    }

    async fetchAndRender() {
        try {
            const markdownContent = await this.ajaxRequest({
                url: `${appConfig.rawBaseUrl}/${appState.mainVersion}/CHANGELOG.md`,
                dataType: 'text'
            }).catch(error => {
                throw new AjaxError(ERROR_FETCHING_FILE('CHANGELOG.md', appState.mainVersion), error);
            });
            this.#displayMarkdownAsHtml(markdownContent);
        } catch (error) {
            throw new CustomError('Error rendering release notes', error);
        }
    }

    #displayMarkdownAsHtml(markdownContent) {
        const converter = new showdown.Converter();
        const htmlContent = converter.makeHtml(markdownContent);
        $('#release-notes').html(htmlContent);
    }
}