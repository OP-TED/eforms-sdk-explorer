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
    loadingSpinner: $('#loadingSpinner'),
    noticeTypesSpinner: $('#noticeTypesSpinner'),
    apiStatus: $('#apiStatus'),
    xmlStructureTree: $('#xmlStructureTree'),
    tagsDropdown: $('#tagsDropdown'),
    comparisonDropdown: $('#comparisonDropdown'),
    noticeTypesDropdown: $('#noticeTypesDropdown'),
    noticeTypesTree: $('#noticeTypesTree'),
    fieldDetailsContent: $('#fieldDetailsContent'),
    noticeTypesComparisonContent: $('#noticeTypesComparisonContent')
};

function toggleLoadingSpinner(show, spinnerElement = domElements.loadingSpinner) {
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

    const treeDataMap = new Map(xmlStructure.map(node => [node.id, {
        id: node.id,
        parent: node.parentId || "#",
        text: node.name || node.id,
        state: {
            opened: true
        },
        li_attr: node.nodeChange === 'removed' ? { class: 'removed-node' } :
            node.nodeChange === 'added' ? { class: 'added-node' } :
                node.nodeChange === 'edited' ? { class: 'edited-node' } : {}
    }]));

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
                    field.nodeChange === 'edited' ? { class: 'edited-node' } : {}
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
        plugins: ["wholerow"]
    })

    domElements.xmlStructureTree.on("select_node.jstree", function (e, data) {
        const selectedFieldId = data.node.id;
        const fieldDetails = fieldsComparisonResults.find(field => field.id === selectedFieldId);
        if (fieldDetails) {
            let oldMap = new Map(appState.comparisonDataFields.map(node => [node.id, node]));
            let newMap = new Map(appState.versionDataFields.map(node => [node.id, node]));
            displayFieldDetails(fieldDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
        }
        const nodeDetails = xmlStructure.find(field => field.id === selectedFieldId);
        if(nodeDetails){
            let oldMap = new Map( appState.comparisonData.map(node => [node.id, node]));
            let newMap = new Map(appState.versionData.map(node => [node.id, node]));
            displayFieldDetails(nodeDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');

        }
    });
}


function displayProperty(key, newValue, oldValue) {

    const valueHasChanged = !areValuesEquivalent(newValue, oldValue);

    // Format the new value
    if (_.isObject(newValue) || Array.isArray(newValue)) {
        newValue = formatObjectValue(newValue);
    }

    // Format the old value
    if (_.isObject(oldValue) || Array.isArray(oldValue)) {
        oldValue = formatObjectValue(oldValue);
    }

    const $template = $($('#propertyTemplate').html());
    $template.find('.property-label').text(key + ': ');
    $template.find('#new-value').html(newValue);
    $template.find('#old-value').html(oldValue);

    if (oldValue === undefined) {
        $template.addClass('added-property');
        $template.find('#old-value').css('display', 'none');
    } else if (newValue === undefined) {
        $template.addClass('removed-property');
        $template.find('#new-value').css('display', 'none');
    } else if (valueHasChanged) {
        $template.addClass('changed-property');
        $template.find('#new-value').addClass('new-property-value');
        $template.find('#old-value').addClass('old-property-value');
    } else {
        $template.find('#old-value').css('display', 'none');
    }

    return $template;
}

function displayFieldDetails(data, oldMap, newMap, container, uniqueKey = 'id') {
    function createTree(uniqueId) {
        const newField = newMap.get(uniqueId);
        const oldField = oldMap.get(uniqueId);
        const $ul = $('<ul class="list-group">');

        const fieldToIterate = newField || oldField;

        for (const [key, value] of Object.entries(fieldToIterate)) {
            const newValue = newField ? newField[key] : undefined;
            const oldValue = oldField ? oldField[key] : undefined;
            const $propertyTemplate = displayProperty(key, newField ? newValue : undefined, oldValue);
            $ul.append($propertyTemplate);
        }
        if (newField) {
            for (const key in oldField) {
                if (!newField.hasOwnProperty(key)) {
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



function words(str) {
    return str.split(/\s+/);
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
                const xmlComparisonResults = compareDataStructures(appState.comparisonData, appState.versionData, 'id');
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

async function fetchAndPopulateNoticeTypesDropdown() {
    try {
        toggleLoadingSpinner(true, domElements.noticeTypesSpinner);;
        const response = await $.ajax({ url: appConfig.noticeTypesFileUrl, dataType: 'json' });
        const noticeTypesFiles = response.filter(item => item.type === 'file');

        const $dropdown = $('#noticeTypesDropdown');
        $dropdown.empty();

        noticeTypesFiles.forEach(file => {
            const option = new Option(file.name, file.name);
            $dropdown.append(option);
            if (file.name === appState.selectedNoticeTypeFile) {
                $(option).prop('selected', true);
            }
        });
    } catch (error) {
        console.error('Error fetching notice types:', error);
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    } finally {
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    }
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

    // Check for removed or edited items
    oldNoticeSubTypes.forEach(oldItem => {
        if (!newMap.has(oldItem.subTypeId)) {
            comparisonResults.push({ ...oldItem, changeType: 'removed' });
        } else {
            const newItem = newMap.get(oldItem.subTypeId);
            if (!areValuesEquivalent(oldItem, newItem)) {
                comparisonResults.push({ ...newItem, changeType: 'edited' });
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
            const comparisonResults = compareNoticeTypes(selectedNoticeTypesData, comparisonNoticeTypesData);
            let oldMap = new Map(selectedNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            let newMap = new Map(comparisonNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            displayFieldDetails(comparisonResults, oldMap, newMap, domElements.noticeTypesComparisonContent, 'subTypeId');
        } else {
            const comparisonResults = compareNoticeTypes(selectedNoticeTypesData, comparisonNoticeTypesData);
            showTreeView(comparisonResults);
        }

        updateApiStatus('Successfully loaded notice types.');
    } catch (error) {
        updateApiStatus('Failed to load notice types.', false);
        console.error('Error during notice types operation:', error);
    } finally {
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);
    }
}

function processContentDataForJsTree(content, parentId = "#") {
    let treeData = [];
    content.forEach(item => {
        let displayText = item.description.length > 100 ? item.description.substring(0, 20) + '...' : item.description;
        let node = {
            id: item.id,
            parent: parentId,
            text: displayText,
            state: { opened: true },
            type: item.contentType === 'group' ? "default" : "field",
            li_attr: item.nodeChange === 'removed' ? { class: 'removed-node' } :
            item.nodeChange === 'added' ? { class: 'added-node' } :
            item.nodeChange === 'edited' ? { class: 'edited-node' } : {}
        };
        // Adding icon for items with contentType "file"
        if (item.contentType === "field") {
            node.icon = 'jstree-file';
        }
        treeData.push(node);
        if (item.contentType === 'group' && item.content) {
            let children = processContentDataForJsTree(item.content, item.id);
            treeData = treeData.concat(children);
        }
    });

    return treeData;
}

function showTreeView(treeData) {
    // Remove comparison view if it exists
    $('#noticeTypesComparisonContent').remove();
    $('.notice-types-comparison').hide();

    $('<div/>', {
        id: 'noticeTypesTree'
    }).appendTo('#noticeTypesTreeContainer');

    // initializeNoticeTypesTree(treeData);
    let jsTreeData = processContentDataForJsTree(treeData);
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
        displayNoticeTypeDetails(data.node.original);
    });
    $('#noticeTypesTreeContainer').show();
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
    const $detailsContent = $('#noticeTypesDetails');
    $detailsContent.empty();

    if (!nodeData) {
        $detailsContent.html('Select a node to see details.');
        return;
    }

    // Create a list to display the details
    const $ul = $('<ul class="list-group">');
    // Add each property of the node as a list item
    Object.entries(nodeData).forEach(([key, value]) => {
        const $li = $('<li class="list-group-item"></li>');
        $li.html(`<strong>${key}:</strong> ${value}`);
        $ul.append($li);
    });

    $detailsContent.append($ul);
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
    });

    // Finally, check for edited nodes
    oldStructure.forEach(oldNode => {
        if (newMap.has(oldNode[uniqueKey])) {
            const newNode = newMap.get(oldNode[uniqueKey]);
            if (performDeepComparison && !areValuesEquivalent(oldNode, newNode)) {
                comparisonResults.push({ ...newNode, nodeChange: 'edited' });
            } else if (!comparisonResults.some(node => node[uniqueKey] === oldNode[uniqueKey])) {
                // Only add as unchanged if it hasn't been already added as removed or added
                comparisonResults.push({ ...oldNode, nodeChange: 'unchanged' });
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


async function populateDropdown() {
    toggleLoadingSpinner(true);
    clearApiStatus();
    try {
        const response = await $.ajax({
            url: `${appConfig.tagsBaseUrl}/tags`,
            dataType: 'json'
        });
        const data = response.sort((a, b) => b.name.localeCompare(a.name));

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

$(document).ready(() => {
    populateDropdown();
    $('#fields-tab').on('click', function () {
        appState.activeTab = 'fields';
    });

    $('#notice-types-tab').on('click', async function () {
        toggleLoadingSpinner(true, domElements.noticeTypesSpinner);
        appState.activeTab = 'notice-types';
        fetchAndPopulateNoticeTypesDropdown();
        await fetchAndDisplayNoticeTypes(appState.selectedTagName, appState.selectedComparisonTagName);
        toggleLoadingSpinner(false, domElements.noticeTypesSpinner);

    });

    $('#noticeTypesTreeContainer').hide();

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
