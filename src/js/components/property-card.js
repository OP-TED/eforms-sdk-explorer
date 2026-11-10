/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { BootstrapWebComponent } from './bootstrap-web-component.js';
import { Diff } from '../diff.js';

export class PropertyCard extends BootstrapWebComponent {

    /** The format of a property value that is HTML: the formatted JSON of an object, with its text escaped. */
    static #HTML_FORMAT = 'html';

    /** The format of a property value that is plain text, shown as it is. */
    static #TEXT_FORMAT = 'text';

    static get observedAttributes() {
        return ['property-name', 'new-property-value', 'old-property-value', 'new-property-format', 'old-property-format', 'type-of-change'];
    }

    constructor() {
        super('property-card-template');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (newValue === oldValue) {
            return;
        }
        switch (name) {
            case 'property-name': this.propertyName = newValue; break;
            case 'new-property-value': this.newPropertyValue = newValue === "undefined" ? undefined : newValue; break;
            case 'old-property-value': this.oldPropertyValue = newValue === "undefined" ? undefined : newValue; break;
            case 'new-property-format': this.newPropertyFormat = newValue; break;
            case 'old-property-format': this.oldPropertyFormat = newValue; break;
            case 'type-of-change': this.typeOfChange = newValue; break;
        }

        if (this.isConnected) {
            this.render();
        }
    }

    getPropertyName() {
        return this.propertyName;
    }

    getPropertyValue() {
        if (this.getTypeOfChange() === Diff.TypeOfChange.REMOVED) {
            return this.getOldPropertyValue();
        }
        return this.getNewPropertyValue();
    }

    getNewPropertyValue() {
        return this.newPropertyValue;
    }

    getOldPropertyValue() {
        return this.oldPropertyValue;
    }

    getTypeOfChange() {
        return this.typeOfChange;
    }

    render() {
        super.render();

        this.shadowRoot.querySelector('#property-name').textContent = this.propertyName; // Show the name
        PropertyCard.#showValue(this.shadowRoot.querySelector('#new-property-value'), this.newPropertyValue, this.newPropertyFormat); // Show the new value
        PropertyCard.#showValue(this.shadowRoot.querySelector('#old-property-value'), this.oldPropertyValue, this.oldPropertyFormat); // Show the old value

        if (this.oldPropertyValue === undefined && this.newPropertyValue !== undefined) {
            this.shadowRoot.querySelector('#list-item').classList.add('added-property');
            this.shadowRoot.querySelector('#old-property-value').style.display = 'none';
        } else if (this.newPropertyValue === undefined && this.oldPropertyValue !== undefined) {
            this.shadowRoot.querySelector('#list-item').classList.add('removed-property');
            this.shadowRoot.querySelector('#new-property-value').style.display = 'none';
        } else if (this.newPropertyValue !== this.oldPropertyValue) {
            this.shadowRoot.querySelector('#list-item').classList.add('modified-property');
            this.shadowRoot.querySelector('#new-property-value').classList.add('new-property-value');
            this.shadowRoot.querySelector('#old-property-value').classList.add('old-property-value');
        } else {
            this.shadowRoot.querySelector('#list-item').classList.add('unchanged-property');
            this.shadowRoot.querySelector('#old-property-value').style.display = 'none';

            // hide undefined properties
            if (!this.newPropertyValue && !this.oldPropertyValue) {
                this.style.display = 'none';
            }
        }
    }

    /**
     * 
     * @param {*} propertyName 
     * @param {*} currentValue 
     * @param {*} previousValue 
     * @returns {PropertyCard}
     */
    static create(propertyName, currentValue, previousValue, typeOfChange) {
        const component = document.createElement('property-card');
        component.setAttribute('property-name', propertyName);
        component.setAttribute('new-property-value', PropertyCard.#formatPropertyValue(currentValue));
        component.setAttribute('old-property-value', PropertyCard.#formatPropertyValue(previousValue));
        component.setAttribute('new-property-format', PropertyCard.#formatOf(currentValue));
        component.setAttribute('old-property-format', PropertyCard.#formatOf(previousValue));
        component.setAttribute('type-of-change', typeOfChange);
    
        return component;
    }

    /**
     * @param {*} value
     * @returns {*} For an object, its indented JSON as HTML, with the JSON text escaped; any other value as it is.
     */
    static #formatPropertyValue(value) {
        if (_.isObject(value)) {
            return PropertyCard.#escapeHtml(JSON.stringify(value, null, 2)).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
        }
        return value;
    }

    /**
     * @param {*} value
     * @returns {string} The format in which {@link #formatPropertyValue} gives the value.
     */
    static #formatOf(value) {
        return _.isObject(value) ? PropertyCard.#HTML_FORMAT : PropertyCard.#TEXT_FORMAT;
    }

    /**
     * Shows a property value in an element: HTML as HTML, and text as text, so that a value containing "<" or "&" is
     * shown as it is instead of being parsed as HTML.
     *
     * @param {HTMLElement} element
     * @param {string} value
     * @param {string} format
     */
    static #showValue(element, value, format) {
        if (format === PropertyCard.#HTML_FORMAT) {
            element.innerHTML = value;
        } else {
            element.textContent = value;
        }
    }

    /**
     * @param {string} text
     * @returns {string} The text with the characters that HTML would interpret replaced by their character references.
     */
    static #escapeHtml(text) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

customElements.define('property-card', PropertyCard);