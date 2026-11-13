/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/**
 * The error toast at the bottom right of the page (`#apiStatus`). It lists the errors reported since it was last
 * cleared, each with its detail on a line of its own, and hides itself 15 s after the last one, unless that one
 * stays shown. Messages and details are plain text: they are inserted as text, never as HTML.
 */
export class ErrorToast {

    /** How long the toast stays shown after its last message, in milliseconds. */
    static #HIDE_DELAY = 15000;

    /** @type {boolean} Whether the messages shown have expired (the toast hid itself), so that the next message replaces them. */
    #expired = false;

    /** @type {number|null} The timeout that hides the toast, 15 s after its last message. */
    #hideTimeout = null;

    /**
     * Shows a message in the toast, after the ones shown since it was last cleared.
     *
     * @param {string} message
     * @param {string} [detail] For example why a request failed (see CustomError.detail).
     * @param {boolean} [staysShown] Whether the toast stays shown until the user closes it, instead of hiding itself
     *          15 s later: for an error that leaves nothing else to do (start-up without versions).
     */
    show(message, detail = '', staysShown = false) {
        if (this.#expired) {
            this.#body().textContent = '';
            this.#expired = false;
        }

        const item = document.createElement('li');
        item.append(document.createTextNode(message));
        if (detail) {
            const detailElement = document.createElement('span');
            detailElement.className = 'detail';
            detailElement.textContent = detail;
            item.append(detailElement);
        }
        this.#body().append(item);

        // Show the toast and hide it 15 s after this message (unless it stays shown), replacing the timeout of the
        // previous one: at once, so that there is only ever one timeout, which clear() stops, and a clearing just
        // after a message cannot be followed by an empty toast shown late. (The toast has no fade to wait for.)
        this.#$toast().toast('show');
        clearTimeout(this.#hideTimeout);
        this.#hideTimeout = staysShown ? null : setTimeout(() => {
            this.#$toast().toast('hide');
            this.#expired = true;
        }, ErrorToast.#HIDE_DELAY);
    }

    /**
     * Removes the messages shown so far, stops the timeout that would hide the toast later, and hides it.
     */
    clear() {
        this.#expired = false;
        clearTimeout(this.#hideTimeout);
        this.#body().textContent = '';
        this.#$toast().toast('hide');
    }

    #$toast() {
        return $('#apiStatus');
    }

    #body() {
        return document.querySelector('#apiStatus .toast-body');
    }
}
