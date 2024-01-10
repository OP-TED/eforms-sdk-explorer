/**
 * Base class for all tabs.
 * Defines how the SdkExplorerApplication interacts with all tabs.
 */
export class TabController {

    /** @type {string} */
    #id = null;

    /** @type {Array} */
    #ajaxRequests = [];

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
        const jqXHR = $.ajax(options);
        this.#ajaxRequests.push(jqXHR);

        // Remove the jqXHR object from the list when the request completes or fails
        jqXHR.always(() => {
            this.#ajaxRequests = this.#ajaxRequests.filter(request => request !== jqXHR);
        });

        return jqXHR;
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