// script.js
function showLoadingSpinner() {
    $('#loadingSpinner').show();  
}

function hideLoadingSpinner() {
    $('#loadingSpinner').hide();
}

function clearApiStatus() {
    $('#apiStatus').text('');
}

function buildTreeData(xmlStructure) {
    return xmlStructure.map(function(node) {
        var treeNode = {
            id: node.id,
            parent: node.parentId ? node.parentId : "#",
            text: node.id,
            state: {
                opened: true
            }
        };
        return treeNode;
    });
}

function initializeTree(xmlStructure) {
    $('#xmlStructureTree').jstree({
        'core': {
            'data': buildTreeData(xmlStructure)
        }
    });
}

function populateDropdown() {
    showLoadingSpinner();
    clearApiStatus();
    $.get('https://api.github.com/repos/OP-TED/eForms-SDK/tags')
    .done(function(data) {
        var dropdown = $('#tagsDropdown');
        dropdown.empty(); 
        
        $.each(data, function(index, item) {
            dropdown.append($('<option>', {
                value: item.name,
                text: item.name
            }));
        });

        fetchAndDisplayFieldsContent(data[0].name); 
    })
    .fail(function() {
        hideLoadingSpinner(); 
        $('#apiStatus').text('API call failed for file version.');
    });
}

function fetchAndDisplayFieldsContent(tagName) {
    showLoadingSpinner(); 
    clearApiStatus(); 
    $.get(`https://raw.githubusercontent.com/OP-TED/eForms-SDK/${tagName}/fields/fields.json`)
    .done(function(data) {
        hideLoadingSpinner(); 
        var fieldsData = JSON.parse(data); 
        initializeTree(fieldsData.xmlStructure);
        $('#apiStatus').text(`API call succeeded for file version "${tagName}"`);
    })
    .fail(function() {
        hideLoadingSpinner();
        $('#apiStatus').text(`API call failed for file version "${tagName}"`);
    });
}

$(document).ready(function() {
    populateDropdown();
});

$(document).on('change', '#tagsDropdown', function() {
    var selectedTagName = $(this).val();
    $('#fieldsContent').empty(); 
    $('#xmlStructureTree').jstree("destroy");
    fetchAndDisplayFieldsContent(selectedTagName); 
});
