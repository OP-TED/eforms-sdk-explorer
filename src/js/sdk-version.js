/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/**
 * A version of the eForms SDK, as named by a tag of the SDK repository: `major.minor.patch`, optionally followed by
 * a pre-release suffix `-alpha.n`, `-beta.n` or `-rc.n`.
 *
 * Branch names are not versions: use {@link SdkVersion.tryParse} to tell them apart.
 */
export class SdkVersion {

    /** Matches `major.minor.patch[-prerelease.n]`. */
    static #PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/;

    /** Pre-release labels in order of precedence. A release (no label) takes precedence over all of them. */
    static #PRE_RELEASE_LABELS = Object.freeze(['alpha', 'beta', 'rc']);

    /** @type {number} */
    #major;

    /** @type {number} */
    #minor;

    /** @type {number} */
    #patch;

    /** @type {string|null} One of the pre-release labels, or null for a release. */
    #preReleaseLabel;

    /** @type {number|null} The number that follows the pre-release label, or null for a release. */
    #preReleaseNumber;

    /**
     * Use {@link SdkVersion.tryParse} to create instances.
     *
     * @param {number} major
     * @param {number} minor
     * @param {number} patch
     * @param {string|null} preReleaseLabel
     * @param {number|null} preReleaseNumber
     */
    constructor(major, minor, patch, preReleaseLabel = null, preReleaseNumber = null) {
        this.#major = major;
        this.#minor = minor;
        this.#patch = patch;
        this.#preReleaseLabel = preReleaseLabel;
        this.#preReleaseNumber = preReleaseNumber;
    }

    /**
     * Parses the name of a tag of the SDK repository.
     *
     * @param {string} text
     * @returns {SdkVersion|null} The parsed version, or null if the text is not a version (for example a branch name).
     */
    static tryParse(text) {
        const match = SdkVersion.#PATTERN.exec(text);
        if (match === null) {
            return null;
        }
        const [, major, minor, patch, preReleaseLabel, preReleaseNumber] = match;
        return new SdkVersion(
            Number(major),
            Number(minor),
            Number(patch),
            preReleaseLabel ?? null,
            preReleaseNumber === undefined ? null : Number(preReleaseNumber));
    }

    /** @returns {number} */
    get major() {
        return this.#major;
    }

    /** @returns {number} */
    get minor() {
        return this.#minor;
    }

    /** @returns {number} */
    get patch() {
        return this.#patch;
    }

    /** @returns {boolean} */
    get isPreRelease() {
        return this.#preReleaseLabel !== null;
    }

    /**
     * Compares this version with another one: first the numeric parts, then the pre-release precedence
     * (alpha < beta < rc < release), then the pre-release number.
     *
     * @param {SdkVersion} other
     * @returns {number} A negative number if this version precedes the other, a positive number if it follows it, 0 if they are equal.
     */
    compare(other) {
        return this.#major - other.#major
            || this.#minor - other.#minor
            || this.#patch - other.#patch
            || this.#preReleasePrecedence() - other.#preReleasePrecedence()
            || (this.#preReleaseNumber ?? 0) - (other.#preReleaseNumber ?? 0);
    }

    /**
     * Tells whether this version is a pre-release of the given release (for example 1.16.0-rc.5 of 1.16.0).
     *
     * @param {SdkVersion} release
     * @returns {boolean}
     */
    isPreReleaseOf(release) {
        return this.isPreRelease
            && !release.isPreRelease
            && this.#major === release.#major
            && this.#minor === release.#minor
            && this.#patch === release.#patch;
    }

    /** @returns {string} The version as it is named by its tag. */
    toString() {
        const release = `${this.#major}.${this.#minor}.${this.#patch}`;
        return this.isPreRelease ? `${release}-${this.#preReleaseLabel}.${this.#preReleaseNumber}` : release;
    }

    /**
     * @returns {number} The position of the pre-release label in the order of precedence; releases come after all labels.
     */
    #preReleasePrecedence() {
        return this.isPreRelease ? SdkVersion.#PRE_RELEASE_LABELS.indexOf(this.#preReleaseLabel) : SdkVersion.#PRE_RELEASE_LABELS.length;
    }
}
