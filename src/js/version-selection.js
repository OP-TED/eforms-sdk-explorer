/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appConfig } from "./config.js";
import { appState } from "./state.js";
import { SdkVersion } from "./sdk-version.js";
import { CustomError } from "./custom-error.js";
import { ERROR_FETCHING_VERSIONS } from "./error-messages.js";

/** @typedef {import('./sdk-repository.js').SdkRepository} SdkRepository */

/**
 * The versions the explorer offers, and the pair it compares first.
 *
 * It lists the versions of the SDK, fills the two hidden version selects with them (the target select also with the
 * configured branches), and selects the pair asked for in the address, or else the default pair. The selects then
 * hold the selection for the version picker, and {@link appState} for the tabs.
 */
export class VersionSelection {

    /** @type {SdkRepository} */
    #repository;

    /**
     * @param {SdkRepository} repository Where the versions are listed.
     */
    constructor(repository) {
        this.#repository = repository;
    }

    /**
     * Lists the versions, fills the selects and selects the pair. The address loses its query string only once the
     * pair is selected, so that a start-up that fails before keeps it for the reload that the error asks for.
     *
     * @returns {Promise<void>} Rejects if the versions could not be listed, or hold no release of appConfig.thresholdVersion
     *          or later, so that no pair can be selected from them.
     */
    async select() {
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
        if (latestRelease === undefined) {
            // Without a release, there is no default target version, and no release to group the pre-releases under.
            throw new CustomError(`${ERROR_FETCHING_VERSIONS}: the list has no release of version ${appConfig.thresholdVersion} or later`);
        }
        const preReleasesOfLatestRelease = recentVersions.filter(version => version.isPreReleaseOf(latestRelease));
        const preReleasesOfUnreleasedVersions = recentVersions.filter(version =>
            version.isPreRelease && !recentReleases.some(release => version.isPreReleaseOf(release)));

        // Sort versions by version number, latest first
        const listedVersions = [...recentReleases, ...preReleasesOfLatestRelease, ...preReleasesOfUnreleasedVersions]
            .sort((a, b) => b.compare(a))
            .map(version => version.toString());

        // Populate the selects
        this.#$targetSelect().empty();
        this.#$baseSelect().empty();

        // The configured branches come first in the target select, so that any version can be compared with them.
        appConfig.branches.forEach(branch => {
            this.#$targetSelect().append($('<option>', { value: branch, text: branch }));
        });

        listedVersions.forEach(version => {
            const option = $('<option>', { value: version, text: version });
            this.#$targetSelect().append(option.clone());
            this.#$baseSelect().append(option);
        });

        let [mainVersion, baseVersion] = VersionSelection.#requestedPair();

        // Validate the versions asked for in the address. Branches are accepted only as the target.
        if (!appConfig.branches.includes(mainVersion) && !listedVersions.includes(mainVersion)) {
            if (availableVersionNames.includes(mainVersion)) {
                const option = $('<option>', { value: mainVersion, text: mainVersion });
                this.#$targetSelect().append(option);
            } else {
                mainVersion = latestRelease.toString();
            }
        }
        if (!listedVersions.includes(baseVersion)) {
            if (availableVersionNames.includes(baseVersion)) {
                const option = $('<option>', { value: baseVersion, text: baseVersion });
                this.#$baseSelect().append(option);
            } else {
                baseVersion = VersionSelection.#defaultBaseFor(mainVersion, releases)?.toString() ?? mainVersion;
                if (!listedVersions.includes(baseVersion)) {
                    const option = $('<option>', { value: baseVersion, text: baseVersion });
                    this.#$baseSelect().append(option);
                }
            }
        }

        this.#$targetSelect().val(mainVersion);
        this.#$baseSelect().val(baseVersion);
        appState.mainVersion = mainVersion;
        appState.baseVersion = baseVersion;

        if (window.location.search) {
            history.replaceState(null, null, window.location.pathname);
        }
    }

    /**
     * Forgets the list of versions kept in the browser, so that the next attempt, a reload, downloads it again,
     * whatever made the selection fail.
     */
    forget() {
        this.#repository.forgetVersions();
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
    static #defaultBaseFor(target, releases) {
        if (appConfig.branches.includes(target)) {
            return releases[0];
        }
        const targetVersion = SdkVersion.tryParse(target);
        return releases.find(release => release.major === targetVersion.major && release.minor < targetVersion.minor)
            ?? releases.find(release => release.compare(targetVersion) < 0);
    }

    /**
     * @returns {(string|null)[]} The target and base versions asked for in the address's query string, if any.
     */
    static #requestedPair() {
        const params = new URLSearchParams(window.location.search);
        return [params.get('version'), params.get('base')];
    }

    #$targetSelect() {
        return $('#main-version-dropdown');
    }

    #$baseSelect() {
        return $('#base-version-dropdown');
    }
}
