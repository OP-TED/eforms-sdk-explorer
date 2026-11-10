/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { appConfig } from "./config.js";
import { appState } from "./state.js";
import { SdkVersion } from "./sdk-version.js";
import { SdkRepository } from "./sdk-repository.js";
import { HomeTab } from "./tabs/home-tab.js";
import { FieldsTab } from "./tabs/fields-tab.js";
import { NoticeTypesTab } from "./tabs/notice-types-tab.js";
import { CodelistsTab } from "./tabs/codelists-tab.js";
import { SchemasTab } from "./tabs/schemas-tab.js";
import { SchematronsTab } from "./tabs/schematrons-tab.js";
import { ValidationTab } from "./tabs/validation-tab.js";
import { TranslationsTab } from "./tabs/translations-tab.js";
import { ViewTemplatesTab } from "./tabs/view-templates-tab.js";
import { ReleaseNotesTab } from "./tabs/release-notes-tab.js";
import { TabController } from "./tabs/tab-controller.js";
import { RELOAD_TO_RETRY } from "./error-messages.js";

export class SdkExplorerApplication {

    /** @type {SdkExplorerApplication} */
    static instance = new SdkExplorerApplication();

    /** @type {Map<string, TabController>} */
    tabs = new Map();

    /** @type {TabController} */
    #activeTab = null

    /** @type {SdkRepository} */
    #repository = new SdkRepository(this);

    /**
     * Counts the selections of versions (the one at start-up, every version change, and every new attempt after a
     * failed tab probe), so that the work for a selection that a newer one has superseded is dropped after each wait
     * instead of being applied late.
     *
     * @type {number}
     */
    #selection = 0;

    /**
     * The selection (see {@link #selection}) whose tabs are being probed, or null when no probe is in flight. While
     * a probe is in flight, the tab activated is not rendered: the probe's end renders the active tab.
     *
     * @type {number|null}
     */
    #probedSelection = null;

    /**
     * The last selection whose tab probe succeeded, so that the tabs shown are those that apply to it. A tab is
     * rendered only for that selection (see {@link #renderActiveTab}).
     *
     * @type {number|null}
     */
    #knownSelection = null;

    /**
     * Whether the tabs have been started (see {@link initTabs}): until then, the versions may not be set yet, and the
     * active tab is not known to the application.
     *
     * @type {boolean}
     */
    #tabsStarted = false;

    /** @type {number} */
    #spinnerCounter = 0;

    /** @type {boolean} Whether the messages in the error toast have expired (it hid itself), so that the next message replaces them. */
    #apiStatusExpired = false;

    /** @type {number|null} The timeout that hides the error toast, 15 s after its last message. */
    #hideTimeout = null;

    /** @returns {string} */
    get newVersion() {
        return appState.mainVersion;
    }

    /** @returns {string} */
    getComparisonVersion() {
        return appState.baseVersion;
    }

    constructor() {
        if (SdkExplorerApplication.instance) {
            throw new Error("Do not instantiate this class by calling the constructor. It's a singleton. Use the instance property instead.");
        }

        this.#addTab(new HomeTab());
        this.#addTab(new FieldsTab());
        this.#addTab(new NoticeTypesTab());
        this.#addTab(new CodelistsTab());
        this.#addTab(new SchemasTab());
        this.#addTab(new SchematronsTab());
        this.#addTab(new ValidationTab());
        this.#addTab(new TranslationsTab());
        this.#addTab(new ViewTemplatesTab());
        this.#addTab(new ReleaseNotesTab());
    }

    /**
     * Starts the version selection: fills the two version dropdowns and listens to their changes. Call
     * {@link initTabs} after it, only if it succeeded.
     *
     * @returns {Promise<boolean>} Whether a pair of versions is selected. If not (their list could not be
     *          downloaded), start-up stops: every tab but Home is disabled, and the error toast says why.
     */
    static async initVersions() {
        if (!(await SdkExplorerApplication.instance.populateDropdown())) {
            SdkExplorerApplication.instance.#disableTabsButHome();
            return false;
        }

        // Listen to the user from now on, before the tabs are probed, so that a change made meanwhile is not lost.
        SdkExplorerApplication.instance.$mainVersionDropdown().change(function () {
            appState.mainVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });

        SdkExplorerApplication.instance.$baseVersionDropdown().change(function () {
            appState.baseVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });
        return true;
    }

    /**
     * Shows the Home tab and disables the button of every other tab, when start-up stops without versions: no tab
     * stays or can be opened empty, not even one the user opened while the versions were loading. (No tab listener is
     * installed then, so showing Home renders nothing. The version chips and Home's buttons stay disabled, as the
     * page starts them: the version picker never starts.)
     */
    #disableTabsButHome() {
        $('#home-tab').tab('show');
        this.tabs.forEach(tab => {
            if (tab.getId() !== 'home-tab') {
                this.#tabButton(tab).disabled = true;
            }
        });
    }

    /**
     * Starts the tabs, after {@link initVersions}: listens to the tab changes, and shows the tabs that apply to the
     * selected versions (which probes some of their files).
     */
    static async initTabs() {
        // The tab whose button is active in the page is the active tab, also when the user opened it before this
        // listener was installed (while the versions were loading): the start-up probe's end renders it.
        const application = SdkExplorerApplication.instance;
        application.#tabsStarted = true;
        application.#activeTab = application.tabs.get($('ul.nav-tabs button.nav-link.active').attr('id')) ?? null;

        $('ul.nav-tabs').on('shown.bs.tab', 'li.nav-item > button.nav-link', function (event) {
            const activeTabId = $(event.target).attr('id');
            console.log('Active tab changed:', activeTabId);
            SdkExplorerApplication.instance.activeTabChanged(activeTabId);
        });

        await SdkExplorerApplication.instance.#initTabVisibility();
    }

    #mainVersionDropdown() {
        return document.querySelector('#main-version-dropdown');
    }
    $mainVersionDropdown() {
        return $(this.#mainVersionDropdown());
    }

    #baseVersionDropdown() {
        return document.querySelector('#base-version-dropdown');
    }

    $baseVersionDropdown() {
        return $(this.#baseVersionDropdown());
    }

    #apiStatus() {
        return document.querySelector('#apiStatus');
    }

    $apiStatus() {
        return $(this.#apiStatus());
    }

    #toastBody() {
        return document.querySelector('#apiStatus .toast-body');
    }

    /**
     * @param {TabController} tab
     * @returns {HTMLButtonElement} The button of the tab in the tab bar.
     */
    #tabButton(tab) {
        return document.getElementById(tab.getId());
    }

    /**
     * @param {TabController} tab 
     * @returns {HTMLElement} The nav item that holds the button of the tab.
     */
    #navItem(tab) {
        return this.#tabButton(tab).closest('li.nav-item');
    }

    /**
     * 
     * @param {TabController} tab 
     * @returns 
     */
    #addTab(tab) {
        tab.init();
        this.tabs.set(tab.getId(), tab);
    }

    async activeTabChanged(activeTabId) {
        this.startSpinner();
        this.clearApiStatus();
        try {
            await this.#activeTab?.deactivated();
            this.#activeTab = this.tabs.get(activeTabId);
            await this.#renderActiveTab();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message, error.detail);
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Renders the active tab for the selected versions, but only once the tabs that apply to them are known:
     * - while their tabs are probed, nothing: the probe's end renders the active tab (see #updateForSelection()), and
     *   rendering it here too would load it twice;
     * - if their probe failed, the selection is updated again: the tabs are probed again (a failed probe is not
     *   kept) and the active tab is rendered if that succeeds, or the error is shown again if it fails;
     * - otherwise, the active tab is rendered.
     */
    async #renderActiveTab() {
        if (this.#probedSelection !== null) {
            return;
        }
        if (this.#knownSelection !== this.#selection) {
            await this.#updateForSelection();
            return;
        }
        await this.#activeTab.activated();
    }

    /**
     * Called by the active tab when one of its own options changes (Fields' metadata source, Validation's source),
     * to render it again with that option: only once the tabs that apply to the selected versions are known, as for a
     * tab switch (see #renderActiveTab()). The option is held by the tab's control, so the render that follows, now
     * or at the end of the tab probe in flight, uses it.
     */
    async activeTabOptionsChanged() {
        // Before the tabs have started (the versions still loading), nothing: the start-up probe's end renders the
        // active tab, and the tab's control still holds the option then.
        if (!this.#tabsStarted) {
            return;
        }
        this.startSpinner();
        this.clearApiStatus();
        try {
            this.#activeTab?.cancelRequests();
            this.#activeTab?.clear();
            await this.#renderActiveTab();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message, error.detail);
        }
        finally {
            this.stopSpinner();
        }
    }

    async versionChanged() {
        this.startSpinner();
        this.clearApiStatus();

        // Clear the active tab first, so that the previous comparison never stays under the new selection, even
        // when the tabs cannot be probed.
        this.#activeTab?.cancelRequests();
        this.#activeTab?.clear();
        try {
            await this.#updateForSelection();
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Shows the tabs that apply to the versions selected when the application starts.
     */
    async #initTabVisibility() {
        this.startSpinner();
        try {
            await this.#updateForSelection();
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Shows the tabs that apply to the selected versions and renders the active tab for them, unless a newer
     * selection is made while the tabs are probed: that newer selection then does all of it, and the results and
     * errors of this one are dropped.
     * A tab activated while the tabs are probed is rendered here, once the probe has ended (see #renderActiveTab()).
     * If the probe fails, it stays empty, with the error in the toast, as the active tab does, until the next
     * request to render a tab tries again.
     */
    async #updateForSelection() {
        const selection = ++this.#selection;
        this.#probedSelection = selection;
        try {
            const applicable = await this.#probeApplicableTabs().finally(() => {
                // A newer selection's probe may be in flight by now: it is that one's to end.
                if (this.#probedSelection === selection) {
                    this.#probedSelection = null;
                }
            });
            if (selection !== this.#selection) {
                return;
            }
            this.#knownSelection = selection;
            if (this.#showApplicableTabs(applicable)) {
                await this.#activeTab?.versionChanged();
            }
        } catch (error) {
            if (selection === this.#selection && error.statusText !== 'abort') {
                SdkExplorerApplication.updateApiStatus(error.message, error.detail);
            }
        }
    }

    /**
     * Asks every tab whether it applies to the selected versions.
     *
     * @returns {Promise<Map<TabController, boolean>>}
     */
    async #probeApplicableTabs() {
        const tabs = Array.from(this.tabs.values());
        const applicable = await Promise.all(tabs.map(tab => tab.isApplicable()));
        return new Map(tabs.map((tab, index) => [tab, applicable[index]]));
    }

    /**
     * Shows the nav buttons of the tabs that apply and hides the others. If the active tab is hidden, the tab that
     * replaces it (see {@link TabController#replacementTabId}) is activated instead, if it applies, or else Home.
     *
     * @param {Map<TabController, boolean>} applicable Whether each tab applies to the selected versions.
     * @returns {boolean} true if the active tab is still shown, false if another tab is being activated instead.
     */
    #showApplicableTabs(applicable) {
        applicable.forEach((isApplicable, tab) => {
            $(this.#navItem(tab)).toggleClass('d-none', !isApplicable);
            // Disabled as well as hidden: the arrow keys of the tab bar skip disabled buttons, not hidden ones.
            this.#tabButton(tab).disabled = !isApplicable;
        });

        const activeTabIsShown = !this.#activeTab || applicable.get(this.#activeTab);
        if (!activeTabIsShown) {
            // Showing a tab activates it (see activeTabChanged).
            const replacement = this.tabs.get(this.#activeTab.replacementTabId());
            const tabToShow = replacement && applicable.get(replacement) ? replacement : this.tabs.get('home-tab');
            $(this.#tabButton(tabToShow)).tab('show');
        }
        return activeTabIsShown;
    }

    static startSpinner() {
        SdkExplorerApplication.instance.startSpinner();
    }

    static stopSpinner() {
        SdkExplorerApplication.instance.stopSpinner();
    }

    startSpinner() {
        this.#spinnerCounter++;
        this.#toggleSpinner();
    }

    stopSpinner() {
        this.#spinnerCounter--;
        this.#toggleSpinner();
    }

    #toggleSpinner() {
        if (this.#spinnerCounter > 0) {
            $('#centralLoadingSpinner').css('visibility', 'visible');
        } else {
            $('#centralLoadingSpinner').css('visibility', 'hidden');
        }
    }

    clearApiStatus() {
        // Forget the messages shown so far, and stop the timeout that would hide the toast later
        SdkExplorerApplication.instance.#apiStatusExpired = false;
        clearTimeout(SdkExplorerApplication.instance.#hideTimeout);

        // Clear the message inside the toast body
        SdkExplorerApplication.instance.#toastBody().textContent = '';

        // Hide the toast
        SdkExplorerApplication.instance.$apiStatus().toast('hide');
    }

    /**
     * Shows a message in the error toast, after the ones shown since it was last cleared, with its detail on a line
     * of its own. Both are plain text: they are inserted as text, never as HTML.
     *
     * @param {string} message
     * @param {string} [detail] For example why a request failed (see CustomError.detail).
     * @param {boolean} [staysShown] Whether the toast stays shown until the user closes it, instead of hiding itself
     *          15 s later: for an error that leaves nothing else to do (start-up without versions).
     */
    static updateApiStatus(message, detail = '', staysShown = false) {
        const application = SdkExplorerApplication.instance;
        if (application.#apiStatusExpired) {
            application.#toastBody().textContent = '';
            application.#apiStatusExpired = false;
        }

        const item = document.createElement('li');
        item.append(document.createTextNode(message));
        if (detail) {
            const detailElement = document.createElement('span');
            detailElement.className = 'detail';
            detailElement.textContent = detail;
            item.append(detailElement);
        }
        application.#toastBody().append(item);

        // Show the toast and hide it 15 s after this message (unless it stays shown), replacing the timeout of the
        // previous one: at once, so that there is only ever one timeout, which clearApiStatus() stops, and a clearing
        // just after a message cannot be followed by an empty toast shown late. (The toast has no fade to wait for.)
        application.$apiStatus().toast('show');
        clearTimeout(application.#hideTimeout);
        application.#hideTimeout = staysShown ? null : setTimeout(() => {
            application.$apiStatus().toast('hide');
            application.#apiStatusExpired = true;
        }, 15000);
    }

    /**
     * Gets the default base version for the given target version.
     * For a tagged target, it is the latest patch of the previous minor version in the same major version;
     * if there is none, it is the release immediately preceding the target in version order.
     * For a branch target, it is the latest release.
     * Pre-releases are never a default base.
     * 
     * @param {string} target The target version: a tag or one of the configured branches.
     * @param {SdkVersion[]} releases All released versions, latest first.
     * @returns {SdkVersion|undefined}
     */
    #defaultBaseFor(target, releases) {
        if (appConfig.branches.includes(target)) {
            return releases[0];
        }
        const targetVersion = SdkVersion.tryParse(target);
        return releases.find(release => release.major === targetVersion.major && release.minor < targetVersion.minor)
            ?? releases.find(release => release.compare(targetVersion) < 0);
    }

    /**
     * Gets the main and base versions from the query string if provided.
     * 
     * @returns 
     */
    #getVersionsFromQueryString() {
        // Parse the query string (populateDropdown() removes it once a pair is selected)
        let params = new URLSearchParams(window.location.search);
        let versionParam = params.get('version');
        let baseParam = params.get('base');

        return [versionParam, baseParam];
    }

    /**
     * Performs a request of the application rather than of a tab: the list of versions (by the application's
     * {@link SdkRepository}) and the probes that decide which tabs apply to the selected versions.
     * These requests are not tracked, so cancelling a tab's requests never aborts them.
     * 
     * @param {Object} options The options to pass to $.ajax().
     * @returns {Promise} A promise that resolves with the AJAX response.
     */
    ajaxRequest(options) {
        return $.ajax(options);
    }

    /**
     * Fills the two version dropdowns with the versions of the SDK, and selects the pair of the query string or the
     * default one.
     *
     * @returns {Promise<boolean>} Whether a pair is selected: false if the versions could not be listed (the error
     *          is then shown).
     */
    async populateDropdown() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            // Tags that are not versions are ignored, latest version first
            const availableVersions = (await this.#repository.listVersions())
                .map(tagName => SdkVersion.tryParse(tagName))
                .filter(version => version !== null)
                .sort((a, b) => b.compare(a));
            const availableVersionNames = availableVersions.map(version => version.toString());
            const releases = availableVersions.filter(version => !version.isPreRelease);

            // Filter out versions older than the threshold
            const threshold = SdkVersion.tryParse(appConfig.thresholdVersion);
            const recentVersions = availableVersions.filter(version => version.compare(threshold) >= 0);

            // Filter out pre-releases of released versions
            const recentReleases = recentVersions.filter(version => !version.isPreRelease);
            const latestRelease = recentReleases[0];
            const preReleasesOfLatestRelease = recentVersions.filter(version => version.isPreReleaseOf(latestRelease));
            const preReleasesOfUnreleasedVersions = recentVersions.filter(version =>
                version.isPreRelease && !recentReleases.some(release => version.isPreReleaseOf(release)));

            // Sort versions by version number, latest first
            const listedVersions = [...recentReleases, ...preReleasesOfLatestRelease, ...preReleasesOfUnreleasedVersions]
                .sort((a, b) => b.compare(a))
                .map(version => version.toString());

            // Populate the dropdowns
            this.$mainVersionDropdown().empty();
            this.$baseVersionDropdown().empty();

            // Add the configured branches to the top of the main version dropdown.
            // This will allow us to compare any version to any of these branches.
            appConfig.branches.forEach(branch => {
                this.$mainVersionDropdown().append($('<option>', { value: branch, text: branch }));
            });

            listedVersions.forEach(version => {
                const option = $('<option>', { value: version, text: version });
                this.$mainVersionDropdown().append(option.clone());
                this.$baseVersionDropdown().append(option);
            });

            // Get versions from the query string if provided
            let [mainVersion, baseVersion] = this.#getVersionsFromQueryString();

            // Validate the versions passed in the query string.
            // Branches are accepted only as the main version.
            if (!appConfig.branches.includes(mainVersion) && !listedVersions.includes(mainVersion)) {
                if (availableVersionNames.includes(mainVersion)) {
                    const option = $('<option>', { value: mainVersion, text: mainVersion });
                    this.$mainVersionDropdown().append(option);
                } else {
                    mainVersion = latestRelease.toString();
                }
            }
            if (!listedVersions.includes(baseVersion)) {
                if (availableVersionNames.includes(baseVersion)) {
                    const option = $('<option>', { value: baseVersion, text: baseVersion });
                    this.$baseVersionDropdown().append(option);
                } else {
                    baseVersion = this.#defaultBaseFor(mainVersion, releases)?.toString() ?? mainVersion;
                    if (!listedVersions.includes(baseVersion)) {
                        const option = $('<option>', { value: baseVersion, text: baseVersion });
                        this.$baseVersionDropdown().append(option);
                    }
                }
            }
            
            this.$mainVersionDropdown().val(mainVersion);
            this.$baseVersionDropdown().val(baseVersion);
            appState.mainVersion = mainVersion;
            appState.baseVersion = baseVersion;

            // The pair is selected: the address loses its query string now, not when it is read, so that a start-up
            // that fails before this point keeps it for the reload that the error asks for.
            if (window.location.search) {
                history.replaceState(null, null, window.location.pathname);
            }
            return true;
        } catch (error) {
            // Start-up stops here, so the error stays shown, with what to do about it: a reload, which must then
            // download the list again, whatever made the selection fail.
            this.#repository.forgetVersions();
            SdkExplorerApplication.updateApiStatus(`${error.message}. ${RELOAD_TO_RETRY}`, error.detail, true);
            console.error('Error populating dropdowns:', error);
            return false;
        } finally {
            this.stopSpinner();
        }
    }
}