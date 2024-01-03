import { BootstrapWebComponent } from './bootstrap-web-component.js';

export class PropertyCard extends BootstrapWebComponent {

    static get observedAttributes() {
        return ['property-name', 'new-property-value', 'old-property-value', 'node-change'];
    }

    constructor() {
        super('property-card-template');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (newValue === oldValue) {
            return;
        }
        if (name === 'node-change') {
            this.nodeChange = newValue;
        }
        switch (name) {
            case 'property-name': this.propertyName = newValue; break;
            case 'new-property-value': this.newPropertyValue = newValue === "undefined" ? undefined : newValue; break;
            case 'old-property-value': this.oldPropertyValue = newValue === "undefined" ? undefined : newValue; break;
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
        }    
    }

    static create(propertyName, currentValue, previousValue) {
        const component = document.createElement('property-card');
        component.setAttribute('property-name', propertyName + ': ');
        component.setAttribute('new-property-value', PropertyCard.#formatPropertyValue(currentValue));
        component.setAttribute('old-property-value', PropertyCard.#formatPropertyValue(previousValue));
    
        return component;
    }

    static #formatPropertyValue(value) {
        if (_.isObject(value) || Array.isArray(value)) {
            return _.isObject(value) ? JSON.stringify(value, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;') : value;
        }
        return value;
    }
}

customElements.define('property-card', PropertyCard);