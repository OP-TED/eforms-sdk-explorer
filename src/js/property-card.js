import { BootstrapWebComponent } from './bootstrap-web-component.js';

export class PropertyCard extends BootstrapWebComponent {

    static get observedAttributes() {
        return ['property-name', 'new-property-value', 'old-property-value'];
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
            case 'new-property-value': this.newPropertyValue = newValue; break;
            case 'old-property-value': this.oldPropertyValue = newValue; break;
        }

        if (this.isConnected) {
            this.render();
        }
    }

    render() {
        super.render();

        this.shadowRoot.querySelector('#property-name').textContent = this.propertyName; // Show the name
        this.shadowRoot.querySelector('#new-property-value').innerHTML = this.newPropertyValue; // Show the new value
        this.shadowRoot.querySelector('#old-property-value').innerHTML = this.oldPropertyValue; // Show the old value

        if (this.oldPropertyValue === undefined) {
            this.shadowRoot.querySelector('#list-item').classList.add('added-property');
            this.shadowRoot.querySelector('#old-property-value').style.display = 'none';
        } else if (this.newPropertyValue === undefined) {
            this.shadowRoot.querySelector('#list-item').classList.add('removed-property');
            this.shadowRoot.querySelector('#new-property-value').style.display = 'none';
        } else if (this.newPropertyValue !== this.oldPropertyValue) {
            this.shadowRoot.querySelector('#list-item').classList.add('changed-property');
            this.shadowRoot.querySelector('#new-property-value').classList.add('new-property-value');
            this.shadowRoot.querySelector('#old-property-value').classList.add('old-property-value');
        } else {
            this.shadowRoot.querySelector('#old-property-value').style.display = 'none';
        }    
    }

    static create(propertyName, currentValue, previousValue) {

        const $component = $('<property-card/>');
        $component.attr('property-name', propertyName + ': ');
        $component.attr('new-property-value', PropertyCard.#formatPropertyValue(currentValue));
        $component.attr('old-property-value', PropertyCard.#formatPropertyValue(previousValue));
    
        return $component;
    }

    static #formatPropertyValue(value) {
        if (_.isObject(value) || Array.isArray(value)) {
            return _.isObject(value) ? JSON.stringify(value, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;') : value;
        }
        return value;
    }
}

customElements.define('property-card', PropertyCard);