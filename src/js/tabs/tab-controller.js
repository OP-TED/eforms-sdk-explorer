/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

/**
 * Base class for all tabs.
 * Defines how the SdkExplorerApplication interacts with all tabs.
 */
export class TabController {

    /** @type {string} */
    #id = null;

    /** @type {Array} */
    #ajaxRequests = [];

    /** @type {number} */
    #totalRequests = 0;

    /** @type {Array} */
    #listeners = [];

    /** @type {boolean} */
    aborting = false;

    /**
     * @returns {string}
     */
    getId() {
        return this.#id;
    }

    constructor(tabId) {
        this.#id = tabId;
    }

    /**
     * Override this method to initialize the tab and hook any necessary event handlers to the DOM.
     */
    init() {
    }

    /**
     * Called by the SdkExplorerApplication when the tab is activated.
     * No need to override this method.
     */
    async activated() {
        this.aborting = false;
        await this.fetchAndRender();
    }

    /**
     * Called by the SdkExplorerApplication when the tab is deactivated.
     * Override this method to clean up any resources.
     */
    async deactivated() {
        this.aborting = true;
        $(this.#id).tab('dispose');
        this.cancelRequests();
    }

    /**
     * Called by the SdkExplorerApplication when any of the two version dropdowns changes selection.
     * No need to override this method.
     */
    async versionChanged() {
        await this.fetchAndRender();
    }

    /**
     * Override this method to fetch data and render the tab.
     * Throw an exception with the message that you want to display to the user if the operation fails.
     */
    async fetchAndRender() {
    }

    /**
     * Make an AJAX request and keep track of it.
     * @param {Object} options - The options to pass to $.ajax().
     * @returns {Promise} - A promise that resolves with the AJAX response.
     */
    ajaxRequest(options) {
        // Track the number of pending requests to indicate progress
        this.#totalRequests++;

        // Make the AJAX request and keep track of it
        const jqXHR = $.ajax(options);
        this.#ajaxRequests.push(jqXHR);

        // Remove the jqXHR object from the list when the request completes or fails
        jqXHR.always(() => {

            // Remove the request from the pending requests list
            this.#ajaxRequests = this.#ajaxRequests.filter(request => request !== jqXHR);

            // Reset the total number of requests when there are no more pending requests
            if (this.#ajaxRequests.length === 0) {
                this.#totalRequests = 0;
            }

            // Indicate progress
            this.#showProgress();
        });

        // Return the promise
        return jqXHR;   
    }

    /**
     * Shows the progress bar and updates its width to reflect the progress.
     */
    #showProgress() {
        if (this.#totalRequests === 0) {
            this.#hideProgress(); // Hide the progress bar if there are no pending requests
            return; // to avoid division by zero
        }

        // Calculate the percentage of completed requests
        var percentComplete = (this.#totalRequests - this.#ajaxRequests.length) / this.#totalRequests;

        // Don't update progress bar if the progress is less than 1%
        if (percentComplete >= 0.01) {
            var percentCompleteStr = (100 * percentComplete).toFixed(0) + '%'; // Round to nearest whole number

            // SetTimeout is needed to give a chance to the browser to render the progress bar
            setTimeout(() => {
                $('.progress').show();
                $('.progress-bar').css({ width: percentCompleteStr });
            }, 0);
        }
    }

    /**
     * Hides the progress bar.
     */
    #hideProgress() {
            // SetTimeout is needed to give a chance to the browser to render the progress bar
            setTimeout(() => {
            $('.progress').hide();
            $('.progress-bar').css({ width: '0%' });
        }, 0);
    }

    /**
     * Cancel all ongoing AJAX requests.
     */
    cancelRequests() {
        this.#ajaxRequests.forEach(jqXHR => {
            if (jqXHR) {
                jqXHR.abort();
            }
        });
        this.#ajaxRequests = [];
    }
}