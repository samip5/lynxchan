'use strict';

var boot = require('../boot');
var debug = boot.debug();
var settings = boot.getGeneralSettings();
var verbose = settings.verbose;
var fs = require('fs');
var jsdom = require('jsdom').jsdom;

require('jsdom').defaultDocumentFeatures = {
  FetchExternalResources : false,
  ProcessExternalResources : false,
  // someone said it might break stuff. If weird bugs, disable.
  MutationEvents : false
};

function testPageFields(document, page, errors) {

  var error = '';

  for (var j = 0; j < page.fields.length; j++) {

    var field = page.fields[j];

    if (!document.getElementById(field)) {
      error += '\nError, missing element with id ' + field;
    }

  }

  return error;
}

function loadPages(errors, templatesPath, templateSettings, pages) {

  for (var i = 0; i < pages.length; i++) {

    var page = pages[i];

    var fullPath = templatesPath + templateSettings[page.template];

    try {
      var template = fs.readFileSync(fullPath);
    } catch (error) {
      console.log('Error loading ' + page.template + '.');
      throw error;
    }

    exports[page.template] = template;

    var document = jsdom(template);

    var error = testPageFields(document, page, errors);

    if (error.length) {

      errors.push('\nPage ' + page.template + error);
    }

  }

}

function getTestCell(document, templateName, fePath, templateSettings) {

  var toReturn = document.createElement('div');

  var fullPath = fePath + templateSettings[templateName];

  try {
    var template = fs.readFileSync(fullPath);
  } catch (error) {
    console.log('Error loading ' + templateName + '.');
    throw error;
  }

  exports[templateName] = template;

  toReturn.innerHTML = template;

  return toReturn;
}

function testCell(document, templatesPath, templateSettings, cell) {
  var error = '';

  var cellElement = getTestCell(document, cell.template, templatesPath,
      templateSettings);

  for (var j = 0; j < cell.fields.length; j++) {

    var field = cell.fields[j];

    if (!cellElement.getElementsByClassName(field).length) {
      error += '\nError, missing element with class ' + field;
    } else if (cellElement.getElementsByClassName(field).length > 1) {
      error += '\nWarning, more than one element with class ' + field;
    }

  }

  return error;
}

function loadCells(errors, templatesPath, templateSettings, cells) {

  var document = jsdom('<html></html>');

  for (var i = 0; i < cells.length; i++) {

    var cell = cells[i];

    var errorFound = false;

    var error = testCell(document, templatesPath, templateSettings, cell);

    if (error.length) {
      errors.push('\nCell ' + cell.template + error);
    }

  }

}

function loadAndTestTemplates(path, templateSettings) {

  var cellTests = [
      {
        template : 'catalogCell',
        fields : [ 'linkThumb', 'labelReplies', 'labelImages', 'labelPage',
            'labelSubject', 'divMessage', 'lockIndicator', 'pinIndicator',
            'cyclicIndicator' ]
      },
      {
        template : 'bannerCell',
        fields : [ 'bannerImage', 'bannerIdentifier' ]
      },
      {
        template : 'opCell',
        fields : [ 'linkName', 'panelUploads', 'labelSubject', 'labelCreated',
            'divMessage', 'linkReply', 'linkSelf', 'deletionCheckBox',
            'lockIndicator', 'pinIndicator', 'labelId', 'labelRole',
            'divBanMessage', 'spanId', 'panelRange', 'labelRange',
            'cyclicIndicator' ]
      },
      {
        template : 'postCell',
        fields : [ 'linkName', 'panelUploads', 'labelSubject', 'labelCreated',
            'divMessage', 'linkSelf', 'deletionCheckBox', 'labelId',
            'labelRole', 'divBanMessage', 'spanId', 'panelRange', 'labelRange' ]
      },
      {
        template : 'staffCell',
        fields : [ 'userIdentifier', 'userLabel', 'roleCombo' ]
      },
      {
        template : 'volunteerCell',
        fields : [ 'boardIdentifier', 'userIdentifier', 'userLabel' ]
      },
      {
        template : 'reportCell',
        fields : [ 'reasonLabel', 'link', 'idIdentifier' ]
      },
      {
        template : 'closedReportCell',
        fields : [ 'reasonLabel', 'link', 'closedByLabel', 'closedDateLabel' ]
      },
      {
        template : 'banCell',
        fields : [ 'reasonLabel', 'expirationLabel', 'appliedByLabel',
            'boardLabel', 'idLabel' ]
      },
      {
        template : 'logCell',
        fields : [ 'indicatorGlobal', 'labelUser', 'labelTime',
            'labelDescription', 'labelBoard', 'labelType' ]
      },
      {
        template : 'filterCell',
        fields : [ 'labelOriginal', 'labelReplacement', 'boardIdentifier',
            'filterIdentifier' ]
      },
      {
        template : 'boardsCell',
        fields : [ 'linkBoard', 'labelPostsPerHour', 'labelPostCount',
            'divDescription' ]
      }, {
        template : 'rangeBanCell',
        fields : [ 'rangeLabel', 'idIdentifier' ]
      }, {
        template : 'hashBanCell',
        fields : [ 'hashLabel', 'idIdentifier' ]
      }, {
        template : 'uploadCell',
        fields : [ 'infoLabel', 'imgLink', 'nameLink', 'divHash', 'labelHash' ]
      } ];

  var pageTests = [
      {
        template : 'loginPage',
        fields : [ 'divCreation' ]
      },
      {
        template : 'catalogPage',
        fields : [ 'divThreads', 'labelBoard' ]
      },
      {
        template : 'resetEmail',
        fields : [ 'labelNewPass' ]
      },
      {
        template : 'bannerManagementPage',
        fields : [ 'bannersDiv', 'boardIdentifier' ]
      },
      {
        template : 'errorPage',
        fields : [ 'codeLabel', 'errorLabel' ]
      },
      {
        template : 'recoveryEmail',
        fields : [ 'linkRecovery' ]
      },
      {
        template : 'index',
        fields : [ 'divBoards' ]
      },
      {
        template : 'boardPage',
        fields : [ 'labelName', 'labelDescription', 'divPostings', 'divPages',
            'boardIdentifier', 'linkManagement', 'bannerImage', 'captchaDiv',
            'divName', 'linkModeration', 'labelMaxFileSize' ]
      },
      {
        template : 'threadPage',
        fields : [ 'labelName', 'labelDescription', 'divPostings',
            'boardIdentifier', 'linkManagement', 'threadIdentifier', 'linkMod',
            'inputBan', 'divBanInput', 'divControls', 'controlBoardIdentifier',
            'controlThreadIdentifier', 'checkboxLock', 'checkboxPin',
            'bannerImage', 'captchaDiv', 'divName', 'labelMaxFileSize',
            'checkboxCyclic' ]
      },
      {
        template : 'messagePage',
        fields : [ 'labelMessage', 'linkRedirect' ]
      },
      {
        template : 'accountPage',
        fields : [ 'labelLogin', 'boardsDiv', 'emailField',
            'globalManagementLink', 'boardCreationDiv', 'checkboxAlwaysSign' ]
      },
      {
        template : 'banPage',
        fields : [ 'boardLabel', 'reasonLabel', 'expirationLabel', 'idLabel' ]
      },
      {
        template : 'gManagement',
        fields : [ 'divStaff', 'userLabel', 'addStaffForm', 'newStaffCombo',
            'reportDiv', 'bansLink', 'rangeBansLink', 'hashBansLink' ]
      },
      {
        template : 'bManagement',
        fields : [ 'volunteersDiv', 'boardLabel', 'ownerControlDiv',
            'addVolunteerBoardIdentifier', 'transferBoardIdentifier',
            'deletionIdentifier', 'reportDiv', 'closedReportsLink', 'bansLink',
            'bannerManagementLink', 'boardNameField', 'boardDescriptionField',
            'boardSettingsIdentifier', 'disableIdsCheckbox',
            'disableCaptchaCheckbox', 'forceAnonymityCheckbox',
            'filterManagementLink', 'anonymousNameField', 'rangeBansLink',
            'hashBansLink' ]
      },
      {
        template : 'closedReportsPage',
        fields : [ 'reportDiv' ]
      },
      {
        template : 'bansPage',
        fields : [ 'bansDiv' ]
      },
      {
        template : 'logsPage',
        fields : [ 'divLogs', 'divPages', 'checkboxExcludeGlobals',
            'fieldBoard', 'comboboxType', 'fieldBefore', 'fieldAfter',
            'fieldUser' ]
      },
      {
        template : 'previewPage',
        fields : [ 'panelContent' ]
      },
      {
        template : 'filterManagement',
        fields : [ 'divFilters', 'boardIdentifier' ]
      },
      {
        template : 'boardModerationPage',
        fields : [ 'boardTransferIdentifier', 'boardDeletionIdentifier',
            'labelTitle', 'labelOwner' ]
      },
      {
        template : 'boardsPage',
        fields : [ 'divBoards', 'divPages' ]
      },
      {
        template : 'noCookieCaptchaPage',
        fields : [ 'divSolvedCaptcha', 'labelCaptchaId', 'inputCaptchaId',
            'imageCaptcha' ]
      }, {
        template : 'rangeBansPage',
        fields : [ 'rangeBansDiv', 'boardIdentifier' ]
      }, {
        template : 'rangeBanPage',
        fields : [ 'boardLabel', 'rangeLabel' ]
      }, {
        template : 'hashBansPage',
        fields : [ 'hashBansDiv', 'boardIdentifier' ]
      } ];

  var errors = [];

  loadCells(errors, path, templateSettings, cellTests);

  loadPages(errors, path, templateSettings, pageTests);

  if (errors.length) {

    console.log('Were found issues with templates.');

    if (verbose) {

      for (var i = 0; i < errors.length; i++) {

        var error = errors[i];

        console.log(error);

      }
    } else {
      console.log('Enable verbose mode to output them.');
    }

    if (debug) {
      throw 'Fix the issues on the templates or run without debug mode';
    }

  }
}

exports.loadTemplates = function() {

  var fePath = boot.getFePath() + '/templates/';
  var templateSettings = boot.getTemplateSettings();

  loadAndTestTemplates(fePath, templateSettings);
};