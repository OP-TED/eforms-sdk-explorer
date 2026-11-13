/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { SdkExplorerApplication } from "../app.js";

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

    /** @type {Set<number>} The timeouts of the work deferred by {@link defer} that has not run yet. */
    #deferredWork = new Set();

    /**
     * The generation of the tab's current load: {@link cancelRequests} starts a new one. A request or a piece of
     * deferred work remembers the generation it was made in, and does nothing for a later one.
     *
     * @type {number}
     */
    #load = 0;

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
        this.clear();
        try {
            await this.fetchAndRender();
        }
        catch (error) {
            if (error.statusText === 'abort') {
                console.log('Request was aborted');
            } else {
                this.showErrorMessage(error.message, error.detail);
            }
        }
    }

    /**
     * Called by the SdkExplorerApplication when the tab is deactivated.
     * Override this method to clean up any resources.
     */
    async deactivated() {
        this.cancelRequests();
        this.clear();
    }

    /**
     * Called by the SdkExplorerApplication when any of the two version dropdowns changes selection.
     * No need to override this method.
     */
    async versionChanged() {
        // Cancel the load of the previous selection, so that none of its responses or deferred work can render
        // over the new one.
        this.cancelRequests();
        this.clear();
        try {
            await this.fetchAndRender();
        }
        catch (error) {
            if (error.statusText === 'abort') {
                console.log('Request was aborted');
            } else {
                this.showErrorMessage(error.message, error.detail);
            }
        }
    }

    /**
     * Override this method to remove what the tab shows (its tree, cards, diff or alerts), so that it shows an empty
     * pane. Called before the tab fetches and renders again, so that a failed load does not leave the previous
     * comparison on screen, and when the tab is deactivated, to free memory.
     */
    clear() {
    }

    /**
     * Override this method to fetch data and render the tab.
     * Throw an exception with the message that you want to display to the user if the operation fails.
     */
    async fetchAndRender() {
    }

    /**
     * Called by the SdkExplorerApplication when the selected versions change, to decide whether the tab is shown.
     * Override this method if the tab applies only to some versions.
     *
     * @returns {Promise<boolean>} true if the tab applies to the selected versions.
     */
    async isApplicable() {
        return true;
    }

    /**
     * Called by the SdkExplorerApplication when the tab is active and stops applying to the selected versions (see
     * {@link isApplicable}), to choose the tab that is activated instead.
     * Override this method if another tab then shows what this tab showed.
     *
     * @returns {string|null} The id of the tab that replaces this one, or null: Home is then activated (as it is
     *          when the replacing tab does not apply either).
     */
    replacementTabId() {
        return null;
    }

    /**
     * Make an AJAX request and keep track of it.
     * The response is handed over only if the load the request was made for has not been cancelled since: a
     * response that arrived just before a cancellation (jQuery hands it over in a later task) is rejected like an
     * aborted request instead, so that it renders nothing.
     *
     * @param {Object} options - The options to pass to $.ajax().
     * @returns {Promise} - A promise that resolves with the AJAX response, or rejects with the jqXHR of the failed
     *          request, or with an aborted-request error (statusText 'abort') if the load was cancelled.
     */
    ajaxRequest(options) {
        const load = this.#load;
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

        // Hand the outcome over only to the load that made the request
        return new Promise((resolve, reject) => {
            jqXHR.then(
                response => load === this.#load ? resolve(response) : reject(TabController.#cancelledLoadError()),
                error => reject(load === this.#load ? error : TabController.#cancelledLoadError())
            );
        });
    }

    /**
     * @returns {Error} The error with which a request of a cancelled load fails: like an aborted request
     *          (statusText 'abort'), so that it is not reported to the user.
     */
    static #cancelledLoadError() {
        return Object.assign(new Error('The load this request was made for was cancelled'), { statusText: 'abort' });
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
     * Cancel all ongoing AJAX requests, and the work deferred by {@link defer} that has not run yet, and start a new
     * load: the requests and deferred work of the cancelled one hand nothing over afterwards.
     */
    cancelRequests() {
        this.#load++;

        this.#ajaxRequests.forEach(jqXHR => {
            if (jqXHR) {
                jqXHR.abort();
            }
        });
        this.#ajaxRequests = [];

        this.#deferredWork.forEach(timeout => clearTimeout(timeout));
        this.#deferredWork.clear();
    }

    /**
     * Runs a piece of rendering later (in a timeout), so that rendering many items keeps the page responsive, and
     * keeps track of it like a request: {@link cancelRequests} drops it if it has not run yet, so that a load that
     * was cancelled (by a version change, a tab switch or a source switch) cannot render anything afterwards.
     *
     * @param {function(): void} work
     */
    defer(work) {
        const load = this.#load;
        const timeout = setTimeout(() => {
            this.#deferredWork.delete(timeout);
            if (load === this.#load) {
                work();
            }
        }, 0);
        this.#deferredWork.add(timeout);
    }

    /**
     * Shows an error in the error toast.
     *
     * @param {string} message
     * @param {string} [detail]
     */
    showErrorMessage(message, detail = '') {
        SdkExplorerApplication.updateApiStatus(message, detail);
    }
}