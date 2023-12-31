/**
 * Base class for all tabs.
 * Defines how the SdkExplorerApplication interacts with all tabs.
 */
export class TabController {

    /** @type {string} */
    #id = null;

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
        await this.fetchAndRender();
    }

    /**
     * Called by the SdkExplorerApplication when the tab is deactivated.
     * Override this method to clean up any resources.
     */
    async deactivated() {
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
}