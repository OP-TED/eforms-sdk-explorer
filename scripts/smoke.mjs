/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/**
 * Smoke test of the eForms SDK Explorer.
 *
 * Serves the repository with http-server on a free port, opens the explorer in Chromium through Playwright, collects
 * console errors, and checks how the explorer selects versions, shows its tabs and comparisons, and handles slow and
 * failed loads.
 *
 * The explorer reads the SDK from GitHub and jsDelivr, so the test needs network access. It spends 2 requests of the
 * unauthenticated GitHub API budget (60 requests per hour) per run: one git trees request per version, the first time
 * the schematrons folder of a pair is listed; the version list comes from jsDelivr, and listings are then kept in the
 * browser.
 *
 * Usage:
 *   npm install
 *   npx playwright install chromium     (once, unless SMOKE_CHROMIUM_EXECUTABLE_PATH is set)
 *   npm run smoke
 *
 * Environment:
 *   SMOKE_CHROMIUM_EXECUTABLE_PATH  Chromium executable to use instead of the one installed by Playwright.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import httpServer from 'http-server';
import { chromium } from 'playwright';

/**
 * Serves a folder over HTTP on a free local port.
 */
class ExplorerServer {

    /** @type {string} */
    #root;

    /** @type {httpServer.HttpServer} */
    #server = null;

    /**
     * @param {string} root The folder to serve.
     */
    constructor(root) {
        this.#root = root;
    }

    /**
     * @returns {Promise<string>} The URL the folder is served at.
     */
    async start() {
        this.#server = httpServer.createServer({ root: this.#root, cache: -1 });
        await new Promise(resolve => this.#server.listen(0, '127.0.0.1', resolve));
        return `http://127.0.0.1:${this.#server.server.address().port}`;
    }

    stop() {
        this.#server?.close();
    }
}

/**
 * The explorer opened in a browser page: opens it with a query string and reads what it shows.
 */
class ExplorerPage {

    /** How long to wait for the explorer to fill the version dropdowns, in milliseconds. */
    static #LOAD_TIMEOUT = 60000;

    /**
     * How long to wait for the explorer to finish what it is doing, in milliseconds.
     * Long, because the index cards of the schematrons check hundreds of files in the background.
     */
    static #IDLE_TIMEOUT = 600000;

    /** How long the loading indicator must stay hidden for the explorer to count as idle, in milliseconds. */
    static #IDLE_PERIOD = 500;

    /** How long a card group takes to apply a selected filter (it does so in a timeout), in milliseconds. */
    static #FILTER_PERIOD = 200;

    /** How long a popover takes to show or to hide (Bootstrap fades it), in milliseconds. */
    static #POPOVER_PERIOD = 500;

    /** How long a wait for an event of the page (a held request being made, a tab being shown) may last before it fails the check, in milliseconds. */
    static #EVENT_TIMEOUT = 60000;

    /**
     * Files that the explorer requests to find out whether a version has them: for these, the browser's "404" console
     * error is expected and is not collected.
     */
    static #FILES_PROBED_FOR_PRESENCE = Object.freeze([
        /\/validation\/[^/]+$/,
        /\/fields\/fwd\/(nodes|business-entity-hierarchy|business-entity-properties|data-types)\.json$/,
        /\/view-templates\/summary\.efx$/
    ]);

    /** The prefix of the URLs of the GitHub API. */
    static #GITHUB_API = 'https://api.github.com/';

    /** @type {import('playwright').Page} */
    #page;

    /** @type {string[]} The URLs of the GitHub API requests made since the page was created. */
    #githubApiRequests = [];

    /** @type {string[]} The URLs of all the requests made since the page was created. */
    #requestedUrls = [];

    /** @type {Set<string>} The URLs of the requests that the test made fail on purpose (see {@link failRequestsDuring}). */
    #deliberatelyFailedUrls = new Set();

    /** @type {string[]} The URLs of the stylesheets requested since the page was created, by the page and by its web components. */
    #stylesheetRequests = [];

    /** @type {string} */
    #baseUrl;

    /** @type {string[]} */
    #consoleErrors = [];

    /**
     * @param {import('playwright').Page} page
     * @param {string} baseUrl The URL the explorer is served at.
     */
    constructor(page, baseUrl) {
        this.#page = page;
        this.#baseUrl = baseUrl;
        this.#page.on('console', message => {
            if (message.type() === 'error' && !ExplorerPage.#isExpectedAbsence(message) && !this.#deliberatelyFailedUrls.has(message.location().url)) {
                const url = message.location().url;
                this.#consoleErrors.push(url ? `${message.text()} (${url})` : message.text());
            }
        });
        this.#page.on('pageerror', error => this.#consoleErrors.push(error.message));
        this.#page.on('request', request => {
            this.#requestedUrls.push(request.url());
            if (request.url().startsWith(ExplorerPage.#GITHUB_API)) {
                this.#githubApiRequests.push(request.url());
            }
            if (request.resourceType() === 'stylesheet') {
                this.#stylesheetRequests.push(request.url());
            }
        });
    }

    /**
     * @returns {string[]} The URLs of the stylesheets requested since the page was created, across page loads.
     */
    get stylesheetRequests() {
        return [...this.#stylesheetRequests];
    }

    /**
     * @returns {Promise<string[]>} The URLs of the stylesheets that index.html links into the page.
     */
    async pageStylesheets() {
        return this.#page.$$eval('head link[rel="stylesheet"]', links => links.map(link => link.href));
    }

    /**
     * @returns {string[]} The URLs of the GitHub API requests made since the page was created, across page loads.
     */
    get githubApiRequests() {
        return [...this.#githubApiRequests];
    }

    /**
     * @returns {string[]} The URLs of all the requests made since the page was created, across page loads.
     */
    get requestedUrls() {
        return [...this.#requestedUrls];
    }

    /**
     * @returns {string[]} The console errors logged since the explorer was last opened.
     */
    get consoleErrors() {
        return [...this.#consoleErrors];
    }

    /**
     * Opens the explorer and waits until it has filled the version dropdowns and decided which tabs to show.
     *
     * @param {string} queryString For example `?version=efx-2`, or an empty string.
     */
    async open(queryString) {
        this.#consoleErrors = [];
        await this.openWithoutWaiting(queryString);
        await this.#waitForStartUp();
    }

    /**
     * Reloads the page, as the user does with the browser's reload button (its address, as the explorer left it),
     * and waits as {@link open} does.
     */
    async reload() {
        this.#consoleErrors = [];
        await this.#page.reload();
        await this.waitForVersions();
        await this.#waitForStartUp();
    }

    /**
     * @returns {string} The address of the page, as the explorer left it (it removes the query string once it has
     *          selected the versions).
     */
    address() {
        return this.#page.url();
    }

    /**
     * Waits until the explorer is idle after start-up, and fails if it reported an error.
     */
    async #waitForStartUp() {
        await this.waitUntilIdle();
        const errors = await this.reportedErrors();
        if (errors !== '') {
            throw new Error(`the explorer reported: ${errors}`);
        }
    }

    /**
     * Loads the explorer and waits only until it has filled the version dropdowns, not until it has decided which
     * tabs to show. The console errors collected so far are kept.
     *
     * @param {string} queryString
     */
    async openWithoutWaiting(queryString) {
        await this.startOpening(queryString);
        await this.waitForVersions();
    }

    /**
     * Loads the explorer without waiting for anything it requests. The console errors collected so far are kept.
     *
     * @param {string} queryString
     */
    async startOpening(queryString) {
        await this.#page.goto(`${this.#baseUrl}/${queryString}`);
    }

    /**
     * Waits until the explorer has filled the version dropdowns (or reported why it could not).
     */
    async waitForVersions() {
        await this.#page.waitForFunction(
            () => document.querySelector('#main-version-dropdown').value !== ''
                || document.querySelector('#apiStatus .toast-body').textContent.trim() !== '',
            null,
            { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Selects a version, as a user would, without waiting for the explorer to be idle: through the version chip and
     * its menu, or, on Home, where the chips are not shown, through the "Choose versions…" dialog (whose Compare then
     * shows the Fields tab).
     *
     * @param {'main'|'base'} dropdown The hidden version select that holds the version (`main` for the target).
     * @param {string} version
     */
    async startSelectingVersion(dropdown, version) {
        const role = dropdown === 'main' ? 'target' : 'base';
        if (await this.#page.isVisible(`#${role}-version-chip`)) {
            await this.#page.click(`#${role}-version-chip`);
            await this.#page.click(`.ted-version-chip[data-version-role="${role}"] .dropdown-item:text-is("${version}")`);
        } else {
            await this.#page.click('#choose-versions');
            await this.#page.waitForSelector('#version-dialog.show');
            await this.#page.selectOption(`#version-dialog-${role}`, version);
            await this.#page.click('#version-dialog-compare');
            await this.#page.waitForSelector('#version-dialog', { state: 'hidden' });
        }
    }

    /**
     * Opens the "Choose versions…" dialog from Home, chooses both versions and presses Compare, as a user would
     * (which also shows the Fields tab), without waiting for the explorer to be idle.
     *
     * @param {string} mainVersion
     * @param {string} baseVersion
     */
    async startComparingInDialog(mainVersion, baseVersion) {
        await this.#page.click('#choose-versions');
        await this.#page.waitForSelector('#version-dialog.show');
        await this.#page.selectOption('#version-dialog-base', baseVersion);
        await this.#page.selectOption('#version-dialog-target', mainVersion);
        await this.#page.click('#version-dialog-compare');
        await this.#page.waitForSelector('#version-dialog', { state: 'hidden' });
    }

    /**
     * Keeps a list of versions in the browser the way the explorer stores it (format 1, stored now), as an earlier
     * build of the explorer could have left it.
     *
     * @param {string[]} versions
     */
    async storeVersions(versions) {
        await this.#page.evaluate(list => localStorage.setItem('sdk-explorer/versions',
            JSON.stringify({ format: 1, storedAt: Date.now(), value: list })), versions);
    }

    /**
     * Forgets the list of versions that the explorer keeps in the browser, so that the next load requests it again.
     */
    async forgetCachedVersions() {
        await this.#page.evaluate(() => localStorage.removeItem('sdk-explorer/versions'));
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element is enabled.
     */
    async isEnabled(selector) {
        return this.#page.isEnabled(selector);
    }

    /**
     * Scrolls the page to its bottom, as a user would.
     */
    async scrollToBottom() {
        await this.#page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element is entirely within the window.
     */
    async isInWindow(selector) {
        return this.#page.$eval(selector, element => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
        });
    }

    /**
     * Starts waiting for the next shown.bs.tab event of a tab's button: Bootstrap fires it once the tab's pane has
     * faded in, and the explorer activates the tab on it (see {@link tabShown}).
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async startWaitingForTabShown(tabId) {
        await this.#page.evaluate(id => {
            window.smokeTestTabShown = { tabId: id, shown: new Promise(resolve => document.getElementById(id).addEventListener('shown.bs.tab', () => resolve(), { once: true })) };
        }, tabId);
    }

    /**
     * Waits for the shown.bs.tab event awaited since {@link startWaitingForTabShown}, for at most the given time.
     *
     * @param {number} [timeout] In milliseconds.
     * @throws {Error} If the tab is not shown in time, naming the tab.
     */
    async tabShown(timeout = ExplorerPage.#EVENT_TIMEOUT) {
        await this.#page.evaluate(ms => Promise.race([
            window.smokeTestTabShown.shown,
            new Promise((resolve, reject) => setTimeout(() => reject(new Error(`the ${window.smokeTestTabShown.tabId} tab was not shown within ${ms / 1000} s`)), ms))
        ]), timeout);
    }

    /**
     * Focuses Home's "Compare x › y" button and presses Enter, as a keyboard user would, and waits until the explorer
     * is idle.
     */
    async compareFromHomeWithEnter() {
        await this.#page.focus('#compare-versions');
        await this.#page.keyboard.press('Enter');
        await this.waitUntilIdle();
    }

    /**
     * Opens the "Choose versions…" dialog from Home, waits until it has given the focus to its base version, then
     * focuses its Compare button and presses Enter without changing anything, as a keyboard user would.
     */
    async compareInDialogWithEnter() {
        await this.#page.click('#choose-versions');
        await this.#page.waitForFunction(() => document.activeElement?.id === 'version-dialog-base');
        await this.#page.focus('#version-dialog-compare');
        await this.#page.keyboard.press('Enter');
        await this.#page.waitForSelector('#version-dialog', { state: 'hidden' });
    }

    /**
     * @returns {Promise<string>} The id of the element that has the focus, or its tag name if it has no id.
     */
    async focusedElement() {
        return this.#page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    }

    /**
     * Opens the "Choose versions…" dialog from Home and presses Compare without changing anything, as a user would.
     */
    async compareInDialogUnchanged() {
        await this.#page.click('#choose-versions');
        await this.#page.waitForSelector('#version-dialog.show');
        await this.#page.click('#version-dialog-compare');
        await this.#page.waitForSelector('#version-dialog', { state: 'hidden' });
    }

    /**
     * Starts counting the change events of the two hidden version selects: each one starts a reload. They are
     * triggered through jQuery, which calls jQuery's handlers only, so the counter is one of them (namespaced, so that
     * starting again replaces it).
     */
    async startCountingVersionChanges() {
        await this.#page.evaluate(() => {
            window.smokeTestVersionChanges = 0;
            $('#main-version-dropdown, #base-version-dropdown').off('change.smokeTest').on('change.smokeTest', () => window.smokeTestVersionChanges++);
        });
    }

    /**
     * @returns {Promise<number>} The change events of the version selects since {@link startCountingVersionChanges}.
     */
    async countedVersionChanges() {
        return this.#page.evaluate(() => window.smokeTestVersionChanges);
    }

    /**
     * @param {'base'|'target'} role
     * @returns {Promise<string[]>} The section headings of the menu of a version chip.
     */
    async versionMenuSections(role) {
        return this.#page.$$eval(`.ted-version-chip[data-version-role="${role}"] .dropdown-header`, headers => headers.map(header => header.textContent));
    }

    /**
     * Clicks Home's "Compare x › y" button and waits until the explorer is idle.
     *
     * @returns {Promise<string>} The button's text before the click.
     */
    async compareFromHome() {
        const text = (await this.#page.textContent('#compare-versions')).trim();
        await this.#page.click('#compare-versions');
        await this.waitUntilIdle();
        return text;
    }

    /**
     * @returns {Promise<{mainVersion: string, baseVersion: string}>} The versions the explorer works with (its appState).
     */
    async appState() {
        return this.#page.evaluate(async () => {
            const { appState } = await import('/src/js/state.js');
            return { mainVersion: appState.mainVersion, baseVersion: appState.baseVersion };
        });
    }

    /**
     * Waits until the button of a tab is shown in the tab bar, for at most the given time.
     *
     * @param {string} tabId
     * @param {number} timeout In milliseconds.
     * @returns {Promise<boolean>} Whether it was shown in time.
     */
    async waitForTabShown(tabId, timeout) {
        return this.#page.waitForSelector(`#${tabId}`, { state: 'visible', timeout }).then(() => true, () => false);
    }

    /**
     * Holds the responses to the requests matching a URL pattern while an action runs, so that they arrive late:
     * until the action releases them, and at the latest when it ends, failed or not, so that a check never leaves
     * them held.
     *
     * @template T
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {(held: {requested: (timeout?: number) => Promise<void>, release: (failStatus?: number) => Promise<void>}) => Promise<T>} action
     *          Given `requested`, which resolves when a matching request is being held (and fails the check if none is
     *          made in time), and `release`, which lets the held requests go on (or fail with the given HTTP status,
     *          whose console errors are then not collected) and stops holding new ones.
     * @returns {Promise<T>} What the action returns.
     */
    async holdRequestsDuring(urlPattern, action) {
        const held = await this.#holdRequests(urlPattern);
        try {
            return await action(held);
        } finally {
            await held.release();
        }
    }

    /**
     * @param {string} urlPattern
     * @returns {Promise<{requested: (timeout?: number) => Promise<void>, release: (failStatus?: number) => Promise<void>}>}
     *          See {@link holdRequestsDuring}; `release` does something only the first time.
     */
    async #holdRequests(urlPattern) {
        let release;
        const released = new Promise(resolve => { release = resolve; });
        let isReleased = false;
        let requested;
        const firstRequest = new Promise(resolve => { requested = resolve; });
        const heldRequests = [];
        const hold = route => {
            requested();
            const answer = failStatus => {
                if (!failStatus) {
                    return route.continue();
                }
                this.#deliberatelyFailedUrls.add(route.request().url());
                return route.fulfill({ status: failStatus, contentType: 'text/plain', body: 'Failed on purpose by the smoke test' });
            };
            // A held request that the page aborted meanwhile cannot go on, which is fine.
            const continued = released.then(answer).catch(() => {});
            heldRequests.push(continued);
            return continued;
        };
        await this.#page.route(urlPattern, hold);
        return {
            requested: async (timeout = ExplorerPage.#EVENT_TIMEOUT) => {
                let timer;
                const expired = new Promise((resolve, reject) => {
                    timer = setTimeout(() => reject(new Error(`no request matching ${urlPattern} was made within ${timeout / 1000} s`)), timeout);
                });
                try {
                    await Promise.race([firstRequest, expired]);
                } finally {
                    clearTimeout(timer);
                }
            },
            release: async failStatus => {
                if (isReleased) {
                    return;
                }
                isReleased = true;
                release(failStatus);
                await Promise.all(heldRequests);
                await this.#page.unroute(urlPattern, hold);
            }
        };
    }

    /**
     * Arranges for a version to be selected right after the requests whose URLs end with the given suffixes have
     * all completed, in the same task: before jQuery hands their responses over (it does so in a later task).
     *
     * @param {string[]} urlSuffixes
     * @param {'main'|'base'} dropdown
     * @param {string} version
     */
    async selectVersionWhenRequestsComplete(urlSuffixes, dropdown, version) {
        await this.#actWhenRequestsComplete(urlSuffixes, { selectVersion: { dropdown, version } });
    }

    /**
     * Arranges for a tab to be activated right after the requests whose URLs end with the given suffixes have all
     * completed, in the same task, the way the tab-switch event does it.
     *
     * @param {string[]} urlSuffixes
     * @param {string} tabId
     */
    async openTabWhenRequestsComplete(urlSuffixes, tabId) {
        await this.#actWhenRequestsComplete(urlSuffixes, { openTab: tabId });
    }

    /**
     * Watches the page's XMLHttpRequests and, when the last of the given ones fires "loadend", does the given action
     * synchronously, then stops watching.
     *
     * @param {string[]} urlSuffixes
     * @param {{selectVersion?: {dropdown: string, version: string}, openTab?: string}} action
     */
    async #actWhenRequestsComplete(urlSuffixes, action) {
        await this.#page.evaluate(async ([suffixes, todo]) => {
            const { SdkExplorerApplication } = await import('/src/js/app.js');
            const pending = new Set(suffixes);
            const { open, send } = XMLHttpRequest.prototype;
            const act = () => {
                if (todo.selectVersion) {
                    $(`#${todo.selectVersion.dropdown}-version-dropdown`).val(todo.selectVersion.version).trigger('change');
                } else {
                    $(`#${todo.openTab}`).tab('show');
                    SdkExplorerApplication.instance.activeTabChanged(todo.openTab);
                }
            };
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this.smokeTestUrl = String(url);
                return open.call(this, method, url, ...rest);
            };
            XMLHttpRequest.prototype.send = function (...args) {
                const suffix = suffixes.find(candidate => this.smokeTestUrl?.endsWith(candidate));
                if (suffix) {
                    this.addEventListener('loadend', () => {
                        pending.delete(suffix);
                        if (pending.size === 0) {
                            XMLHttpRequest.prototype.open = open;
                            XMLHttpRequest.prototype.send = send;
                            act();
                        }
                    });
                }
                return send.apply(this, args);
            };
        }, [urlSuffixes, action]);
    }

    /**
     * Starts counting the tree-nodes that jsTree adds to the tree of a tree-detail-split-view from now on.
     *
     * @param {string} splitViewId
     */
    async startCountingTreeNodes(splitViewId) {
        await this.#page.evaluate(id => {
            const treeView = document.getElementById(id).shadowRoot.querySelector('#treeView');
            window.smokeTestAddedTreeNodes = 0;
            new MutationObserver(records => {
                records.forEach(record => record.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        window.smokeTestAddedTreeNodes += (node.matches('li') ? 1 : 0) + node.querySelectorAll('li').length;
                    }
                }));
            }).observe(treeView, { childList: true, subtree: true });
        }, splitViewId);
    }

    /**
     * @returns {Promise<number>} The tree-nodes added since {@link startCountingTreeNodes}.
     */
    async countedTreeNodes() {
        return this.#page.evaluate(() => window.smokeTestAddedTreeNodes);
    }

    /**
     * Waits for the given time, so that work the page would do late has had the time to happen.
     *
     * @param {number} milliseconds
     */
    async waitFor(milliseconds) {
        await this.#page.waitForTimeout(milliseconds);
    }

    /**
     * Arranges for a version to be selected as soon as the first card is added to a card group, while the rest of
     * the cards of that load are still to come, as a user who changes the version just as the cards appear.
     *
     * @param {string} cardGroupId
     * @param {'main'|'base'} dropdown
     * @param {string} version
     */
    async selectVersionWhenFirstCardAppears(cardGroupId, dropdown, version) {
        await this.#page.evaluate(([id, which, value]) => {
            const container = document.getElementById(id).shadowRoot.querySelector('#cards-container');
            const observer = new MutationObserver(() => {
                observer.disconnect();
                $(`#${which}-version-dropdown`).val(value).trigger('change');
            });
            observer.observe(container, { childList: true });
        }, [cardGroupId, dropdown, version]);
    }

    /**
     * Selects two other versions, the target version first, as a user would, and waits until the explorer is idle.
     *
     * @param {string} mainVersion
     * @param {string} baseVersion
     */
    async selectVersions(mainVersion, baseVersion) {
        await this.startSelectingVersion('main', mainVersion);
        await this.waitUntilIdle();
        await this.startSelectingVersion('base', baseVersion);
        await this.waitUntilIdle();
    }

    /**
     * @param {string} tabId The id of the button of the tab, for example `validation-tab`.
     * @returns {Promise<boolean>} Whether the button of the tab is shown in the tab bar.
     */
    async isTabShown(tabId) {
        return this.#page.isVisible(`#${tabId}`);
    }

    /**
     * @returns {Promise<string>} The id of the button of the active tab.
     */
    async activeTab() {
        return this.#page.$eval('ul.nav-tabs button.nav-link.active', button => button.id);
    }

    /**
     * Opens a tab by clicking its button and waits until the explorer is idle.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async openTab(tabId) {
        await this.#page.click(`#${tabId}`);
        await this.waitUntilIdle();
    }

    /**
     * Starts the quick tour from the Home tab, as a user would, and waits for its popover to show.
     */
    async startTour() {
        await this.openTab('home-tab');
        await this.#page.click('#start-tour');
        await this.#page.waitForTimeout(ExplorerPage.#POPOVER_PERIOD);
    }

    /**
     * Clicks the Next button of the shown step of the quick tour and waits for the popovers to change.
     */
    async nextTourStep() {
        await this.#page.click('.popover.show .next-step');
        await this.#page.waitForTimeout(ExplorerPage.#POPOVER_PERIOD);
    }

    /**
     * Clicks the Cancel button of the shown step of the quick tour and waits for its popover to hide.
     */
    async cancelTour() {
        await this.#page.click('.popover.show .cancel-tour');
        await this.#page.waitForTimeout(ExplorerPage.#POPOVER_PERIOD);
    }

    /**
     * @returns {Promise<boolean>} Whether the shown popover (of the quick tour) is entirely within the window and,
     *          unless its anchor is in the pinned bar, below the bar (the popover of an anchor in the bar starts over
     *          the bar, by design).
     */
    async isPopoverInWindow() {
        return this.#page.$eval('.popover.show', popover => {
            const box = popover.getBoundingClientRect();
            const bar = document.querySelector('.ted-bar');
            const anchor = document.querySelector(`[aria-describedby="${popover.id}"]`);
            const top = anchor && bar.contains(anchor) ? 0 : bar.getBoundingClientRect().bottom;
            return box.top >= top && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
        });
    }

    /**
     * @returns {{width: number, height: number}} The size of the window.
     */
    windowSize() {
        return this.#page.viewportSize();
    }

    /**
     * @param {{width: number, height: number}} size
     */
    async resizeWindow(size) {
        await this.#page.setViewportSize(size);
    }

    /**
     * @returns {Promise<string[]>} The titles of the popovers on the page (Bootstrap removes a popover once hidden).
     */
    async popoverTitles() {
        return this.#page.$$eval('.popover', popovers => popovers.map(popover => popover.querySelector('.popover-header')?.textContent.trim()));
    }

    /**
     * Focuses the button of a tab and presses a key, as a user who moves along the tab bar with the keyboard, and
     * waits until the explorer is idle.
     *
     * @param {string} tabId The id of the button of the tab.
     * @param {string} key For example `ArrowRight`.
     */
    async pressKeyOnTab(tabId, key) {
        await this.#page.focus(`#${tabId}`);
        await this.#page.keyboard.press(key);
        await this.waitUntilIdle();
    }

    /**
     * Opens a tab that is hidden for the selected versions, through Bootstrap, to compare it with another tab.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async openHiddenTab(tabId) {
        await this.#page.evaluate(id => $(`#${id}`).tab('show'), tabId);
        await this.waitUntilIdle();
    }

    /**
     * Selects a source in the source selector of the Validation tab and waits until the explorer is idle.
     *
     * @param {string} source The value of the option, for example `schematron`.
     */
    async selectValidationSource(source) {
        await this.#clickToggleButton('validation-source', source);
    }

    /**
     * Selects a source in the metadata source selector of the Fields tab and waits until the explorer is idle.
     *
     * @param {string} source The value of the option, for example `fwd`.
     */
    async selectFieldsSource(source) {
        await this.#clickToggleButton('fields-source', source);
    }

    /**
     * Selects a source in the metadata source selector of the Fields tab, as a user would, without waiting for the
     * explorer to be idle (it is not, while a tab probe is held).
     *
     * @param {string} source The value of the option, for example `fwd`.
     */
    async startSelectingFieldsSource(source) {
        await this.#page.click(`#fields-source input[value="${source}"] + label`);
    }

    /**
     * @param {string} groupId The id of a toggle button group of radio inputs.
     * @returns {Promise<{checked: string, active: string[]}>} The value of the checked radio input, and the values of
     *          the radio inputs whose button shows the selected state: the checked ones (Bootstrap's `.btn-check:checked`
     *          styles the button that follows the radio input).
     */
    async selectedToggleButton(groupId) {
        return this.#page.$eval(`#${groupId}`, group => ({
            checked: group.querySelector('input[type="radio"]:checked')?.value,
            active: Array.from(group.querySelectorAll('input[type="radio"]:checked'), input => input.value)
        }));
    }

    /**
     * Clicks the button of a toggle button group that holds the radio input with the given value, as a user would,
     * and waits until the explorer is idle.
     *
     * @param {string} groupId
     * @param {string} value
     */
    async #clickToggleButton(groupId, value) {
        await this.#page.click(`#${groupId} input[value="${value}"] + label`);
        await this.waitUntilIdle();
    }

    /**
     * Reads the tree of a tree-detail-split-view, once jsTree has finished loading it.
     *
     * @param {string} splitViewId
     * @returns {Promise<Array<{id: string, parent: string, text: string, folder: boolean, status: string}>>}
     *          The tree-nodes; the status is the type of change of the item ('root' for a heading).
     */
    async treeNodes(splitViewId) {
        const readTree = id => {
            const tree = $(document.getElementById(id).shadowRoot.querySelector('#treeView')).jstree(true);
            return tree && !tree.is_loading('#') ? tree.get_json('#', { flat: true }).map(node => ({
                id: node.id,
                parent: node.parent,
                text: node.text,
                folder: node.icon === 'jstree-folder',
                status: (node.li_attr?.class ?? '').replace(/-node$/, '')
            })) : null;
        };
        // jsTree loads large trees in the background: wait until the tree has nodes and stops growing, for at most
        // the load timeout (a tree that never comes, for example after a failed load, fails the check).
        const deadline = Date.now() + ExplorerPage.#LOAD_TIMEOUT;
        let nodes = null;
        let previousLength = -1;
        do {
            if (Date.now() > deadline) {
                throw new Error(`the tree of ${splitViewId} was not loaded within ${ExplorerPage.#LOAD_TIMEOUT / 1000} s`);
            }
            await this.#page.waitForTimeout(ExplorerPage.#IDLE_PERIOD);
            previousLength = nodes?.length ?? -1;
            nodes = await this.#page.evaluate(readTree, splitViewId);
        } while (!nodes || nodes.length === 0 || nodes.length !== previousLength);
        return nodes;
    }

    /**
     * Runs an action while the requests matching a URL pattern fail with an HTTP 500, to see how the explorer reports
     * a failed load. The browser's console errors for these requests are not collected.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {() => Promise<void>} action
     * @param {string} [body] The body of the failed responses.
     */
    async failRequestsDuring(urlPattern, action, body = 'Failed on purpose by the smoke test') {
        const fail = route => {
            this.#deliberatelyFailedUrls.add(route.request().url());
            return route.fulfill({ status: 500, contentType: 'text/html', body: body });
        };
        await this.#page.route(urlPattern, fail);
        try {
            await action();
        } finally {
            await this.#page.unroute(urlPattern, fail);
        }
    }

    /**
     * Runs an action while the requests matching a URL pattern are answered with the given JSON, without reaching
     * the network, to see how the explorer handles a response that a service could give.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {Object} json
     * @param {() => Promise<void>} action
     */
    async answerJsonDuring(urlPattern, json, action) {
        const answer = route => route.fulfill({ json });
        await this.#page.route(urlPattern, answer);
        try {
            await action();
        } finally {
            await this.#page.unroute(urlPattern, answer);
        }
    }

    /**
     * Runs an action while the JSON responses to the requests matching a URL pattern are rewritten, to see how the
     * explorer shows content that the SDK could contain.
     *
     * @param {string} urlPattern A Playwright URL glob, as for page.route().
     * @param {function(Object): Object} rewrite Gets the parsed response and returns the content to answer with.
     * @param {() => Promise<void>} action
     */
    async rewriteJsonDuring(urlPattern, rewrite, action) {
        const rewriteResponse = async route => {
            const response = await route.fetch();
            await route.fulfill({ response, json: rewrite(await response.json()) });
        };
        await this.#page.route(urlPattern, rewriteResponse);
        try {
            await action();
        } finally {
            await this.#page.unroute(urlPattern, rewriteResponse);
        }
    }

    /**
     * @param {string} splitViewId
     * @param {string} nodeId
     * @returns {Promise<{text: string, elements: string[]}>} The text of a tree-node's label, and the elements in it
     *          other than jsTree's icon.
     */
    async treeLabel(splitViewId, nodeId) {
        await this.treeNodes(splitViewId);
        return this.#page.$eval(`#${splitViewId}`, (splitView, id) => {
            const anchor = splitView.shadowRoot.getElementById(`${id}_anchor`);
            return {
                text: anchor.textContent.trim(),
                elements: Array.from(anchor.querySelectorAll('*')).filter(element => !element.classList.contains('jstree-icon')).map(element => element.tagName)
            };
        }, nodeId);
    }

    /**
     * @param {string} splitViewId
     * @returns {Promise<boolean>} Whether the tree of a tree-detail-split-view has any node.
     */
    async hasTree(splitViewId) {
        return this.#page.evaluate(id => {
            const tree = $(document.getElementById(id).shadowRoot.querySelector('#treeView')).jstree(true);
            return Boolean(tree) && tree.get_json('#', { flat: true }).length > 0;
        }, splitViewId);
    }

    /**
     * @param {string} selector
     * @returns {Promise<string|null>} The text of the element, or null if it is hidden.
     */
    async shownText(selector) {
        return (await this.#page.isVisible(selector)) ? (await this.#page.innerText(selector)).trim() : null;
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<Array<{title: string, subtitle: string, status: string, compareEnabled: boolean}>>}
     *          The index cards of the card group, in display order.
     */
    async indexCards(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => Array.from(cardGroup.shadowRoot.querySelectorAll('index-card'), card => ({
            title: card.getAttribute('title'),
            subtitle: card.getAttribute('subtitle'),
            status: card.getAttribute('status'),
            compareEnabled: !card.shadowRoot.querySelector('#action-button').disabled
        })));
    }

    /**
     * Clicks the button of a tab and returns without waiting for the tab to finish loading.
     *
     * @param {string} tabId The id of the button of the tab.
     */
    async startOpeningTab(tabId) {
        await this.#page.click(`#${tabId}`);
    }

    /**
     * Waits until a card group has at least the given number of cards (while its tab may still be loading).
     *
     * @param {string} cardGroupId
     * @param {number} count
     */
    async waitForCards(cardGroupId, count) {
        await this.#page.waitForFunction(([id, minimum]) => document.getElementById(id).shadowRoot.querySelectorAll('index-card').length >= minimum,
            [cardGroupId, count], { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Waits until the property filter of a card group offers the given value (while its tab may still be loading).
     *
     * @param {string} cardGroupId
     * @param {string} value
     */
    async waitForFilterValue(cardGroupId, value) {
        await this.#page.waitForFunction(([id, filterValue]) => Array.from(document.getElementById(id).shadowRoot.querySelectorAll('#filter-options .nav-link'))
            .some(link => link.textContent === filterValue), [cardGroupId, value], { timeout: ExplorerPage.#LOAD_TIMEOUT });
    }

    /**
     * Clicks a value of the property filter of a card group, without waiting for the explorer to be idle.
     *
     * @param {string} cardGroupId
     * @param {string} value
     */
    async clickFilterValue(cardGroupId, value) {
        await this.#page.click(`#${cardGroupId} #filter-options .nav-link:text-is("${value}")`);
        await this.#page.waitForTimeout(ExplorerPage.#FILTER_PERIOD);
    }

    /**
     * Selects a status in the status filter of a card group, without waiting for the explorer to be idle.
     *
     * @param {string} cardGroupId
     * @param {string} status For example `modified`.
     */
    async selectStatusFilter(cardGroupId, status) {
        await this.#page.selectOption(`#${cardGroupId} #status-filter`, status);
        await this.#page.waitForTimeout(ExplorerPage.#FILTER_PERIOD);
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<string>} The status shown in the status filter of a card group.
     */
    async selectedStatusFilter(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => cardGroup.shadowRoot.querySelector('#status-filter').value);
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<Array<{title: string, subtitle: string, status: string|null, visible: boolean}>>}
     *          The index cards of the card group at this moment, with whether the filters show them.
     */
    async cardStates(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => Array.from(cardGroup.shadowRoot.querySelectorAll('index-card'), card => ({
            title: card.getAttribute('title'),
            subtitle: card.getAttribute('subtitle'),
            status: card.getAttribute('status'),
            visible: getComputedStyle(card).display !== 'none'
        })));
    }

    /**
     * @param {string} cardGroupId
     * @returns {Promise<{shown: boolean, prompt: string, values: string[]}>} The property filter of the card group.
     */
    async cardFilter(cardGroupId) {
        return this.#page.$eval(`#${cardGroupId}`, cardGroup => ({
            shown: getComputedStyle(cardGroup.shadowRoot.querySelector('#nav')).display !== 'none',
            prompt: cardGroup.shadowRoot.querySelector('#filter-prompt').textContent,
            values: Array.from(cardGroup.shadowRoot.querySelectorAll('#filter-options .nav-link'), link => link.textContent)
        }));
    }

    /**
     * Clicks the Compare button of an index card and waits until the explorer is idle.
     *
     * @param {string} cardGroupId
     * @param {string} title The title of the index card.
     */
    async compare(cardGroupId, title) {
        await this.#page.click(`#${cardGroupId} index-card[title="${title}"] #action-button`);
        await this.waitUntilIdle();
    }

    /**
     * Clicks the Overview link of a diff view and waits until the explorer is idle.
     *
     * @param {string} linkId
     */
    async openOverview(linkId) {
        await this.#page.click(`#${linkId}`);
        await this.waitUntilIdle();
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element is shown.
     */
    async isShown(selector) {
        return this.#page.isVisible(selector);
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element has no content.
     */
    async isEmpty(selector) {
        return this.#page.$eval(selector, element => element.childNodes.length === 0);
    }

    /**
     * @param {string} diffContainerId
     * @returns {Promise<string[]>} The names of the files compared in the diff view.
     */
    async comparedFiles(diffContainerId) {
        return this.#page.$$eval(`#${diffContainerId} .d2h-file-header .d2h-file-name`, names => names.map(name => name.textContent.trim()));
    }

    /**
     * Waits until the loading indicator of the explorer stays hidden for a while, for at most the idle timeout in
     * all (the indicator may show again after each wait).
     */
    async waitUntilIdle() {
        const loadingIndicatorHidden = () => getComputedStyle(document.querySelector('#centralLoadingSpinner')).visibility === 'hidden';
        const deadline = Date.now() + ExplorerPage.#IDLE_TIMEOUT;
        const notIdle = () => new Error(`the explorer was not idle within ${ExplorerPage.#IDLE_TIMEOUT / 1000} s`);
        do {
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                throw notIdle();
            }
            await this.#page.waitForFunction(loadingIndicatorHidden, null, { timeout: remaining }).catch(error => {
                throw error.name === 'TimeoutError' ? notIdle() : error;
            });
            await this.#page.waitForTimeout(ExplorerPage.#IDLE_PERIOD);
        } while (!(await this.#page.evaluate(loadingIndicatorHidden)));
    }

    /**
     * @param {import('playwright').ConsoleMessage} message
     * @returns {boolean} Whether the message is the browser's report of a 404 for a file probed for presence.
     */
    static #isExpectedAbsence(message) {
        return message.text().includes('status of 404')
            && ExplorerPage.#FILES_PROBED_FOR_PRESENCE.some(pattern => pattern.test(message.location().url ?? ''));
    }

    /**
     * @returns {Promise<Array<{message: string, detail: string|null, elements: string[], detailStyle: {color: string, display: string}|null}>>}
     *          The items of the error toast as the user sees it (none while it is hidden): the text of the message,
     *          the text of the detail line, the elements in the item other than the detail line, and the detail line's
     *          colour and display.
     */
    async toastItems() {
        if (!(await this.#page.isVisible('#apiStatus'))) {
            return [];
        }
        return this.#page.$$eval('#apiStatus .toast-body li', items => items.map(item => {
            const detail = item.querySelector(':scope > .detail');
            const style = detail ? getComputedStyle(detail) : null;
            return {
                message: Array.from(item.childNodes).filter(node => node !== detail).map(node => node.textContent).join(''),
                detail: detail ? detail.textContent : null,
                elements: Array.from(item.querySelectorAll('*')).filter(element => element !== detail).map(element => element.tagName),
                detailStyle: style ? { color: style.color, display: style.display } : null
            };
        }));
    }

    /**
     * @returns {Promise<boolean>} Whether a script injected through the page set the given global variable.
     * @param {string} name
     */
    async globalIsSet(name) {
        return this.#page.evaluate(variable => window[variable] !== undefined, name);
    }

    /**
     * @returns {Promise<string>} The text of the error toast as the user sees it: empty if there is none or while
     *          the toast is hidden (it hides itself 15 s after an error). For the checks that an error is shown.
     */
    async apiStatus() {
        return (await this.#page.isVisible('#apiStatus')) ? (await this.#page.textContent('#apiStatus .toast-body')).trim() : '';
    }

    /**
     * @param {string} selector
     * @returns {Promise<boolean>} Whether the element can be reached with the Tab key: enabled, and not taken out of
     *          the tab order (tabindex="-1", which Bootstrap gives the buttons of the tabs that are not active).
     */
    async isKeyboardFocusable(selector) {
        return this.#page.$eval(selector, element => !element.disabled && element.tabIndex >= 0);
    }

    /**
     * @param {string} selector
     * @returns {Promise<string>} The computed text colour of the element, for example `rgb(194, 194, 194)`.
     */
    async textColor(selector) {
        return this.#page.$eval(selector, element => getComputedStyle(element).color);
    }

    /**
     * @returns {Promise<string[]>} The ids of the tab buttons that are enabled, in the tab bar's order.
     */
    async enabledTabButtons() {
        return this.#page.$$eval('ul.nav-tabs button.nav-link', buttons => buttons.filter(button => !button.disabled).map(button => button.id));
    }

    /**
     * Reports errors to the explorer's toast, all in the same task, as several failed loads can.
     *
     * @param {string[]} messages
     */
    async reportErrors(messages) {
        await this.#page.evaluate(async texts => {
            const { SdkExplorerApplication } = await import('/src/js/app.js');
            texts.forEach(text => SdkExplorerApplication.updateApiStatus(text));
        }, messages);
    }

    /**
     * Clears the explorer's toast, as a tab switch or a version change does.
     */
    async clearErrors() {
        await this.#page.evaluate(async () => {
            const { SdkExplorerApplication } = await import('/src/js/app.js');
            SdkExplorerApplication.instance.clearApiStatus();
        });
    }

    /**
     * Replaces the page's timers with Playwright's clock, so that {@link runClock} can make time pass at once. It
     * stays installed for the rest of the run (every scenario uses this page), so the check that installs it comes
     * last.
     */
    async installClock() {
        await this.#page.clock.install();
    }

    /**
     * Makes the given time pass on Playwright's clock (see {@link installClock}), firing the timers due meanwhile.
     *
     * @param {number} milliseconds
     */
    async runClock(milliseconds) {
        await this.#page.clock.runFor(milliseconds);
    }

    /**
     * @returns {Promise<string>} The errors reported since the toast was last cleared (by a tab switch or a version
     *          change), whether the toast still shows them or has hidden them: empty if there is none. For the checks
     *          that no error was reported, which a hidden toast must not pass.
     */
    async reportedErrors() {
        return (await this.#page.textContent('#apiStatus .toast-body')).trim();
    }

    /** @returns {Promise<string>} */
    async mainVersion() {
        return this.#page.inputValue('#main-version-dropdown');
    }

    /** @returns {Promise<string>} */
    async baseVersion() {
        return this.#page.inputValue('#base-version-dropdown');
    }

    /** @returns {Promise<string[]>} The options of the target version dropdown, in display order. */
    async mainVersionOptions() {
        return this.#page.$$eval('#main-version-dropdown option', options => options.map(option => option.value));
    }

    /** @returns {Promise<string[]>} The options of the base version dropdown, in display order. */
    async baseVersionOptions() {
        return this.#page.$$eval('#base-version-dropdown option', options => options.map(option => option.value));
    }
}

/**
 * The checks of the smoke test, grouped by the explorer URL they need, so that each URL is loaded once.
 */
class SmokeTest {

    /**
     * Runs of consecutive versions that the version dropdowns list in this order, latest first.
     * They name real tags of the SDK and hold as long as these tags are listed: the 1.16.0 pre-releases (its betas;
     * its release candidates were deleted when 1.16.0 was released) are listed until a release later than 1.16.0
     * exists.
     */
    static #EXPECTED_VERSION_RUNS = Object.freeze([
        ['2.0.0-alpha.5', '2.0.0-alpha.4', '2.0.0-alpha.3', '2.0.0-alpha.2', '2.0.0-alpha.1'],
        ['1.16.0', '1.16.0-beta.3', '1.16.0-beta.2', '1.16.0-beta.1', '1.15.1'],
    ]);

    /** The roots of the tree of the Fields tab in fwd/ mode. */
    static #FORWARD_COMPATIBLE_ROOTS = Object.freeze(['XML structure', 'Business entities', 'Data types']);

    /** The files of the validation folder of an SDK 2 version, in the order of their index cards. */
    static #VALIDATION_FILES = Object.freeze(['rules.efx', 'stage-1a.efx', 'stage-4m.efx', 'stage-5m.efx', 'dependencies.json']);

    /** @type {ExplorerPage} */
    #explorer;

    /** @type {number} */
    #passed = 0;

    /** @type {number} */
    #failed = 0;

    /**
     * @param {ExplorerPage} explorer
     */
    constructor(explorer) {
        this.#explorer = explorer;
    }

    /**
     * Runs all checks and reports each of them on the console.
     *
     * @returns {Promise<number>} The number of failed checks.
     */
    async run() {
        await this.#checkPairFromQueryString();
        await this.#checkDefaultBaseWithoutPreviousMinor();
        await this.#checkBranchAsTarget();
        await this.#checkPairWithoutRules();
        await this.#checkPairWithRules();
        await this.#checkPairWithPartialForwardCompatibleMetadata();
        await this.#checkFilterAfterVersionChange();
        await this.#checkCodelistsAcrossRenames();
        await this.#checkFiltersWhileLoading();
        await this.#checkVersionPicker();
        await this.#checkVersionListFailure();
        // Last: its last check installs Playwright's clock in the page, for the rest of the run.
        await this.#checkFailedProbe();
        console.log(`\n${this.#passed} passed, ${this.#failed} failed; ${this.#explorer.githubApiRequests.length} GitHub API requests`);
        return this.#failed;
    }

    /** A target with EFX rules and a base without. */
    async #checkPairFromQueryString() {
        await this.#scenario('?version=2.0.0-alpha.4&base=1.16.0', [
            ['both versions are taken from the query string', async () => {
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                assert.equal(await this.#explorer.baseVersion(), '1.16.0');
            }],
            ['the target dropdown offers the branches develop and efx-2 at the top', async () => {
                assert.deepEqual((await this.#explorer.mainVersionOptions()).slice(0, 2), ['develop', 'efx-2']);
            }],
            ['both dropdowns list the versions in version order (2.0.0-alpha.5 … 2.0.0-alpha.1 … 1.16.0, 1.16.0-beta.3 … 1.16.0-beta.1, 1.15.1)', async () => {
                SmokeTest.#assertVersionOrder(await this.#explorer.mainVersionOptions());
                SmokeTest.#assertVersionOrder(await this.#explorer.baseVersionOptions());
            }],
            ['the releases beyond the first page of tags (1.10.0 to 1.10.2) are listed', async () => {
                const options = await this.#explorer.baseVersionOptions();
                ['1.10.0', '1.10.1', '1.10.2'].forEach(version => assert.ok(options.includes(version), `${version} is missing`));
            }],
            ['the Validation tab is shown and the Schematrons tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
            ['the Fields tab in fwd/ mode names 1.16.0 as having no forward-compatible metadata and shows every item as added', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#explorer.selectFieldsSource('fwd');
                assert.deepEqual(await this.#explorer.selectedToggleButton('fields-source'), { checked: 'fwd', active: ['fwd'] });
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.16.0 has no forward-compatible metadata (fields/fwd/).');
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.text), SmokeTest.#FORWARD_COMPATIBLE_ROOTS);
                assert.deepEqual(nodes.filter(node => node.parent !== '#' && node.status !== 'added'), []);
            }],
            ['the View Templates tab lists summary.efx, which view-templates.json does not list, as added', async () => {
                await this.#assertViewTemplateStatus('summary.efx', 'added');
            }],
            ['the Validation tab lists the EFX rules files as added, with Compare disabled', async () => {
                await this.#explorer.openTab('validation-tab');
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.deepEqual(cards.map(card => card.title), SmokeTest.#VALIDATION_FILES);
                cards.forEach(card => {
                    assert.equal(card.status, 'added', card.title);
                    assert.equal(card.compareEnabled, false, card.title);
                });
            }],
            ['selecting 1.14.2 and 1.15.1 while the Validation tab is active shows the Schematrons tab again, which replaces it', async () => {
                // The base first: 2.0.0-alpha.4 still has EFX rules, so the Validation tab stays, and the Schematrons
                // tab loads (its git trees) only for the final pair.
                await this.#explorer.startSelectingVersion('base', '1.14.2');
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'validation-tab');
                // 1.15.1 and 1.14.2 have no EFX rules: the Validation tab goes, and Schematrons is activated.
                await this.#explorer.startSelectingVersion('main', '1.15.1');
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'schematrons-tab');
                await this.#assertTabsShown({ 'validation-tab': false, 'schematrons-tab': true });
                assert.ok((await this.#explorer.indexCards('schematrons-overview-card-group')).length > 0, 'the Schematrons tab has no cards');
            }],
            ['the fwd/ source stays selected in the Fields tab after the version change, and is used', async () => {
                assert.deepEqual(await this.#explorer.selectedToggleButton('fields-source'), { checked: 'fwd', active: ['fwd'] });
                await this.#explorer.openTab('fields-tab');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.15.1 and 1.14.2 have no forward-compatible metadata (fields/fwd/).');
            }],
        ]);
    }

    async #checkDefaultBaseWithoutPreviousMinor() {
        await this.#scenario('?version=2.0.0-alpha.4', [
            ['the base defaults to the release immediately preceding the target', async () => {
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                const options = await this.#explorer.baseVersionOptions();
                const precedingRelease = options.slice(options.indexOf('2.0.0-alpha.4') + 1).find(SmokeTest.#isRelease);
                assert.equal(await this.#explorer.baseVersion(), precedingRelease);
            }],
        ]);
    }

    async #checkBranchAsTarget() {
        await this.#scenario('?version=efx-2', [
            ['a branch is accepted as target, with the latest release as base', async () => {
                assert.equal(await this.#explorer.mainVersion(), 'efx-2');
                const latestRelease = (await this.#explorer.baseVersionOptions()).find(SmokeTest.#isRelease);
                assert.equal(await this.#explorer.baseVersion(), latestRelease);
            }],
            ['the Validation tab is shown and the Schematrons tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
        ]);
    }

    /** Two versions without EFX rules. */
    async #checkPairWithoutRules() {
        await this.#scenario('?version=1.15.1&base=1.14.2', [
            ['the Schematrons tab is shown and the Validation tab is hidden', async () => {
                await this.#assertTabsShown({ 'validation-tab': false, 'schematrons-tab': true });
            }],
            ['selecting 2.0.0-alpha.4 while the Schematrons tab is active shows the Validation tab, which replaces it; selecting 1.15.1 again shows the Schematrons tab', async () => {
                await this.#explorer.openTab('schematrons-tab');
                // 2.0.0-alpha.4 has EFX rules: the Schematrons tab goes, and Validation is activated.
                await this.#explorer.startSelectingVersion('main', '2.0.0-alpha.4');
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'validation-tab');
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
                assert.ok((await this.#explorer.indexCards('validation-overview-card-group')).length > 0, 'the Validation tab has no cards');
                // Back to the scenario's pair, for the checks below.
                await this.#explorer.startSelectingVersion('main', '1.15.1');
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'schematrons-tab');
                await this.#assertTabsShown({ 'validation-tab': false, 'schematrons-tab': true });
            }],
            ['the Fields tab shows fields.json by default, under ND-Root, without the alert', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#assertFieldsJsonTree();
            }],
            ['when the tabs cannot be probed after a version change, the Fields pane is empty and the toast names the file', async () => {
                await this.#explorer.failRequestsDuring('**/1.14.1/validation/rules.efx', async () => {
                    await this.#explorer.startSelectingVersion('base', '1.14.1');
                    await this.#explorer.waitUntilIdle();
                });
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /rules\.efx for SDK 1\.14\.1/);
            }],
            ['a probe for an older selection that answers late does not change the tab bar of a newer selection', async () => {
                await this.#explorer.holdRequestsDuring('**/1.14.0/validation/rules.efx', async olderProbe => {
                    await this.#explorer.startSelectingVersion('main', '1.14.0');
                    await olderProbe.requested();
                    await this.#explorer.startSelectingVersion('main', '2.0.0-alpha.2');
                    assert.ok(await this.#explorer.waitForTabShown('validation-tab', 60000), 'the newer selection did not show the Validation tab');
                    await olderProbe.release();
                });
                await this.#explorer.waitUntilIdle();
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
            ['a version change made while the tabs are probed at start-up is applied', async () => {
                const validationShown = await this.#explorer.holdRequestsDuring('**/1.15.1/validation/rules.efx', async startupProbe => {
                    await this.#explorer.openWithoutWaiting('?version=1.15.1&base=1.14.2');
                    await startupProbe.requested();
                    await this.#explorer.startSelectingVersion('main', '2.0.0-alpha.4');
                    const shown = await this.#explorer.waitForTabShown('validation-tab', 30000);
                    await startupProbe.release();
                    return shown;
                });
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.mainVersion(), '2.0.0-alpha.4');
                assert.deepEqual(await this.#explorer.appState(), { mainVersion: '2.0.0-alpha.4', baseVersion: '1.14.2' });
                assert.ok(validationShown, 'the Validation tab was not shown for 2.0.0-alpha.4');
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
            }],
            ['the quick tour shows its steps one at a time, also once the Fields tab has been opened, and Cancel ends it', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#explorer.startTour();
                const shown = [await this.#explorer.popoverTitles()];
                for (let step = 0; step < 4; step++) {
                    await this.#explorer.nextTourStep();
                    shown.push(await this.#explorer.popoverTitles());
                }
                assert.deepEqual(shown, [['Choose the versions to compare'], ['Switch between sections'], ['Loading indicator'], ['Identify changes'], []]);
                await this.#explorer.startTour();
                await this.#explorer.nextTourStep();
                await this.#explorer.cancelTour();
                assert.deepEqual(await this.#explorer.popoverTitles(), []);
                await this.#explorer.startTour();
                assert.deepEqual(await this.#explorer.popoverTitles(), ['Choose the versions to compare']);
                await this.#explorer.cancelTour();
            }],
            ['in a 768x768 window, the quick tour brings each step into view: every popover, its Next or Done included, is inside the window and below the bar', async () => {
                await this.#assertTourStepsInView({ width: 768, height: 768 });
            }],
            ['in a 1440x768 window, the quick tour brings each step into view: every popover, its Next or Done included, is inside the window and below the bar', async () => {
                await this.#assertTourStepsInView({ width: 1440, height: 768 });
            }],
        ]);
    }

    /**
     * Runs the quick tour in a window of the given size and asserts, before each Next, that the shown step's popover
     * is in view (see {@link ExplorerPage#isPopoverInWindow}). The window's size is restored after.
     *
     * @param {{width: number, height: number}} windowSize
     */
    async #assertTourStepsInView(windowSize) {
        const size = this.#explorer.windowSize();
        await this.#explorer.resizeWindow(windowSize);
        try {
            await this.#explorer.startTour();
            const steps = [];
            for (let step = 0; step < 4; step++) {
                steps.push([(await this.#explorer.popoverTitles())[0], await this.#explorer.isPopoverInWindow()]);
                await this.#explorer.nextTourStep();
            }
            assert.deepEqual(steps, [['Choose the versions to compare', true], ['Switch between sections', true], ['Loading indicator', true], ['Identify changes', true]]);
            assert.deepEqual(await this.#explorer.popoverTitles(), []);
        } finally {
            await this.#explorer.resizeWindow(size);
        }
    }

    /** Two versions with the same EFX rules. */
    async #checkPairWithRules() {
        await this.#scenario('?version=2.0.0-alpha.4&base=2.0.0-alpha.3', [
            ['the Fields tab shows fields.json by default, under ND-Root, without the alert', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#assertFieldsJsonTree();
            }],
            ['a slow response for a superseded pair does not replace the tree of the newer pair', async () => {
                await this.#explorer.holdRequestsDuring('**/1.3.2/fields/fields.json', async slowResponse => {
                    await this.#explorer.startSelectingVersion('base', '1.3.2');
                    await slowResponse.requested();
                    await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.4');
                    assert.ok((await this.#explorer.treeNodes('fields-explorer')).length > 0, 'no tree for the newer pair');
                    await slowResponse.release();
                });
                await this.#explorer.waitUntilIdle();
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.status !== 'unchanged').map(node => node.id).slice(0, 5), [],
                    'the tree is not the one of 2.0.0-alpha.4 against itself');
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.3');
                await this.#explorer.waitUntilIdle();
            }],
            ['a response that completed just before a version change does not render: the tree never shows the older pair, and a failed newer load leaves the pane empty', async () => {
                // The newer base (1.3.2) was probed earlier in this scenario, so its load starts at once, before the
                // older responses are handed over.
                const treeNodesWhileHeld = await this.#explorer.holdRequestsDuring('**/1.3.2/fields/fields.json', async newerIndex => {
                    await this.#explorer.selectVersionWhenRequestsComplete(['/2.0.0-alpha.4/fields/fields.json', '/2.0.0-alpha.1/fields/fields.json'], 'base', '1.3.2');
                    await this.#explorer.startCountingTreeNodes('fields-explorer');
                    await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.1');
                    await newerIndex.requested();
                    await this.#explorer.waitFor(1500);
                    const nodes = await this.#explorer.countedTreeNodes();
                    await newerIndex.release(500);
                    return nodes;
                });
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.baseVersion(), '1.3.2');
                assert.equal(treeNodesWhileHeld, 0, 'the tree of the older pair was shown');
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /fields\.json for SDK 1\.3\.2/);
                await this.#explorer.startSelectingVersion('base', '2.0.0-alpha.3');
                await this.#explorer.waitUntilIdle();
            }],
            ['tree labels are text: a field name containing <b>x</b> is shown as it is', async () => {
                const rewrite = content => {
                    content.fields.find(field => field.id === 'BT-507-Business').name = '<b>x</b> NUTS code';
                    return content;
                };
                await this.#explorer.rewriteJsonDuring('**/2.0.0-alpha.4/fields/fields.json', rewrite, async () => {
                    await this.#explorer.openTab('home-tab');
                    await this.#explorer.openTab('fields-tab');
                    assert.deepEqual(await this.#explorer.treeLabel('fields-explorer', 'BT-507-Business'), { text: '<b>x</b> NUTS code', elements: [] });
                });
            }],
            ['the Fields tab in fwd/ mode shows 262 nodes, 13 modified fields (BT-507-Business among them), 96 business entities and 19 data types', async () => {
                await this.#explorer.selectFieldsSource('fwd');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), null);
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.text), SmokeTest.#FORWARD_COMPATIBLE_ROOTS);
                const xmlStructure = nodes.filter(node => node.parent !== '#' && !/^(be|bep|dt):/.test(node.id));
                assert.equal(xmlStructure.filter(node => node.folder).length, 262, 'nodes');
                const modifiedFields = xmlStructure.filter(node => !node.folder && node.status === 'modified').map(node => node.id);
                assert.equal(modifiedFields.length, 13, `modified fields: ${modifiedFields.join(', ')}`);
                assert.ok(modifiedFields.includes('BT-507-Business'), 'BT-507-Business is not modified');
                assert.equal(nodes.filter(node => node.id.startsWith('be:')).length, 96, 'business entities');
                assert.equal(nodes.filter(node => node.id.startsWith('dt:')).length, 19, 'data types');
            }],
            ['when loading fails, the Fields tab shows an empty pane and the error naming the file, not the previous tree', async () => {
                await this.#explorer.selectFieldsSource('fields-json');
                assert.ok((await this.#explorer.treeNodes('fields-explorer')).length > 0, 'no fields.json tree');
                await this.#explorer.failRequestsDuring('**/2.0.0-alpha.3/fields/fwd/data-types.json', () => this.#explorer.selectFieldsSource('fwd'));
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /fwd\/data-types\.json for SDK 2\.0\.0-alpha\.3/);
            }],
            ['the error toast shows the body of a failed response as text, never as HTML, under the message', async () => {
                const body = '<img src=x onerror="window.smokeTestInjected = true">';
                await this.#explorer.failRequestsDuring('**/2.0.0-alpha.3/fields/fwd/data-types.json', async () => {
                    await this.#explorer.selectFieldsSource('fields-json');
                    await this.#explorer.selectFieldsSource('fwd');
                }, body);
                // A source switch does not clear the toast: the item of this failure is the last one.
                assert.deepEqual((await this.#explorer.toastItems()).pop(), {
                    message: 'Error while downloading file fwd/data-types.json for SDK 2.0.0-alpha.3',
                    detail: body,
                    elements: [],
                    detailStyle: { color: 'rgb(102, 102, 102)', display: 'block' }  // --gs-base-color-gray-75, on a line of its own
                });
                assert.equal(await this.#explorer.globalIsSet('smokeTestInjected'), false);
            }],
            ['the View Templates tab lists summary.efx, which view-templates.json does not list, as unchanged', async () => {
                await this.#assertViewTemplateStatus('summary.efx', 'unchanged');
            }],
            ['Compare opens the diff of summary.efx, and going back to Overview empties the diff view', async () => {
                await this.#explorer.compare('view-templates-overview-card-group', 'summary.efx');
                assert.equal(await this.#explorer.isShown('#view-templates-diff-view'), true);
                assert.deepEqual(await this.#explorer.comparedFiles('view-templates-diff'), ['summary.efx']);
                await this.#explorer.openOverview('view-templates-overview-link');
                assert.equal(await this.#explorer.isEmpty('#view-templates-diff'), true);
            }],
            ['leaving the Validation tab right after its files arrived shows no card afterwards', async () => {
                const suffixes = ['2.0.0-alpha.4', '2.0.0-alpha.3'].flatMap(version => SmokeTest.#VALIDATION_FILES.map(file => `/${version}/validation/${file}`));
                await this.#explorer.openTabWhenRequestsComplete(suffixes, 'home-tab');
                await this.#explorer.startOpeningTab('validation-tab');
                await this.#explorer.waitFor(1500);
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'home-tab');
                assert.deepEqual((await this.#explorer.cardStates('validation-overview-card-group')).map(card => card.title), []);
            }],
            ['the Validation tab lists the EFX rules files as unchanged, without a folder filter', async () => {
                await this.#explorer.openTab('validation-tab');
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.deepEqual(cards.map(card => card.title), SmokeTest.#VALIDATION_FILES);
                cards.forEach(card => {
                    assert.equal(card.status, 'unchanged', card.title);
                    assert.equal(card.compareEnabled, true, card.title);
                });
                assert.equal((await this.#explorer.cardFilter('validation-overview-card-group')).shown, false);
            }],
            ['Compare opens the diff of rules.efx', async () => {
                await this.#explorer.compare('validation-overview-card-group', 'rules.efx');
                try {
                    assert.equal(await this.#explorer.isShown('#validation-diff-view'), true);
                    assert.deepEqual(await this.#explorer.comparedFiles('validation-diff'), ['rules.efx']);
                } finally {
                    await this.#explorer.openOverview('validation-overview-link');
                }
            }],
            ['under EFX rules, the status filter "modified" hides the unchanged files', async () => {
                await this.#explorer.selectStatusFilter('validation-overview-card-group', 'modified');
                assert.deepEqual((await this.#explorer.cardStates('validation-overview-card-group')).filter(card => card.visible).map(card => card.title), []);
            }],
            ['the Schematron source lists the schematrons of the pair with one git trees request per version', async () => {
                const treesRequests = await this.#treesRequestsDuring(() => this.#explorer.selectValidationSource('schematron'));
                assert.equal(treesRequests, 2);
                assert.deepEqual(await this.#explorer.selectedToggleButton('validation-source'), { checked: 'schematron', active: ['schematron'] });
                const cards = await this.#explorer.indexCards('validation-overview-card-group');
                assert.ok(cards.length > 0, 'no cards');
                assert.ok(cards.every(card => card.status), 'a card has no status');
                assert.equal((await this.#explorer.cardFilter('validation-overview-card-group')).shown, true);
            }],
            ['after the switch to Schematron the status filter is back to "all", and the folder "static" shows only its cards, whatever their status', async () => {
                assert.equal(await this.#explorer.selectedStatusFilter('validation-overview-card-group'), 'all');
                const cards = await this.#explorer.cardStates('validation-overview-card-group');
                assert.deepEqual(cards.filter(card => !card.visible).map(card => card.title), []);
                await this.#explorer.clickFilterValue('validation-overview-card-group', 'static');
                const visible = (await this.#explorer.cardStates('validation-overview-card-group')).filter(card => card.visible);
                const staticCards = cards.filter(card => card.subtitle === 'static');
                assert.ok(staticCards.length > 0, 'no static cards');
                assert.equal(visible.length, staticCards.length);
                assert.ok(visible.every(card => card.subtitle === 'static'), 'a card of another folder is shown');
            }],
            ['the Schematrons tab shows the same cards, folder filter and statuses, without any GitHub API request', async () => {
                const validationCards = await this.#explorer.indexCards('validation-overview-card-group');
                const validationFilter = await this.#explorer.cardFilter('validation-overview-card-group');
                const before = this.#explorer.githubApiRequests.length;
                await this.#explorer.openHiddenTab('schematrons-tab');
                assert.deepEqual(this.#explorer.githubApiRequests.slice(before), []);
                assert.deepEqual(await this.#explorer.indexCards('schematrons-overview-card-group'), validationCards);
                assert.deepEqual(await this.#explorer.cardFilter('schematrons-overview-card-group'), validationFilter);
            }],
            ['the arrow keys of the tab bar skip the hidden Schematrons tab, between Schemas and Validation', async () => {
                // Bootstrap handles the keys on the buttons of the tabs opened before (here Validation); Schemas
                // lists its folder from the git trees that the Schematron source fetched above.
                await this.#explorer.pressKeyOnTab('validation-tab', 'ArrowLeft');
                assert.equal(await this.#explorer.activeTab(), 'schemas-tab');
                await this.#explorer.pressKeyOnTab('schemas-tab', 'ArrowRight');
                assert.equal(await this.#explorer.activeTab(), 'validation-tab');
            }],
        ]);
    }

    /**
     * A pair whose codelists have parents (currency among them) that the second pair's do not have.
     * Both pairs predate 1.12.0, which renamed some codelist files, so that the switch does not compare files across the rename.
     */
    async #checkFilterAfterVersionChange() {
        await this.#scenario('?version=1.4.5&base=1.4.0', [
            ['after a version change, the Codelists filter lists only the parents of the codelists shown', async () => {
                await this.#explorer.openTab('codelists-tab');
                assert.ok((await this.#explorer.cardFilter('code-lists-overview-card-group')).values.includes('currency'), 'currency is not a parent in 1.4.5 or 1.4.0');
                await this.#explorer.selectVersions('1.3.6', '1.3.2');
                const parents = new Set((await this.#explorer.indexCards('code-lists-overview-card-group')).map(card => card.subtitle || '(blank)'));
                const filter = await this.#explorer.cardFilter('code-lists-overview-card-group');
                assert.deepEqual([...filter.values].sort(), [...parents, '(all)'].sort());
            }],
            ['the cards of a load superseded by a version change are not added to the newer comparison', async () => {
                // The newer pair's index is held, so that the pane must stay empty until it arrives.
                const whileHeld = await this.#explorer.holdRequestsDuring('**/1.4.0/codelists/codelists.json', async newerIndex => {
                    await this.#explorer.openTab('home-tab');
                    await this.#explorer.selectVersionWhenFirstCardAppears('code-lists-overview-card-group', 'base', '1.4.0');
                    await this.#explorer.startOpeningTab('codelists-tab');
                    await newerIndex.requested();
                    const cards = await this.#explorer.cardStates('code-lists-overview-card-group');
                    await newerIndex.release();
                    return cards;
                });
                await this.#explorer.waitUntilIdle();
                assert.deepEqual(whileHeld.map(card => card.title).slice(0, 5), [], `${whileHeld.length} cards of the superseded load were added`);
                assert.equal(await this.#explorer.baseVersion(), '1.4.0');
                const titles = (await this.#explorer.cardStates('code-lists-overview-card-group')).map(card => card.title);
                assert.ok(titles.length > 0, 'no cards');
                assert.deepEqual(titles.filter((title, index) => titles.indexOf(title) !== index), []);
            }],
        ]);
    }

    /**
     * A pair whose codelists take a while to check in the background: the filters must apply to the cards whose
     * status is still pending (upstream issues #56 and #57).
     */
    /** The version chips, Home's comparison buttons and the version dialog. */
    async #checkVersionPicker() {
        await this.#scenario('?version=1.15.1&base=1.14.2', [
            ['until start-up has filled the versions, Home\'s buttons are disabled; then the dialog\'s Compare without a change changes nothing and shows the Fields tab', async () => {
                await this.#explorer.forgetCachedVersions();
                await this.#explorer.holdRequestsDuring('https://data.jsdelivr.com/**', async versions => {
                    await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                    await versions.requested();
                    assert.deepEqual([await this.#explorer.isEnabled('#compare-versions'), await this.#explorer.isEnabled('#choose-versions')], [false, false]);
                    await versions.release();
                });
                await this.#explorer.waitForVersions();
                await this.#explorer.waitUntilIdle();
                assert.deepEqual([await this.#explorer.isEnabled('#compare-versions'), await this.#explorer.isEnabled('#choose-versions')], [true, true]);
                await this.#explorer.startCountingVersionChanges();
                await this.#explorer.compareInDialogUnchanged();
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.countedVersionChanges(), 0);
                assert.deepEqual(await this.#explorer.appState(), { mainVersion: '1.15.1', baseVersion: '1.14.2' });
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
            }],
            ['on Home the comparison line is hidden, and "Compare 1.14.2 › 1.15.1" shows the Fields tab of the pair', async () => {
                await this.#explorer.openTab('home-tab');
                assert.equal(await this.#explorer.isShown('.ted-comparison-line'), false);
                assert.equal(await this.#explorer.compareFromHome(), 'Compare 1.14.2 \u203A 1.15.1');
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(await this.#explorer.isShown('.ted-comparison-line'), true);
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
            }],
            ['the target version menu has a Branches section, the base version menu has none', async () => {
                assert.deepEqual(await this.#explorer.versionMenuSections('target'), ['Branches', 'Pre-releases', 'Releases']);
                assert.deepEqual(await this.#explorer.versionMenuSections('base'), ['Pre-releases', 'Releases']);
            }],
            ['choosing a version in a chip\'s menu reloads the comparison with the new pair', async () => {
                await this.#explorer.startCountingVersionChanges();
                await this.#explorer.startSelectingVersion('base', '1.14.1');
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.countedVersionChanges(), 1);
                assert.deepEqual(await this.#explorer.appState(), { mainVersion: '1.15.1', baseVersion: '1.14.1' });
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
            }],
            ['after scrolling far down a tab, switching to Home shows its comparison buttons', async () => {
                await this.#explorer.scrollToBottom();
                await this.#explorer.openTab('home-tab');
                assert.equal(await this.#explorer.isInWindow('#compare-versions'), true);
            }],
            ['the dialog\'s Compare with both versions changed applies them with one reload and shows the Fields tab of the new pair, loaded once although the tabs were still being probed', async () => {
                await this.#explorer.openTab('home-tab');
                await this.#explorer.startCountingVersionChanges();
                // 1.13.0's probe is held (this page has not probed 1.13.0 yet: the explorer keeps each version's
                // answer, as it has 1.14.2's) until Fields has been activated, on its shown.bs.tab, which comes after
                // the dialog has closed and the pane has faded in: so Fields is always activated while the tabs are
                // still probed.
                const firstRequest = this.#explorer.requestedUrls.length;
                await this.#explorer.holdRequestsDuring('**/1.13.0/validation/rules.efx', async probe => {
                    await this.#explorer.startWaitingForTabShown('fields-tab');
                    await this.#explorer.startComparingInDialog('1.14.2', '1.13.0');
                    await probe.requested();
                    await this.#explorer.tabShown();
                    await probe.release();
                });
                await this.#explorer.waitUntilIdle();
                const fieldsJsonVersions = this.#explorer.requestedUrls.slice(firstRequest).filter(url => url.endsWith('/fields/fields.json')).map(url => url.split('/').at(-3));
                assert.deepEqual(fieldsJsonVersions.sort(), ['1.13.0', '1.14.2']);
                assert.equal(await this.#explorer.countedVersionChanges(), 1);
                assert.deepEqual(await this.#explorer.appState(), { mainVersion: '1.14.2', baseVersion: '1.13.0' });
                assert.equal(await this.#explorer.mainVersion(), '1.14.2');
                assert.equal(await this.#explorer.baseVersion(), '1.13.0');
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
            }],
            ['Enter on Home\'s "Compare 1.13.0 \u203A 1.14.2" leaves the focus on the Fields tab\'s button (Home, with the button, is hidden)', async () => {
                await this.#explorer.openTab('home-tab');
                await this.#explorer.compareFromHomeWithEnter();
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(await this.#explorer.focusedElement(), 'fields-tab');
            }],
            ['Enter on the dialog\'s Compare leaves the focus on the Fields tab\'s button', async () => {
                await this.#explorer.openTab('home-tab');
                await this.#explorer.compareInDialogWithEnter();
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(await this.#explorer.focusedElement(), 'fields-tab');
            }],
            ['a tab opened while start-up is still loading the versions is rendered once they are known, and its options work (fwd/: the alert, no error)', async () => {
                // A cold load: the tab is opened before the application listens to the tab bar.
                await this.#explorer.forgetCachedVersions();
                await this.#explorer.holdRequestsDuring('https://data.jsdelivr.com/**', async versions => {
                    await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                    await versions.requested();
                    await this.#explorer.startOpeningTab('fields-tab');
                    await versions.release();
                });
                await this.#explorer.waitForVersions();
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
                await this.#explorer.selectFieldsSource('fwd');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.15.1 and 1.14.2 have no forward-compatible metadata (fields/fwd/).');
                assert.equal(await this.#explorer.reportedErrors(), '');
            }],
            ['source changes in a tab opened while start-up is still loading the versions wait for them: no probe before, the tree and no error after (fwd/, then fields.json)', async () => {
                await this.#explorer.forgetCachedVersions();
                const firstRequest = this.#explorer.requestedUrls.length;
                const probesBeforeVersions = await this.#explorer.holdRequestsDuring('https://data.jsdelivr.com/**', async versions => {
                    await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                    await versions.requested();
                    await this.#explorer.startOpeningTab('fields-tab');
                    await this.#explorer.startSelectingFieldsSource('fwd');
                    await this.#explorer.startSelectingFieldsSource('fields-json');
                    const probes = this.#explorer.requestedUrls.slice(firstRequest).filter(url => url.endsWith('/validation/rules.efx'));
                    await versions.release();
                    return probes;
                });
                assert.deepEqual(probesBeforeVersions, []);
                await this.#explorer.waitForVersions();
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.deepEqual(await this.#explorer.selectedToggleButton('fields-source'), { checked: 'fields-json', active: ['fields-json'] });
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
                assert.equal(await this.#explorer.reportedErrors(), '');
            }],
        ]);
    }

    /**
     * Start-up when the list of versions cannot be downloaded (jsDelivr answering 503, on a cold load): it stops,
     * with the error shown until the user closes it, and nothing but Home to open.
     */
    async #checkVersionListFailure() {
        await this.#scenario('?version=1.15.1&base=1.14.2', [
            ['when the version list cannot be downloaded, start-up stops: the error and "Reload the page to try again." stay shown, Home is shown (also over a tab opened meanwhile) and is the only tab to open, and nothing is requested from the SDK', async () => {
                await this.#explorer.forgetCachedVersions();
                const firstRequest = this.#explorer.requestedUrls.length;
                try {
                    await this.#explorer.holdRequestsDuring('https://data.jsdelivr.com/**', async versions => {
                        await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                        await versions.requested();
                        // A tab opened while the versions are loading: it must not stay open, empty.
                        await this.#explorer.startOpeningTab('fields-tab');
                        await versions.release(503);
                    });
                    await this.#explorer.waitForVersions();
                    // Past the 15 s at which other errors hide (a real wait: Playwright's clock would stay installed
                    // for the scenarios that follow).
                    await this.#explorer.waitFor(16000);
                    assert.match(await this.#explorer.apiStatus(), /^Error fetching the list of SDK versions\. Reload the page to try again\./);
                    const controls = ['#base-version-chip', '#target-version-chip', '#compare-versions', '#choose-versions'];
                    assert.deepEqual(await Promise.all(controls.map(control => this.#explorer.isEnabled(control))), [false, false, false, false]);
                    assert.deepEqual(await this.#explorer.enabledTabButtons(), ['home-tab']);
                    assert.equal(await this.#explorer.activeTab(), 'home-tab');
                    assert.equal(await this.#explorer.isKeyboardFocusable('#home-tab'), true);
                    // The disabled tabs look disabled: gray-30 (#c2c2c2), which Home is not.
                    assert.equal(await this.#explorer.textColor('#fields-tab'), 'rgb(194, 194, 194)');
                    assert.notEqual(await this.#explorer.textColor('#home-tab'), 'rgb(194, 194, 194)');
                    const sdkRequests = this.#explorer.requestedUrls.slice(firstRequest)
                        .filter(url => url.includes('/eForms-SDK//') || url.endsWith('/rules.efx') || url.endsWith('/fields.json'));
                    assert.deepEqual(sdkRequests, []);
                } finally {
                    // The version list back, for the checks that follow, failed or not (this also forgets the console
                    // error that the explorer logs for the failure).
                    await this.#explorer.open('?version=1.15.1&base=1.14.2');
                }
            }],
            ['when the version list is empty, start-up stops with the versions error and "Reload the page to try again.", and that reload downloads the list again and starts with the pair asked for', async () => {
                // 1.15.1 / 1.14.2 is not the default pair: after the reload, it shows that the address kept it.
                await this.#explorer.forgetCachedVersions();
                let firstReloadRequest;
                try {
                    await this.#explorer.answerJsonDuring('https://data.jsdelivr.com/**', { versions: [] }, async () => {
                        await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                        await this.#explorer.waitForVersions();
                    });
                    const toast = await this.#explorer.apiStatus();
                    assert.match(toast, /^Error fetching the list of SDK versions: the list of versions is empty\. Reload the page to try again\./);
                    assert.doesNotMatch(toast, /Cannot read properties/);
                    assert.match(this.#explorer.address(), /\?version=1\.15\.1&base=1\.14\.2$/);
                    // The reload the toast asks for, with the list back: the browser's, of the address as it is.
                    firstReloadRequest = this.#explorer.requestedUrls.length;
                    await this.#explorer.reload();
                } finally {
                    // The page restored for the checks that follow, if the check failed before the reload.
                    if (firstReloadRequest === undefined) {
                        await this.#explorer.open('?version=1.15.1&base=1.14.2');
                    }
                }
                assert.ok(this.#explorer.requestedUrls.slice(firstReloadRequest).some(url => url.startsWith('https://data.jsdelivr.com/')), 'the reload did not download the list of versions');
                assert.deepEqual([await this.#explorer.mainVersion(), await this.#explorer.baseVersion()], ['1.15.1', '1.14.2']);
                assert.deepEqual([await this.#explorer.isEnabled('#base-version-chip'), await this.#explorer.isEnabled('#target-version-chip')], [true, true]);
            }],
            ['when the version list holds no usable version, start-up stops after reading the pair asked for: the address keeps it, and the reload starts with it', async () => {
                // A list that is not empty but holds no version fails once the pair has been read from the address
                // (an empty one fails before): the address must still hold it for the reload.
                await this.#explorer.forgetCachedVersions();
                let firstReloadRequest;
                try {
                    await this.#explorer.answerJsonDuring('https://data.jsdelivr.com/**', { versions: ['not-a-version'] }, async () => {
                        await this.#explorer.startOpening('?version=1.15.1&base=1.14.2');
                        await this.#explorer.waitForVersions();
                    });
                    assert.match(await this.#explorer.apiStatus(), /Reload the page to try again\./);
                    assert.match(this.#explorer.address(), /\?version=1\.15\.1&base=1\.14\.2$/);
                    firstReloadRequest = this.#explorer.requestedUrls.length;
                    await this.#explorer.reload();
                } finally {
                    // The page restored for the checks that follow, if the check failed before the reload.
                    if (firstReloadRequest === undefined) {
                        await this.#explorer.open('?version=1.15.1&base=1.14.2');
                    }
                }
                assert.ok(this.#explorer.requestedUrls.slice(firstReloadRequest).some(url => url.startsWith('https://data.jsdelivr.com/')), 'the reload did not download the list of versions');
                assert.deepEqual([await this.#explorer.mainVersion(), await this.#explorer.baseVersion()], ['1.15.1', '1.14.2']);
            }],
            ['an empty list of versions kept by an earlier build is not used: the list is downloaded, and the requested pair is selected without an error', async () => {
                await this.#explorer.storeVersions([]);
                const firstRequest = this.#explorer.requestedUrls.length;
                // open() fails the check if the explorer reports an error.
                await this.#explorer.open('?version=1.14.1&base=1.12.0');
                assert.ok(this.#explorer.requestedUrls.slice(firstRequest).some(url => url.startsWith('https://data.jsdelivr.com/')), 'the list of versions was not downloaded');
                assert.deepEqual([await this.#explorer.mainVersion(), await this.#explorer.baseVersion()], ['1.14.1', '1.12.0']);
            }],
        ]);
    }

    /**
     * A version change whose tab probe fails (a 500 for the target's rules.efx, a version this page has not probed):
     * no tab is rendered for a pair whose tabs are not known, and the next request to render one probes again.
     */
    async #checkFailedProbe() {
        const requestsSince = (first, suffix) => this.#explorer.requestedUrls.slice(first).filter(url => url.endsWith(suffix));
        const rulesOf = version => `/${version}/validation/rules.efx`;
        await this.#scenario('?version=1.15.1&base=1.14.2', [
            ['when the dialog\'s tab probe fails before the dialog has closed, Fields shows no tree, the toast names rules.efx, and the next tab probes again and renders', async () => {
                await this.#explorer.openTab('home-tab');
                const firstRequest = this.#explorer.requestedUrls.length;
                await this.#explorer.failRequestsDuring(`**${rulesOf('2.0.0-alpha.4')}`, async () => {
                    await this.#explorer.startComparingInDialog('2.0.0-alpha.4', '1.14.2');
                    await this.#explorer.waitUntilIdle();
                    assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                    // The probe failed before Fields was activated: activating it probed again (and failed again).
                    assert.equal(requestsSince(firstRequest, rulesOf('2.0.0-alpha.4')).length, 2);
                    assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                    // Shown, not only written into the toast: the activation cleared the toast just before the second
                    // probe failed, and that clearing must not hide the new error.
                    assert.match(await this.#explorer.apiStatus(), /rules\.efx for SDK 2\.0\.0-alpha\.4/);
                    assert.deepEqual(requestsSince(firstRequest, '/fields/fields.json'), []);
                });
                await this.#explorer.openTab('notice-types-tab');
                assert.equal(requestsSince(firstRequest, rulesOf('2.0.0-alpha.4')).length, 3);
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
                assert.ok((await this.#explorer.indexCards('notice-types-overview-card-group')).length > 0, 'Notice types has no cards');
                assert.equal(await this.#explorer.reportedErrors(), '');
            }],
            ['when the dialog\'s tab probe fails after Fields has been activated, Fields shows no tree, the toast names rules.efx, and the next tab probes again and renders', async () => {
                await this.#explorer.openTab('home-tab');
                const firstRequest = this.#explorer.requestedUrls.length;
                await this.#explorer.holdRequestsDuring(`**${rulesOf('2.0.0-alpha.3')}`, async probe => {
                    await this.#explorer.startWaitingForTabShown('fields-tab');
                    await this.#explorer.startComparingInDialog('2.0.0-alpha.3', '1.14.2');
                    await probe.requested();
                    await this.#explorer.tabShown();
                    await probe.release(500);
                });
                await this.#explorer.waitUntilIdle();
                assert.equal(await this.#explorer.activeTab(), 'fields-tab');
                assert.equal(requestsSince(firstRequest, rulesOf('2.0.0-alpha.3')).length, 1);
                assert.equal(await this.#explorer.hasTree('fields-explorer'), false);
                assert.match(await this.#explorer.apiStatus(), /rules\.efx for SDK 2\.0\.0-alpha\.3/);
                assert.deepEqual(requestsSince(firstRequest, '/fields/fields.json'), []);
                await this.#explorer.openTab('notice-types-tab');
                assert.equal(requestsSince(firstRequest, rulesOf('2.0.0-alpha.3')).length, 2);
                await this.#assertTabsShown({ 'validation-tab': true, 'schematrons-tab': false });
                assert.ok((await this.#explorer.indexCards('notice-types-overview-card-group')).length > 0, 'Notice types has no cards');
                assert.equal(await this.#explorer.reportedErrors(), '');
            }],
            ['fwd/ chosen in Fields while the tab probe of a new base is held loads nothing until the probe ends, then fwd/ once for each version of the new pair', async () => {
                await this.#explorer.openTab('fields-tab');
                const firstRequest = await this.#explorer.holdRequestsDuring(`**${rulesOf('1.13.0')}`, async probe => {
                    await this.#explorer.startSelectingVersion('base', '1.13.0');
                    await probe.requested();
                    const first = this.#explorer.requestedUrls.length;
                    await this.#explorer.startSelectingFieldsSource('fwd');
                    await this.#explorer.waitFor(1000);
                    assert.deepEqual(requestsSince(first, '/fields/fwd/nodes.json'), []);
                    await probe.release();
                    return first;
                });
                await this.#explorer.waitUntilIdle();
                const fwdVersions = requestsSince(firstRequest, '/fields/fwd/nodes.json').map(url => url.split('/').at(-4));
                assert.deepEqual(fwdVersions.sort(), ['1.13.0', '2.0.0-alpha.3']);
                assert.equal(await this.#explorer.shownText('#fields-source-alert'), 'SDK 1.13.0 has no forward-compatible metadata (fields/fwd/).');
                assert.equal(await this.#explorer.hasTree('fields-explorer'), true);
            }],
            ['after several errors at once, the toast cleared, and a newer error 5 s later, the newer one stays shown for its own 15 s', async () => {
                // Playwright's clock makes the 15 s pass at once; it stays installed: this check comes last in the run.
                await this.#explorer.installClock();
                await this.#explorer.reportErrors(['The first error', 'The second error', 'The third error']);
                await this.#explorer.runClock(100);
                await this.#explorer.clearErrors();
                await this.#explorer.runClock(5000);
                await this.#explorer.reportErrors(['The newer error']);
                // Past the earlier errors' 15 s, before the newer one's.
                await this.#explorer.runClock(10500);
                assert.equal(await this.#explorer.apiStatus(), 'The newer error');
                // Past the newer one's 15 s.
                await this.#explorer.runClock(5000);
                assert.equal(await this.#explorer.apiStatus(), '');
            }],
        ]);
    }

    async #checkFiltersWhileLoading() {
        await this.#scenario('?version=1.16.0&base=1.15.1', [
            ['the Codelists parent filter applies while the codelists are still being checked ("country": only its 5 codelists)', async () => {
                await this.#explorer.startOpeningTab('codelists-tab');
                await this.#explorer.waitForFilterValue('code-lists-overview-card-group', 'country');
                await this.#explorer.clickFilterValue('code-lists-overview-card-group', 'country');
                const whileLoading = await this.#explorer.cardStates('code-lists-overview-card-group');
                assert.ok(whileLoading.some(card => !card.status), 'the codelists were already checked');
                assert.deepEqual(whileLoading.filter(card => card.visible && card.subtitle !== 'country').map(card => card.title), []);
                await this.#explorer.waitUntilIdle();
                const visible = (await this.#explorer.cardStates('code-lists-overview-card-group')).filter(card => card.visible);
                assert.equal(visible.length, 5, `visible: ${visible.map(card => card.title).join(', ')}`);
                assert.ok(visible.every(card => card.subtitle === 'country'));
            }],
            ['the Codelists status filter applies while the codelists are still being checked ("modified": no pending codelist, then the 11 modified)', async () => {
                await this.#explorer.openTab('home-tab');
                await this.#explorer.startOpeningTab('codelists-tab');
                await this.#explorer.waitForCards('code-lists-overview-card-group', 100);
                await this.#explorer.selectStatusFilter('code-lists-overview-card-group', 'modified');
                const whileLoading = await this.#explorer.cardStates('code-lists-overview-card-group');
                assert.ok(whileLoading.some(card => !card.status), 'the codelists were already checked');
                assert.deepEqual(whileLoading.filter(card => card.visible && card.status !== 'modified').map(card => card.title), []);
                await this.#explorer.waitUntilIdle();
                const visible = (await this.#explorer.cardStates('code-lists-overview-card-group')).filter(card => card.visible);
                assert.equal(visible.length, 11, `visible: ${visible.map(card => card.title).join(', ')}`);
                assert.ok(visible.every(card => card.status === 'modified'));
            }],
        ]);
    }

    /** A pair on both sides of 1.12.0, which renamed the files of the tailored codelists. */
    async #checkCodelistsAcrossRenames() {
        await this.#scenario('?version=2.0.0-alpha.4&base=1.9.0', [
            ['the Codelists tab compares each version\'s own file (exclusion-ground: criterion_exclusion-ground.gc in 1.9.0), without errors', async () => {
                await this.#explorer.openTab('codelists-tab');
                assert.equal(await this.#explorer.reportedErrors(), '');
                const cards = await this.#explorer.indexCards('code-lists-overview-card-group');
                assert.deepEqual(cards.filter(card => !card.status).map(card => card.title), []);
                const renamed = cards.find(card => card.title === 'exclusion-ground');
                assert.ok(renamed, 'exclusion-ground is missing');
                assert.ok(['unchanged', 'modified'].includes(renamed.status), `exclusion-ground is ${renamed.status}`);
            }],
        ]);
    }

    /** A base whose fields/fwd/ folder lacks the business entity files. */
    async #checkPairWithPartialForwardCompatibleMetadata() {
        await this.#scenario('?version=2.0.0-alpha.3&base=2.0.0-alpha.2', [
            ['the Fields tab in fwd/ mode names the files 2.0.0-alpha.2 lacks, shows its business entities as added and compares its data types', async () => {
                await this.#explorer.openTab('fields-tab');
                await this.#explorer.selectFieldsSource('fwd');
                assert.equal(await this.#explorer.reportedErrors(), '');
                assert.equal(await this.#explorer.shownText('#fields-source-alert'),
                    'SDK 2.0.0-alpha.2 has no fields/fwd/business-entity-hierarchy.json, business-entity-properties.json.');
                const nodes = await this.#explorer.treeNodes('fields-explorer');
                const businessEntities = nodes.filter(node => /^bep?:/.test(node.id));
                assert.ok(businessEntities.length > 0, 'no business entities');
                assert.deepEqual(businessEntities.filter(node => node.status !== 'added'), []);
                const dataTypes = nodes.filter(node => node.id.startsWith('dt:'));
                assert.equal(dataTypes.length, 19, 'data types');
                assert.deepEqual(dataTypes.filter(node => ['added', 'removed'].includes(node.status)), []);
            }],
        ]);
    }

    /**
     * Opens the explorer once and runs the given checks on it, followed by checks for console errors, for requests
     * to the parts of the GitHub API that the explorer must not use (they spend the rate limit) and for stylesheets
     * other than the page's.
     *
     * @param {string} queryString
     * @param {Array<[string, () => Promise<void>]>} checks Pairs of description and check.
     */
    async #scenario(queryString, checks) {
        console.log(`\n${queryString}`);
        const firstRequest = this.#explorer.githubApiRequests.length;
        const firstStylesheet = this.#explorer.stylesheetRequests.length;
        try {
            await this.#explorer.open(queryString);
        } catch (error) {
            this.#report(`the explorer opens with ${queryString}`, error);
            return;
        }
        for (const [description, check] of checks) {
            await this.#check(description, check);
        }
        await this.#check('no console errors', async () => assert.deepEqual(this.#explorer.consoleErrors, []));
        await this.#check('no request to the GitHub tags or contents API', async () => {
            const requests = this.#explorer.githubApiRequests.slice(firstRequest);
            assert.deepEqual(requests.filter(url => /\/repos\/[^/]+\/[^/]+\/(tags|contents)([/?]|$)/.test(url)), []);
        });
        await this.#check('the web components load only the stylesheets the page loads', async () => {
            const pageStylesheets = await this.#explorer.pageStylesheets();
            const others = this.#explorer.stylesheetRequests.slice(firstStylesheet).filter(url => !pageStylesheets.includes(url));
            assert.deepEqual([...new Set(others)], []);
        });
    }

    /**
     * @param {() => Promise<void>} action
     * @returns {Promise<number>} The number of GitHub git trees requests made during the action.
     */
    async #treesRequestsDuring(action) {
        const before = this.#explorer.githubApiRequests.length;
        await action();
        return this.#explorer.githubApiRequests.slice(before).filter(url => url.includes('/git/trees/')).length;
    }

    /**
     * @param {string} description
     * @param {() => Promise<void>} check
     */
    async #check(description, check) {
        try {
            await check();
            this.#report(description, null);
        } catch (error) {
            this.#report(description, error);
        }
    }

    /**
     * @param {string} description
     * @param {Error|null} error null if the check passed.
     */
    #report(description, error) {
        if (error === null) {
            this.#passed++;
            console.log(`  PASS  ${description}`);
        } else {
            this.#failed++;
            console.log(`  FAIL  ${description}\n        ${error.message.split('\n').join('\n        ')}`);
        }
    }

    /**
     * Opens the View Templates tab and asserts that exactly one card has the given title, with the given status.
     *
     * @param {string} title
     * @param {string} status
     */
    async #assertViewTemplateStatus(title, status) {
        await this.#explorer.openTab('view-templates-tab');
        const cards = (await this.#explorer.indexCards('view-templates-overview-card-group')).filter(card => card.title === title);
        assert.equal(cards.length, 1, `${cards.length} cards titled ${title}`);
        assert.equal(cards[0].status, status);
    }

    /**
     * Asserts that the Fields tab shows the tree of fields.json (one root, ND-Root) and no alert.
     */
    async #assertFieldsJsonTree() {
        assert.equal(await this.#explorer.shownText('#fields-source-alert'), null);
        const nodes = await this.#explorer.treeNodes('fields-explorer');
        assert.deepEqual(nodes.filter(node => node.parent === '#').map(node => node.id), ['ND-Root']);
        assert.ok(nodes.length > 1, 'the tree has no fields');
    }

    /**
     * @param {Object<string, boolean>} expected Whether each tab, by the id of its button, is expected to be shown.
     */
    async #assertTabsShown(expected) {
        for (const [tabId, shown] of Object.entries(expected)) {
            assert.equal(await this.#explorer.isTabShown(tabId), shown, `${tabId} is ${shown ? 'hidden' : 'shown'}`);
        }
    }

    /**
     * Asserts that each of the expected runs of versions appears in the dropdown as consecutive options, the runs in
     * the expected order. Other versions may appear before, between and after the runs.
     *
     * @param {string[]} options The options of a version dropdown.
     */
    static #assertVersionOrder(options) {
        let endOfPreviousRun = -1;
        SmokeTest.#EXPECTED_VERSION_RUNS.forEach(run => {
            const start = options.indexOf(run[0]);
            assert.ok(start > endOfPreviousRun, `${run[0]} is missing or out of order: ${options.join(', ')}`);
            assert.deepEqual(options.slice(start, start + run.length), run);
            endOfPreviousRun = start + run.length - 1;
        });
    }

    /**
     * @param {string} version
     * @returns {boolean} Whether the version is a release (not a pre-release and not a branch).
     */
    static #isRelease(version) {
        return /^\d+\.\d+\.\d+$/.test(version);
    }
}

const server = new ExplorerServer(fileURLToPath(new URL('..', import.meta.url)));
const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM_EXECUTABLE_PATH });
try {
    const baseUrl = await server.start();
    const context = await browser.newContext();
    const page = await context.newPage();
    // Every load fetches the SDK files as a first visit does (as in a context with request interception, where
    // Playwright disables the HTTP cache), so that the checks made while a tab is still loading find it loading.
    await (await context.newCDPSession(page)).send('Network.setCacheDisabled', { cacheDisabled: true });
    const failed = await new SmokeTest(new ExplorerPage(page, baseUrl)).run();
    process.exitCode = failed === 0 ? 0 : 1;
} finally {
    await browser.close();
    server.stop();
}
