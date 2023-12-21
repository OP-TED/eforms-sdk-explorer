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
            case 'new-property-value': this.newPropertyValue = newValue; break;
            case 'old-property-value': this.oldPropertyValue = newValue; break;
        }

        if (this.isConnected) {
            this.render();
        }
    }

    render() {
        super.render();
        console.log("PropertyCard render called with nodeChange: ", this.nodeChange);

        this.shadowRoot.querySelector('#property-name').textContent = this.propertyName;
        this.shadowRoot.querySelector('#new-property-value').innerHTML = this.newPropertyValue;
        this.shadowRoot.querySelector('#old-property-value').innerHTML = this.oldPropertyValue;
    
        // Get the list item element
        const listItem = this.shadowRoot.querySelector('#list-item');
    
        // Clear previous classes that may have been added
        listItem.classList.remove('added-property', 'removed-property', 'changed-property');
    
        // Add classes based on nodeChange
        if (this.nodeChange === 'added') {
            listItem.classList.add('added-property');
            this.shadowRoot.querySelector('#old-property-value').style.display = 'none';
        } else if (this.nodeChange === 'removed') {
            listItem.classList.add('removed-property');
            this.shadowRoot.querySelector('#new-property-value').style.display = 'none';
        } else if (this.newPropertyValue !== this.oldPropertyValue) {
            listItem.classList.add('changed-property');
        }
    }

    static create(propertyName, currentValue, previousValue, nodeChange) {
        const $component = $('<property-card/>');
        $component.attr('property-name', propertyName + ': ');
        $component.attr('new-property-value', PropertyCard.#formatPropertyValue(currentValue));
        $component.attr('old-property-value', PropertyCard.#formatPropertyValue(previousValue));
        $component.attr('node-change', nodeChange);  // Add this line
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