const appConfig = {
    tagsBaseUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK',
    fieldsBaseUrl: 'https://raw.githubusercontent.com/OP-TED/eForms-SDK'
};

const appState = {
    sortedData: [],
    versionData: [],
    comparisonData: []
};

const domElements = {
    loadingSpinner: $('#loadingSpinner'),
    apiStatus: $('#apiStatus'),
    xmlStructureTree: $('#xmlStructureTree'),
    tagsDropdown: $('#tagsDropdown'),
    comparisonDropdown: $('#comparisonDropdown')
};

function toggleLoadingSpinner(show) {
    if (show) {
        domElements.loadingSpinner.show();
    } else {
        domElements.loadingSpinner.hide();
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
        let oldMap = new Map(appState.comparisonDataFields.map(node => [node.id, node]));
        let newMap = new Map(appState.versionDataFields.map(node => [node.id, node]));
        const selectedFieldId = data.node.id;
        const fieldDetails = fieldsComparisonResults.find(field => field.id === selectedFieldId);
        if (fieldDetails) {
            displayFieldDetails(fieldDetails, oldMap, newMap);
        }
    });
}


function displayFieldDetails(fieldDetails, oldMap, newMap) {
    function createTree() {
        const newNode = newMap.get(fieldDetails.id);
        const oldNode = oldMap.get(fieldDetails.id);
        const $ul = $('<ul class="list-group">');
        
        // Display the properties of the new object, with comparisons to the old object
        for (const [key, value] of Object.entries(newNode)) {
            const $li = $('<li class="list-group-item">');
            const $keySpan = $('<span class="font-weight-bold">').text(key + ': ');
            const oldValue = oldNode[key];
            let $valueSpan;
            if ($.isPlainObject(value) || Array.isArray(value)) {
                const formattedValue = formatObjectValue(value);
                $valueSpan = $('<span>').html(formattedValue);
            } else {
                $valueSpan = $('<span>').text(value);
            }

            $li.append($keySpan).append($valueSpan);

            // Compare and show old values if different
            if (!areValuesEquivalent(value, oldValue)) {
                const formattedOldValue = formatObjectValue(oldValue);
                const $oldValueDiv = $(`<div class="changed-value">
                    <strong>Changed Values:</strong> ${formattedOldValue}
                </div>`);
                $li.append($oldValueDiv);
            } else if (oldValue === undefined) {
                // Highlight newly added properties
                $li.css('background-color', '#d4edda');
            }

            $ul.append($li);
        }

        // Identify and display missing properties in the new object
        for (const key in oldNode) {
            if (!newNode.hasOwnProperty(key)) {
                const $li = $('<li class="list-group-item">').css('background-color', '#f8d7da');
                const $keySpan = $('<span class="font-weight-bold">').text(key + ': ');
                const formattedOldValue = formatObjectValue(oldNode[key]);
                $li.append($keySpan).html(`<span>Removed Value: ${formattedOldValue}</span>`);
                $ul.append($li);
            }
        }

        return $ul;
    }

    function formatObjectValue(obj) {
        return _.isObject(obj) ? JSON.stringify(obj, null, 2).replace(/\n/g, '<br>').replace(/ /g, '&nbsp;') : obj;
    }

    $('#detailsContent').empty().append(createTree());
}


function highlightDifference(source, reference) {
    let sourceWords = words(source);
    let referenceWords = words(reference);
    let diffWords = sourceWords.filter(i => !referenceWords.includes(i));
  
    diffWords.forEach(word => {
      source = source.replace(new RegExp(`(${word})`, 'g'), `<mark>$1</mark>`);
    });
    
    return source;
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
    toggleLoadingSpinner(true);
    clearApiStatus();

    const url = `${appConfig.fieldsBaseUrl}/${tagName}/fields/fields.json`;
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
                const xmlComparisonResults = compareDataStructures(appState.comparisonData, appState.versionData);
                const fieldsComparisonResults = compareDataStructures(appState.comparisonDataFields, appState.versionDataFields, true);
                initializeTree(xmlComparisonResults, fieldsComparisonResults);

            }
        }
        updateApiStatus(`API call succeeded for file version "${tagName}"`, true);
    } catch (error) {
        updateApiStatus(`API call succeeded for file version "${tagName}"`, false);
        console.error('Error fetching and displaying fields content:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}

function compareDataStructures(oldStructure, newStructure, performDeepComparison = false) {
    let comparisonResults = [];

    let oldMap = new Map(oldStructure.map(node => [node.id, node]));
    let newMap = new Map(newStructure.map(node => [node.id, node]));

    // First, check for removed nodes
    oldStructure.forEach(oldNode => {
        if (!newMap.has(oldNode.id)) {
            comparisonResults.push({ ...oldNode, nodeChange: 'removed' });
        }
    });

    // Then, check for added nodes
    newStructure.forEach(newNode => {
        if (!oldMap.has(newNode.id)) {
            comparisonResults.push({ ...newNode, nodeChange: 'added' });
        }
    });

    // Finally, check for edited nodes
    oldStructure.forEach(oldNode => {
        if (newMap.has(oldNode.id)) {
            const newNode = newMap.get(oldNode.id);
            if (performDeepComparison && !areValuesEquivalent(oldNode, newNode)) {
                comparisonResults.push({ ...oldNode, nodeChange: 'edited' });
            } else if (!comparisonResults.some(node => node.id === oldNode.id)) {
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
});

domElements.tagsDropdown.change(async function () {
    const selectedTagName = $(this).val();
    await fetchAndDisplayFieldsContent(selectedTagName, true);
});

domElements.comparisonDropdown.change(async function () {
    const selectedComparisonTagName = $(this).val();
    await fetchAndDisplayFieldsContent(selectedComparisonTagName, false);
});
