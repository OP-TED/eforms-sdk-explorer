import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { Diff, DiffEntry } from "./diff.js";
import { PropertyCard } from "./property-card.js";

export class TreeDetailSplitView extends BootstrapWebComponent {

    static get observedAttributes() {
        return ['tree-data', 'detail-data'];
    }

    constructor() {
        super('tree-detail-split-view-template');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (newValue === oldValue) {
            return;
        }
        switch (name) {
            case 'tree-data': this.treeData = newValue; break;
            case 'detail-data': this.detailData = newValue; break;
        }

        if (this.isConnected) {
            this.render();
        }
    }

    requiredCss() {
        return [ ...super.requiredCss(),
            'https://cdnjs.cloudflare.com/ajax/libs/jstree/3.2.1/themes/default/style.min.css'
        ];
    }

    render() {
        super.render();

        // Listen for changes in the search fields
        this.$treeSearch().keyup(this.#searchJsTree.bind(this));
        this.$treeFilter().change(this.#searchJsTree.bind(this));

        // Listen for changes in the compact view switch
        this.shadowRoot.querySelector('#compactViewSwitch').addEventListener('change', function(event) {
            if (event.target.checked) {
                this.style.setProperty('--compact-view-display', 'none');
            } else {
                this.style.setProperty('--compact-view-display', 'flex');
            }
        }.bind(this));
    
        // Show the popover when the element receives focus
        this.$treeSearch().focus(function () {
            $(this).popover('show');
        });

        // Hide the popover when the element loses focus
        this.$treeSearch().blur(function () {
            $(this).popover('hide');
        });
    }

    #treeView() {
        return this.shadowRoot.querySelector('#treeView');
    }

    $treeView() {
        return $(this.#treeView());
    }

    #treeFilter() {
        return this.shadowRoot.querySelector('#tree-filter');
    }

    $treeFilter() {
        return $(this.#treeFilter());
    }

    #treeSearch() {
        return this.shadowRoot.querySelector('#tree-search');
    }

    $treeSearch() {
        return $(this.#treeSearch());
    }

    #detailView() {
        return this.shadowRoot.querySelector('#detail-view');
    }

    $detailView() {
        return $(this.#detailView());
    }

    /**
     * Initialises the tree-detail-split-view component.
     * 
     * @param {Object} options - The options for initialising the component.
     * @param {Function(): Array} options.dataCallback - A callback function that should return the nodes for the tree.
     * @param {Function(DiffEntry, string, string): boolean} options.searchCallback - A callback function that should perform a search operation.
     * @param {Array} [options.hiddenProperties=[]] - An optional array of properties to exclude.
     * @param {Object} [options.popover={}] - An optional object containing the title and content for the popover.
     * @param {string} [options.popover.title] - The title for the popover.
     * @param {string} [options.popover.content] - The content for the popover.
     */
    initialise({ dataCallback, searchableProperties = [], hiddenProperties = [] }) {
        if (this.$treeView().jstree(true)) {
            this.$treeView().jstree("destroy");
        }
        this.$treeView().jstree({
            core: {
                data: dataCallback(),
                check_callback: true
            },
            plugins: ["wholerow", "search"],
            search: {
                show_only_matches: true,
                search_callback: (str, node) => this.#searchCallback(DiffEntry.fromObject(node?.data), ...str.split('::'), searchableProperties)
            }
        });
        
        // Listen for selection changes in the tree
        this.$treeView().on("select_node.jstree", (e, data) => {
            this.displayDetails(DiffEntry.fromObject(data.node.data), hiddenProperties);
        });   

        let titleSlot = this.shadowRoot.querySelector('slot[name="search-popover-title"]');
        let titleSlotNodes = titleSlot.assignedNodes();
        let popoverTitle = titleSlotNodes.length > 0 ? titleSlotNodes[0].innerHTML : titleSlot.innerHTML;

        let contentSlot = this.shadowRoot.querySelector('slot[name="search-popover-content"]');
        let contentSlotNodes = contentSlot.assignedNodes();
        let popoverContent = contentSlotNodes.length > 0 ? contentSlotNodes[0].innerHTML : contentSlot.innerHTML;
 
        this.$treeSearch().popover({
            title: popoverTitle,
            content: popoverContent.replace("{searchableProperties}", searchableProperties.map(p => `<code>${p}</code>`).join(', ')),
        });
    }

    /**
     * Checks if the {@link DiffEntry} matches the search criteria.
     * 
     * @param {DiffEntry} diffEntry 
     * @param {string} status 
     * @param {string} searchText
     * @returns {boolean} 
     */
    #searchCallback(diffEntry, status, searchText = '', searchableProperties = []) {
        let textMatch = false;

        searchText = searchText.trim();

        if (searchText.length > 0 && !searchText.startsWith('|')) {
            let combined = searchableProperties.map(prop => diffEntry?.get(prop) || '').join('|');
            let orTerms = searchText.split(','); // Split the searchText at comma

            // Check if any of the OR terms are in the combined string
            textMatch = orTerms.some(orTerm => {
                orTerm = orTerm.trim();
                let andTerms = orTerm.split(' '); // Split the OR term at whitespace

                // Check if all of the AND terms are in the combined string
                return andTerms.every(term => {
                    term = term.trim();
                    if (term === '') {
                        return true;    // This effectively ignores empty terms (caused by multiple spaces)
                    }

                    switch (term.charAt(0)) {
                        case '+': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.ADDED;
                        case '-': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.REMOVED;
                        case '~': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.MODIFIED;
                        case '*': return [Diff.TypeOfChange.ADDED, Diff.TypeOfChange.REMOVED, Diff.TypeOfChange.MODIFIED].includes(diffEntry?.propertyChange(term.substring(1)));
                        default: return combined.toLowerCase().indexOf(term.toLowerCase()) > -1;
                    }
                });
            });
        }

        if (status === 'all') {
            return textMatch;
        } else {
            return (diffEntry?.typeOfChange === status) && (textMatch || searchText === '');
        }
    }
    
    /**
     * Initiates a search in the JsTree.
     */
    #searchJsTree() {
        // Get the value of the search input field
        let searchString = this.$treeFilter().val() + '::' + this.$treeSearch().val();

        // Search the tree
        this.$treeView().jstree('search', searchString);
    }

    /**
     * Called when a tree-node is selected in the JsTree.
     * Displays the details of the selected node.
     * 
     * @param {DiffEntry} diffEntry 
     */
    displayDetails(diffEntry, except = []) {

        // Clear existing content
        this.$detailView().empty();

        const $ul = $('<ul class="list-group">');

        for (const [key, value] of Object.entries(diffEntry.getItem())) {

            const mainValue = diffEntry.mainItem ? diffEntry.mainItem[key] : undefined;
            const baseValue = diffEntry.baseItem ? diffEntry.baseItem[key] : undefined;

            if (except.includes(key) && mainValue === baseValue) {
                continue;
            }

            const $propertyTemplate = PropertyCard.create(key, diffEntry.mainItem ? mainValue : undefined, baseValue);
            $ul.append($propertyTemplate);
        }

        // Handle removed properties in diffEntry.baseItem that are not in diffEntry.mainItem
        if (diffEntry.mainItem) {
            for (const key in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = PropertyCard.create(key, undefined, diffEntry.baseItem[key]);
                    $ul.append($removedPropertyTemplate);
                }
            }
        }

        this.$detailView().append($ul);
    }

}

customElements.define('tree-detail-split-view', TreeDetailSplitView);