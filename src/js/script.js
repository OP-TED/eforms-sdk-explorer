import { BootstrapWebComponent } from './bootstrap-web-component.js';
import { PropertyCard } from './property-card.js';
import { IndexCard } from './index-card.js';

const appConfig = {
    tagsBaseUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK',
    rawBaseUrl: 'https://raw.githubusercontent.com/OP-TED/eForms-SDK',
    noticeTypesFileUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK/contents/notice-types'
};

const appState = {
    sortedData: [],
    versionData: [],
    comparisonData: [],
    selectedTagName: '',
    selectedComparisonTagName: '',
    selectedNoticeTypeFile: 'notice-types.json',
    activeTab: 'fields'

};

const domElements = {
    noticeTypesSpinner: $('#noticeTypesSpinner'),
    apiStatus: $('#apiStatus'),
    xmlStructureTree: $('#xmlStructureTree'),
    tagsDropdown: $('#tagsDropdown'),
    comparisonDropdown: $('#comparisonDropdown'),
    noticeTypesDropdown: $('#noticeTypesDropdown'),
    noticeTypesTree: $('#noticeTypesTree'),
    fieldDetailsContent: $('#fieldDetailsContent'),
    noticeTypesComparisonContent: $('#noticeTypesComparisonContent'),
    noticeTypesDetails: $('#noticeTypesDetails')
};

function toggleLoadingSpinner(show) {
    const spinnerElement = $('#centralLoadingSpinner'); 
    if (show) {
        spinnerElement.show();
    } else {
        spinnerElement.hide();
    }
}
function clearApiStatus() {
    domElements.apiStatus.text('');
}


function buildTreeData(xmlStructure, fieldsComparisonResults) {

    const treeDataMap = new Map(xmlStructure.map(node => {
        return [node.id, {
            id: node.id,
            parent: node.parentId || "#",
            text: node.name || node.id,
            state: {
                opened: true
            },
            li_attr: node.nodeChange === 'removed' ? { class: 'removed-node' } :
                node.nodeChange === 'added' ? { class: 'added-node' } :
                    node.nodeChange === 'modified' ? { class: 'modified-node' } : {},
            data: {
                btId: node.btId,
                xpathRelative: node.xpathRelative,
                status: node.nodeChange
    }
        }];
    }));


    fieldsComparisonResults.forEach(field => {
        treeDataMap.set(field.id, {
            id: field.id,
            parent: field.parentNodeId,
            text: field.name || field.id,
            icon: 'jstree-file',
            state: {
                opened: true
            },
            li_attr: field.nodeChange === 'removed' ? { class: 'removed-node' } :
                field.nodeChange === 'added' ? { class: 'added-node' } :
                    field.nodeChange === 'modified' ? { class: 'modified-node' } : {},
                    data: {
                        id: field.id,
                        btId: field.btId,
                        xpathRelative: field.xpathRelative,
                        status: field.nodeChange
                    }
        });
    });

    return Array.from(treeDataMap.values());
}

function initializeTree(xmlStructure, fieldsComparisonResults) {
    if (domElements.xmlStructureTree.jstree(true)) {
        domElements.xmlStructureTree.jstree("destroy");
    }
    domElements.xmlStructureTree.jstree({
        core: {
            data: buildTreeData(xmlStructure, fieldsComparisonResults),
            check_callback: true
        },
        plugins: ["wholerow", "search"],
        'search': {
            'show_only_matches': true,
            search_callback: function (str, node) {

                var terms = str.split('::');
                var status = terms[0];
                var searchText = terms.length > 1 ? terms[1] : '';
                
                var textMatch = false;
                if (searchText.length > 0 && !searchText.startsWith('|')) {
                    var combined = (node?.text || '') + '|' + (node?.data?.btId || '') + '|' + (node?.data?.id || '') + '|' + (node?.data?.xpathRelative || '');
                    textMatch = combined.toLowerCase().indexOf(searchText) > -1;
                }

                if (status === 'all') {
                    return textMatch;
                } else {
                    return (node?.data?.status === status) && (textMatch || searchText === '');
                }
            }            
        }            
    });

    domElements.xmlStructureTree.on("select_node.jstree", function (e, data) {
        const selectedFieldId = data.node.id;
        const fieldDetails = fieldsComparisonResults.find(field => field.id === selectedFieldId);
        if (fieldDetails) {
            let oldMap = new Map(appState.comparisonDataFields.map(node => [node.id, node]));
            let newMap = new Map(appState.versionDataFields.map(node => [node.id, node]));
            displayFieldDetails(fieldDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
        }
        const nodeDetails = xmlStructure.find(field => field.id === selectedFieldId);
        if (nodeDetails) {
            let oldMap = new Map(appState.comparisonData.map(node => [node.id, node]));
            let newMap = new Map(appState.versionData.map(node => [node.id, node]));
            displayFieldDetails(nodeDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
        }
    });

    // Listen for changes in the search fields
    $('#fields-tree-search').keyup(searchTree);
    $('#fields-tree-filter').change(searchTree);

    function searchTree() {
        // Get the value of the search input field
        var searchString = $('#fields-tree-filter').val() + '::' + $('#fields-tree-search').val();

        // Search the tree
        domElements.xmlStructureTree.jstree('search', searchString);
    }
}


function displayProperty(key, newValue, oldValue) {

    // Format the new value
    if (_.isObject(newValue) || Array.isArray(newValue)) {
        newValue = formatObjectValue(newValue);
    }

    // Format the old value
    if (_.isObject(oldValue) || Array.isArray(oldValue)) {
        oldValue = formatObjectValue(oldValue);
    }

    const $component = $('<property-card/>');
    $component.attr('property-name', key + ': ');
    $component.attr('new-property-value', newValue);
    $component.attr('old-property-value', oldValue);

    return $component;
}

function displayFieldDetails(data, oldMap, newMap, container, uniqueKey = 'id') {
    function createTree(uniqueId) {
        const newField = newMap.get(uniqueId);
        const oldField = oldMap.get(uniqueId);
        const $ul = $('<ul class="list-group">');

        const fieldToIterate = newField || oldField;

        for (const [key, value] of Object.entries(fieldToIterate)) {
            if (key === 'content') {
                continue;
            }
            const newValue = newField ? newField[key] : undefined;
            const oldValue = oldField ? oldField[key] : undefined;
            const $propertyTemplate = displayProperty(key, newField ? newValue : undefined, oldValue);
            $ul.append($propertyTemplate);
        }

        // Handle removed properties in oldField that are not in newField
        if (newField) {
            for (const key in oldField) {
                if (!newField.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = displayProperty(key, undefined, oldField[key]);
                    $ul.append($removedPropertyTemplate);
                }
            }
        }

        return $ul;
    }

    // Clear existing content
    $(container).empty();

    if (Array.isArray(data)) {
        data.forEach(item => {
            const $itemTree = createTree(item[uniqueKey]);
            const $itemContainer = $('<div class="notice-type-card mb-3"></div>').append($itemTree);
            $(container).append($itemContainer);
        });
    } else {
        const $tree = createTree(data[uniqueKey]);
        $(container).append($tree);
    }
}

function displayNoticeTypeCard(data, oldMap, newMap, container, uniqueKey = 'id') {
    function createTree(uniqueId) {
        const newField = newMap.get(uniqueId);
        const oldField = oldMap.get(uniqueId);

        const component = document.createElement('index-card');

        const fieldToIterate = newField || oldField;

        for (const [key, value] of Object.entries(fieldToIterate)) {
            if (key === 'content') {
                continue;
            }
            const newValue = newField ? newField[key] : undefined;
            const oldValue = oldField ? oldField[key] : undefined;
            const $propertyTemplate = displayProperty(key, newField ? newValue : undefined, oldValue);

            component.appendProperty($propertyTemplate);
            component.setAttribute('action-name', 'Compare');

            if (key === 'subTypeId') {
                component.setAttribute('title', value);
                component.setActionHandler(function (e) {
                    e.preventDefault();
                    selectNoticeSubtype(newValue + '.json');
                });
            } else if (key === 'type') {
                component.setAttribute('subtitle', value);
            }
        }

        // Handle removed properties in oldField that are not in newField
        if (newField) {
            for (const key in oldField) {
                if (!newField.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = displayProperty(key, undefined, oldField[key]);
                    component.appendProperty($removedPropertyTemplate);
                }
            }
        }

        return component;
    }

    // Clear existing content
    $(container).empty();

    if (Array.isArray(data)) {
        data.forEach(item => {
            const $itemTree = createTree(item[uniqueKey]);
            const $itemContainer = $('<div class="notice-type-card mb-3"></div>').append($itemTree);
            $(container).append($itemTree);
        });
    } else {
        const $tree = createTree(data[uniqueKey]);
        $(container).append($tree);
    }
}

function formatObjectValue(obj) {
    return _.isObject(obj) ? JSON.stringify(obj, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;') : obj;
}

function areValuesEquivalent(a, b) {
    if (_.isEqual(a, b)) {
        return true;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!_.isEqual(a[i], b[i])) return false;
        }
        return true;
    }

    return false;
}


async function fetchAndDisplayFieldsContent(tagName, isTagsDropdown) {
    clearApiStatus();
    domElements.tagsDropdown.prop('disabled', true);
    domElements.comparisonDropdown.prop('disabled', true);
    const url = `${appConfig.rawBaseUrl}/${tagName}/fields/fields.json`;
    try {
        const response = await $.ajax({ url, dataType: 'json' });
        const fieldsData = response;
        if (isTagsDropdown) {
            appState.versionData = fieldsData.xmlStructure;
            appState.versionDataFields = fieldsData.fields;
            fieldsData.xmlStructure[0].version = fieldsData.sdkVersion;
        } else {
            fieldsData.xmlStructure[0].version = fieldsData.sdkVersion;
            appState.comparisonData = fieldsData.xmlStructure;
            appState.comparisonDataFields = fieldsData.fields;
            if (appState.versionData && appState.comparisonData) {
                const xmlComparisonResults = compareDataStructures(appState.comparisonData, appState.versionData, 'id', true);
                const fieldsComparisonResults = compareDataStructures(appState.comparisonDataFields, appState.versionDataFields, 'id', true);
                initializeTree(xmlComparisonResults, fieldsComparisonResults);
            }
        }
    } catch (error) {
        updateApiStatus('Failed to load data.', false);
        console.error('Error fetching and displaying fields content:', error);
    } finally {
        domElements.tagsDropdown.prop('disabled', false);
        domElements.comparisonDropdown.prop('disabled', false);
        updateApiStatus(`Data successfully loaded for SDK version ${appState.selectedTagName} and compared with ${appState.selectedComparisonTagName}`, true);

    }
}

async function fetchAndDisplayNoticeTypes(selectedTagName, selectedComparisonTagName) {
    toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
    clearApiStatus();

    try {
        const selectedUrl = constructNoticeTypesUrl(selectedTagName, appState.selectedNoticeTypeFile);
        const comparisonUrl = constructNoticeTypesUrl(selectedComparisonTagName, appState.selectedNoticeTypeFile);
        const [selectedNoticeTypesData, comparisonNoticeTypesData] = await Promise.all([
            fetchNoticeTypesData(selectedUrl),
            fetchNoticeTypesData(comparisonUrl)
        ]);

        const isMainNoticeTypesFile = appState.selectedNoticeTypeFile === 'notice-types.json';

        if (isMainNoticeTypesFile) {
            showComparisonView();
            const comparisonResults = compareNoticeTypes(selectedNoticeTypesData, comparisonNoticeTypesData);
            let oldMap = new Map(selectedNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            let newMap = new Map(comparisonNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            displayNoticeTypeCard(comparisonResults, oldMap, newMap, domElements.noticeTypesComparisonContent, 'subTypeId');
        } else {
            let oldMap = flattenToMap(selectedNoticeTypesData.content);
            let newMap = flattenToMap(comparisonNoticeTypesData.content);
            const comparisonResults = compareNoticeTypes(selectedNoticeTypesData, comparisonNoticeTypesData);
            showTreeView(comparisonResults, oldMap, newMap);
        }

        updateApiStatus('Successfully loaded notice types.');
    } catch (error) {
        updateApiStatus('Failed to load notice types.', false);
        console.error('Error during notice types operation:', error);
    } finally {
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    }
}

function selectNoticeSubtype(filename) {
    appState.selectedNoticeTypeFile = filename;

    toggleLoadingSpinner(true, domElements.noticeTypesSpinner);

    fetchAndDisplayNoticeTypes(appState.selectedTagName, appState.selectedComparisonTagName)
        .then(() => {
            toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
        })
        .catch(error => {
            console.error('Error fetching and displaying notice types:', error);
            toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
            updateApiStatus('Failed to load notice types.', false);
        });
}



function constructNoticeTypesUrl(tagName, fileName) {
    return `${appConfig.rawBaseUrl}/${tagName}/notice-types/${fileName}`;
}

async function fetchNoticeTypesData(url) {
    try {
        const response = await $.ajax({ url, dataType: 'json' });
        return response;
    } catch (error) {
        console.error('Error fetching notice types:', error);
        throw error;
    }
}

function compareNoticeSubTypes(oldNoticeSubTypes, newNoticeSubTypes) {
    let comparisonResults = [];

    const oldMap = new Map(oldNoticeSubTypes.map(item => [item.subTypeId, item]));
    const newMap = new Map(newNoticeSubTypes.map(item => [item.subTypeId, item]));

    // Check for removed or modified items
    oldNoticeSubTypes.forEach(oldItem => {
        if (!newMap.has(oldItem.subTypeId)) {
            comparisonResults.push({ ...oldItem, changeType: 'removed' });
        } else {
            const newItem = newMap.get(oldItem.subTypeId);
            if (!areValuesEquivalent(oldItem, newItem)) {
                comparisonResults.push({ ...newItem, changeType: 'modified' });
            }
        }
    });

    // Check for added items
    newNoticeSubTypes.forEach(newItem => {
        if (!oldMap.has(newItem.subTypeId)) {
            comparisonResults.push({ ...newItem, changeType: 'added' });
        }
    });

    return comparisonResults;
}

function compareNoticeTypes(selectedData, comparisonData) {
    const selectedKey = selectedData.noticeSubTypes ? 'noticeSubTypes' : 'content';
    const comparisonKey = comparisonData.noticeSubTypes ? 'noticeSubTypes' : 'content';
    const uniqueKey = selectedData.noticeSubTypes ? 'subTypeId' : 'id';

    const comparisonResults = compareDataStructures(selectedData[selectedKey], comparisonData[comparisonKey], uniqueKey, true);
    return comparisonResults;
}

function processNoticeTypesJsTree(content, parentId = "#") {
    let treeData = [];
    content.forEach(item => {
        let node = {
            id: item.id,
            parent: parentId,
            text: item.id,
            state: { opened: true },
            type: item.contentType === 'group' ? "default" : "field",
            li_attr: item.nodeChange === 'removed' ? { class: 'removed-node' } :
                item.nodeChange === 'added' ? { class: 'added-node' } :
                    item.nodeChange === 'modified' ? { class: 'modified-node' } : {}
        };
        // Adding icon for items with contentType "file"
        if (item.contentType === "field") {
            node.icon = 'jstree-file';
        }
        treeData.push(node);
        if (item.contentType === 'group' && item.content) {
            let children = processNoticeTypesJsTree(item.content, item.id);
            treeData = treeData.concat(children);
        }
    });

    return treeData;
}

function showComparisonView() {
    // Hide the tree view and details view
    $('#noticeTypesTreeContainer').hide();
    $('#noticeTypesDetails').hide();

    // Show the comparison view
    $('.notice-types-comparison').show();
    $('#noticeTypesComparisonContent').show();
}

function showTreeView(treeData, oldMap, newMap) {
    // Remove comparison view if it exists
    $('.notice-types-comparison').hide();
    $('#noticeTypesComparisonContent').hide();

    // Show the tree view and details view
    $('#noticeTypesTreeContainer').show();
    $('#noticeTypesDetails').show();

    $('<div/>', {
        id: 'noticeTypesTree'
    }).appendTo('#noticeTypesTreeContainer');

    // initializeNoticeTypesTree(treeData);
    let jsTreeData = processNoticeTypesJsTree(treeData);
    $('#noticeTypesComparisonContainer').hide();
    $('#noticeTypesTreeContainer').show();

    // Check if the tree view is already initialized
    if (domElements.noticeTypesTree.jstree(true)) {
        // If already initialized, destroy the existing tree before creating a new one
        domElements.noticeTypesTree.jstree("destroy");
    }
    domElements.noticeTypesTree.jstree({
        core: {
            data: jsTreeData,
            check_callback: true
        },
        plugins: ["wholerow"]
    });

    domElements.noticeTypesTree.on("select_node.jstree", function (e, data) {
        const selectedFieldId = data.node.id;
        const fieldDetails = findFieldById(treeData, selectedFieldId)
        displayFieldDetails(fieldDetails, oldMap, newMap, domElements.noticeTypesDetails);

    });
    $('#noticeTypesTreeContainer').show();
}

function flattenToMap(data, map = new Map()) {
    data.forEach(item => {
        map.set(item.id, item);
        if (Array.isArray(item.content)) {
            flattenToMap(item.content, map); // Recursively process nested arrays
        }
    });
    return map;
}

function findFieldById(data, fieldId) {
    let result = null;
    function searchContent(content) {
        for (let item of content) {
            if (item.id === fieldId) {
                result = item;
                return true;
            }
            if (Array.isArray(item.content)) {
                if (searchContent(item.content)) {
                    return true;
                }
            }
        }
        return false;
    }

    searchContent(data);
    return result;
}


function buildTreeDataForNoticeTypes(noticeData, parent = "#") {
    let treeData = [];

    noticeData.forEach(item => {
        let node = {
            id: item.id,
            parent: parent,
            text: item.description,
            state: { opened: true },
            type: item.contentType === 'group' ? "default" : "file",
            li_attr: { class: item.contentType === 'group' ? 'group-node' : 'field-node' }
        };

        treeData.push(node);

        // If this is a group and has content, recursively get the children
        if (item.contentType === 'group' && item.content && item.content.length > 0) {
            let children = buildTreeDataForNoticeTypes(item.content, item.id);
            treeData = treeData.concat(children);
        }
    });

    return treeData;
}


function displayNoticeTypeDetails(nodeData) {
    domElements.noticeTypesDetails.empty();

    if (!nodeData) {
        domElements.noticeTypesDetails.html('Select a node to see details.');
        return;
    }
    const $ul = $('<ul class="list-group">');
    Object.entries(nodeData).forEach(([key, value]) => {
        const $li = $('<li class="list-group-item"></li>');
        $li.html(`<strong>${key}:</strong> ${value}`);
        $ul.append($li);
    });

    domElements.noticeTypesDetails.append($ul);
}

function compareDataStructures(oldStructure, newStructure, uniqueKey = 'id', performDeepComparison = false) {
    let comparisonResults = [];

    let oldMap = new Map(oldStructure.map(node => [node[uniqueKey], node]));
    let newMap = new Map(newStructure.map(node => [node[uniqueKey], node]));

    // First, check for removed nodes
    oldStructure.forEach(oldNode => {
        if (!newMap.has(oldNode[uniqueKey])) {
            comparisonResults.push({ ...oldNode, nodeChange: 'removed' });
        }
    });

    // Then, check for added nodes
    newStructure.forEach(newNode => {
        if (!oldMap.has(newNode[uniqueKey])) {
            comparisonResults.push({ ...newNode, nodeChange: 'added' });
        }
        if (oldMap.has(newNode[uniqueKey])) {
            const oldNode = oldMap.get(newNode[uniqueKey]);
            if (performDeepComparison && !areValuesEquivalent(oldNode, newNode)) {
                comparisonResults.push({ ...newNode, nodeChange: 'modified' });
            } else if (!comparisonResults.some(node => node[uniqueKey] === oldNode)) {
                comparisonResults.push({ ...newNode, nodeChange: 'unchanged' });
            }
        }

    });

    return comparisonResults;
}


function findIndexByVersion(versionName) {
    return sortedData.findIndex(function (item) {
        return item.name === versionName;
    });
}

function compareVersions(a, b) {
    const parseVersionPart = (part) => {
        const match = part.match(/(\d+)(.*)/);
        return match ? { number: parseInt(match[1], 10), text: match[2] } : { number: 0, text: '' };
    };

    const aParts = a.split('.').map(parseVersionPart);
    const bParts = b.split('.').map(parseVersionPart);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aValue = i < aParts.length ? aParts[i] : { number: 0, text: '' };
        const bValue = i < bParts.length ? bParts[i] : { number: 0, text: '' };

        // Compare numeric
        if (aValue.number > bValue.number) return -1;
        if (aValue.number < bValue.number) return 1;

        // Compare textual parts if needed
        if (aValue.text > bValue.text) return -1;
        if (aValue.text < bValue.text) return 1;
    }

    return 0;
}


async function populateDropdown() {
    toggleLoadingSpinner(true);
    clearApiStatus();
    try {
        const response = await $.ajax({
            url: `${appConfig.tagsBaseUrl}/tags`,
            dataType: 'json'
        });
        const data = response.sort((a, b) => compareVersions(a.name, b.name));

        appState.sortedData = data;
        domElements.tagsDropdown.empty();
        domElements.comparisonDropdown.empty();

        data.forEach(item => {
            const option = $('<option>', { value: item.name, text: item.name });
            domElements.tagsDropdown.append(option.clone());
            domElements.comparisonDropdown.append(option);
        });

        domElements.tagsDropdown.val(data[0].name);
        domElements.comparisonDropdown.val(data.length > 1 ? data[1].name : data[0].name);
        appState.selectedTagName = data[0].name;
        appState.selectedComparisonTagName = data[1].name;
        await fetchAndDisplayFieldsContent(data[0].name, true);
        await fetchAndDisplayFieldsContent(data[1].name, false);
    } catch (error) {
        updateApiStatus('API call failed to fetch tags.', false);
        console.error('Error populating dropdowns:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}

function updateApiStatus(message, isSuccess = true) {
    domElements.apiStatus.text(message);

    if (isSuccess) {
        domElements.apiStatus.addClass('alert-success').removeClass('alert-danger');
    } else {
        domElements.apiStatus.addClass('alert-danger').removeClass('alert-success');
    }

    domElements.apiStatus.show();

    setTimeout(() => {
        domElements.apiStatus.fadeOut('slow');
    }, 5000);
}

async function fetchAndDisplayReleaseNotes() {
    const releaseNotesUrl = `${appConfig.rawBaseUrl}/${appState.selectedTagName}/CHANGELOG.md`;
    try {
        toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
        const response = await fetch(releaseNotesUrl);
        const markdownContent = await response.text();
        displayMarkdownAsHtml(markdownContent);
    } catch (error) {
        console.error('Error fetching release notes:', error);
        $('#release-notes').html('<p>Error loading release notes.</p>');
    } finally {
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    }
}

function displayMarkdownAsHtml(markdownContent) {
    const converter = new showdown.Converter();
    const htmlContent = converter.makeHtml(markdownContent);
    $('#release-notes').html(`<div class="p-3">${htmlContent}</div>`);
}

$(document).ready(() => {
    populateDropdown();
    $('#fields-tab').on('click', function () {
        appState.activeTab = 'fields';
    });

    $('#notice-types-tab').on('click', async function () {
        toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
        appState.activeTab = 'notice-types';
        await fetchAndDisplayNoticeTypes(appState.selectedTagName, appState.selectedComparisonTagName);
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);

    });

    $('#noticeTypesTreeContainer').hide();

    $('#overviewLink').on('click', async function (e) {
        appState.selectedNoticeTypeFile = 'notice-types.json';
        toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
        await fetchAndDisplayNoticeTypes(appState.selectedTagName, appState.selectedComparisonTagName);
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    });

    $('#release-notes-tab').on('click', function () {
        fetchAndDisplayReleaseNotes();
    });

    // Enable Bootstrap popovers everywhere
    $('[data-toggle="popover"]').popover();
});

domElements.noticeTypesDropdown.change(async function () {
    const fileName = $(this).val();
    appState.selectedNoticeTypeFile = fileName;
    toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
    await fetchAndDisplayNoticeTypes(appState.selectedTagName, appState.selectedComparisonTagName);
    toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
});

domElements.tagsDropdown.change(function () {
    appState.selectedTagName = $(this).val();
    $('#fieldDetailsContent').html('Select an item to see details.');
    fetchDataBasedOnActiveTab();
});

domElements.comparisonDropdown.change(function () {
    appState.selectedComparisonTagName = $(this).val();
    $('#fieldDetailsContent').html('Select an item to see details.');
    fetchDataBasedOnActiveTab();
});


function fetchDataBasedOnActiveTab() {
    const selectedTagName = appState.selectedTagName;
    const selectedComparisonTagName = appState.selectedComparisonTagName;
    if (appState.activeTab === 'fields') {
        fetchAndDisplayFieldsContent(selectedTagName, true);
        fetchAndDisplayFieldsContent(selectedComparisonTagName, false);
    } else if (appState.activeTab === 'notice-types') {
        fetchAndDisplayNoticeTypes(selectedTagName, selectedComparisonTagName);
    }
}
