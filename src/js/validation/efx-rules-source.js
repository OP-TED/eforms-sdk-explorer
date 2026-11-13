/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appConfig } from "../config.js";
import { Diff, DiffEntry } from "../diff.js";
import { TabController } from "../tabs/tab-controller.js";
import { PropertyCard } from "../components/property-card.js";
import { IndexCard } from "../components/index-card.js";
import { AjaxError } from "../custom-error.js";
import { ERROR_FETCHING_FILE } from "../error-messages.js";

/**
 * The validation folder of the SDK as a source of validation files: the EFX rules and their dependencies.
 * The folder has no index file, so the index is built by fetching each of the files listed in appConfig.validationFiles.
 * A file that a version does not have is absent from its index; a version without the folder has an empty index.
 * The index items carry the text of their file, so that their status can be decided without fetching them again.
 */
export class EfxRulesSource {

    /** Matches the stage headers of an EFX rules file, for example `--- STAGE 2a ---`. */
    static #STAGE_HEADER = /^\s*---\s*STAGE\s+(\S+)\s*---\s*$/gm;

    /** Matches the include directives of an EFX rules file, for example `#include "stage-1a.efx"`. */
    static #INCLUDE_DIRECTIVE = /^\s*#include\s+"([^"]+)"\s*$/gm;

    /** Matches the lines that are EFX comments. */
    static #COMMENT_LINE = /^\/\/.*$/gm;

    /** @type {TabController} */
    #tab;

    /**
     * @param {TabController} tab The tab that owns the source. The requests of the source go through this tab, and
     * the index cards call its fetchAndRenderDiffView(filename) method.
     */
    constructor(tab) {
        this.#tab = tab;
    }

    /**
     * @returns {null} The index cards are not filtered by any property.
     */
    get filterProperty() {
        return null;
    }

    /**
     * Fetches the index of the validation files of the specified SDK version.
     *
     * @param {string} sdkVersion
     * @returns {Promise<Object[]>} One item per file present in the version: filename, size, stages, includes and text.
     */
    async fetchIndex(sdkVersion) {
        const items = await Promise.all(appConfig.validationFiles.map(filename => this.#fetchIndexItem(filename, sdkVersion)));
        return items.filter(item => item !== null);
    }

    /**
     * @param {string} filename The filename of an index item.
     * @param {string} sdkVersion
     * @returns {string}
     */
    fileUrl(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/validation/${filename}`;
    }

    /**
     * EFX comment lines are ignored when comparing EFX rules files; JSON files are compared as they are.
     *
     * @param {string} text
     * @param {string} filename
     * @returns {string}
     */
    normaliseForComparison(text, filename) {
        return EfxRulesSource.#isJson(filename) ? text : text.replace(EfxRulesSource.#COMMENT_LINE, '');
    }

    /**
     * Fetches one file of the validation folder and describes it as an index item.
     *
     * @param {string} filename
     * @param {string} sdkVersion
     * @returns {Promise<Object|null>} null if the version does not have the file.
     */
    async #fetchIndexItem(filename, sdkVersion) {
        let text;
        try {
            text = await this.#tab.ajaxRequest({ url: this.fileUrl(filename, sdkVersion), dataType: 'text' });
        } catch (error) {
            if (error.status === 404) {
                return null;
            }
            throw new AjaxError(ERROR_FETCHING_FILE(filename, sdkVersion), error);
        }

        const item = { filename: filename };
        const stages = Array.from(text.matchAll(EfxRulesSource.#STAGE_HEADER), match => match[1]);
        if (stages.length > 0) {
            item.stages = stages.join(', ');
        }
        const includes = Array.from(text.matchAll(EfxRulesSource.#INCLUDE_DIRECTIVE), match => match[1]);
        if (includes.length > 0) {
            item.includes = includes.join(', ');
        }
        item.size = EfxRulesSource.#formatSize(new TextEncoder().encode(text).length);
        item.text = text;
        return item;
    }

    /**
     * Creates an index-card for the specified validation file.
     * The status of the card is the type of change of the entry: the files are not checked again in the background.
     *
     * @param {DiffEntry} diffEntry
     * @returns {IndexCard}
     */
    createIndexCard(diffEntry) {
        const filename = diffEntry.get('filename');
        const component = IndexCard.create(filename, EfxRulesSource.#isJson(filename) ? 'JSON' : 'EFX rules', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler(async (e) => {
            await this.#tab.fetchAndRenderDiffView(filename);
        });

        for (const [key, value] of Object.entries(diffEntry.getItem())) {
            const mainValue = diffEntry?.mainItem ? diffEntry?.mainItem[key] ?? undefined : undefined;
            const baseValue = diffEntry?.baseItem ? diffEntry?.baseItem[key] ?? undefined : undefined;

            const card = PropertyCard.create(key, mainValue, baseValue, diffEntry.typeOfChange);
            component.appendProperty(card);
        }

        // Handle removed properties (the ones in baseItem that do not exit in mainItem).
        if (diffEntry.mainItem) {
            for (const propertyName in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName], Diff.TypeOfChange.REMOVED);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }

    /**
     * @param {string} filename
     * @returns {boolean}
     */
    static #isJson(filename) {
        return filename.endsWith('.json');
    }

    /**
     * Formats a file size for display, for example `491 B`, `3.5 KB` or `562 KB`.
     *
     * @param {number} bytes
     * @returns {string}
     */
    static #formatSize(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        const kilobytes = bytes / 1024;
        return kilobytes < 10 ? `${kilobytes.toFixed(1)} KB` : `${Math.round(kilobytes)} KB`;
    }
}
