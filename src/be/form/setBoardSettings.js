'use strict';

var formOps = require('../engine/formOps');
var boardOps = require('../engine/boardOps').meta;
var lang = require('../engine/langOps').languagePack();
var mandatoryParameters = [ 'boardUri', 'boardName', 'boardDescription' ];
var possibleSettings = boardOps.getValidSettings();

function setBoardSettings(userData, parameters, res, auth) {

  if (formOps.checkBlankParameters(parameters, mandatoryParameters, res)) {
    return;
  }

  var desiredSettings = [];

  for (var i = 0; i < possibleSettings.length; i++) {

    var setting = possibleSettings[i];

    if (parameters[setting]) {
      desiredSettings.push(setting);
    }

  }

  parameters.settings = desiredSettings;

  if (parameters.tags) {
    parameters.tags = parameters.tags.split(',');
  }

  if (parameters.acceptedMimes) {
    parameters.acceptedMimes = parameters.acceptedMimes.split(',');
  }

  boardOps.setSettings(userData, parameters, function settingsSaved(error) {
    if (error) {
      formOps.outputError(error, 500, res);
    } else {
      var redirect = '/boardManagement.js?boardUri=' + parameters.boardUri;

      formOps.outputResponse(lang.msgBoardSettingsSaved, redirect, res, null,
          auth);
    }

  });

}

exports.process = function(req, res) {

  formOps.getAuthenticatedPost(req, res, true, function gotData(auth, userData,
      parameters) {

    setBoardSettings(userData, parameters, res, auth);

  });

};