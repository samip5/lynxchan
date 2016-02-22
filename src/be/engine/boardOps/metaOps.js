'use strict';

// handles board operations on the board themselves

var crypto = require('crypto');
var boardFieldsToCheck = [ 'boardName', 'boardMessage', 'boardDescription' ];
var forcedCaptcha;
var db = require('../../db');
var reports = db.reports();
var bans = db.bans();
var users = db.users();
var boards = db.boards();
var captchaOps;
var logOps;
var postingOps;
var miscOps;
var modCommonOps;
var lang;
var maxBoardTags;
var overboard;
var sfwOverboard;
var globalBoardModeration;
var boardCreationRequirement;
var maxVolunteers;
var allowedMimes;
var rangeSettings;

var defaultSettings = [ 'disableIds' ];

var boardParameters = [ {
  field : 'boardUri',
  length : 32
}, {
  field : 'boardName',
  length : 32,
  removeHTML : true
}, {
  field : 'anonymousName',
  length : 32,
  removeHTML : true
}, {
  field : 'boardDescription',
  length : 128,
  removeHTML : true
}, {
  field : 'boardMessage',
  length : 256
} ];

var transferParameters = [ {
  field : 'login',
  length : 16
} ];

exports.loadSettings = function() {

  var settings = require('../../settingsHandler').getGeneralSettings();
  forcedCaptcha = settings.forceCaptcha;
  globalBoardModeration = settings.allowGlobalBoardModeration;
  boardCreationRequirement = settings.boardCreationRequirement;
  maxVolunteers = settings.maxBoardVolunteers;
  maxBoardTags = settings.maxBoardTags;
  overboard = settings.overboard;
  sfwOverboard = settings.sfwOverboard;
  allowedMimes = settings.acceptedMimes;

};

exports.loadDependencies = function() {

  logOps = require('../logOps');
  captchaOps = require('../captchaOps');
  postingOps = require('../postingOps').common;
  miscOps = require('../miscOps');
  modCommonOps = require('../modOps').common;
  lang = require('../langOps').languagePack();

  var dynamicPages = require('../domManipulator').dynamicPages;
  rangeSettings = dynamicPages.managementPages.boardRangeSettingsRelation;
};

exports.getValidSettings = function() {
  return [ 'disableIds', 'forceAnonymity', 'allowCode', 'early404', 'unindex',
      'blockDeletion', 'requireThreadFile', 'uniqueFiles', 'uniquePosts',
      'locationFlags' ];
};

exports.getValidSpecialSettings = function() {
  return [ 'sfw' ];
};

// Section 1: New settings {
exports.captchaOrAnonimityChanged = function(board, params) {

  var oldSettings = board.settings;
  var newSettings = params.settings;

  var captchaChanged = board.captchaMode !== +params.captchaMode;

  var hadAnon = oldSettings.indexOf('forceAnonymity') === -1;
  var hasAnon = newSettings.indexOf('forceAnonymity') === -1;

  var anonChanged = hadAnon !== hasAnon;

  return anonChanged || (captchaChanged && !forcedCaptcha);

};

exports.fieldsChanged = function(board, params) {

  for (var i = 0; i < boardFieldsToCheck.length; i++) {
    var field = boardFieldsToCheck[i];

    if (board[field] || params[field]) {
      if (board[field] !== params[field]) {
        return true;
      }
    }
  }

  return false;
};

exports.checkBoardRebuild = function(board, params) {

  var didFieldsChanged = exports.fieldsChanged(board, params);

  var settingsChanged = exports.captchaOrAnonimityChanged(board, params);

  if (didFieldsChanged || settingsChanged) {

    process.send({
      board : params.boardUri,
      buildAll : true
    });

  }

  if (board.boardName !== params.boardName) {
    process.send({
      frontPage : true
    });
  }

};

exports.getMessageMarkdown = function(message) {
  if (!message) {
    return null;
  }

  var ret = message.replace(/[<>]/g, function replace(match) {
    return miscOps.htmlReplaceTable[match];
  });

  ret = ret.replace(/\[.+?\]\(.+?\)/g, function prettyLinks(match) {
    var matchesArray = match.match(/\[(.+)\]\((.+)\)/);

    return '<a href=\"' + matchesArray[2] + '\">' + matchesArray[1] + '</a>';
  });

  ret = postingOps.replaceStyleMarkdown(ret);

  return ret;

};

exports.setUpdateForAutoCaptcha = function(parameters, newSettings,
    updateBlock, board) {

  var informedAutoCaptcha = +parameters.autoCaptchaLimit;

  informedAutoCaptcha = informedAutoCaptcha && informedAutoCaptcha !== Infinity;

  if (informedAutoCaptcha) {
    newSettings.autoCaptchaThreshold = +parameters.autoCaptchaLimit;
  } else if (board.autoCaptchaThreshold) {
    if (!updateBlock.$unset) {
      updateBlock.$unset = {};
    }

    updateBlock.$unset.autoCaptchaCount = 1;
    updateBlock.$unset.autoCaptchaStartTime = 1;
    updateBlock.$unset.autoCaptchaThreshold = 1;

  }
};

exports.sanitizeBoardTags = function(tags) {

  if (!tags || !tags.length) {
    return [];
  }

  var toRet = [];

  var replaceFunction = function replace(match) {
    return miscOps.replaceTable[match];
  };

  for (var i = 0; i < tags.length && toRet.length < maxBoardTags; i++) {
    var tagToAdd = tags[i].toString().trim().replace(/[<>]/g, replaceFunction)
        .toLowerCase().substring(0, 32);

    if (tagToAdd.length && toRet.indexOf(tagToAdd) === -1) {
      toRet.push(tagToAdd);
    }
  }

  return toRet;
};

exports.sanitizeBoardMimes = function(mimes) {

  if (!mimes || !mimes.length) {
    return null;
  }

  var toRet = [];

  for (var i = 0; i < mimes.length; i++) {
    var tagToAdd = mimes[i].toString().trim().toLowerCase();

    if (toRet.indexOf(tagToAdd) === -1 && allowedMimes.indexOf(tagToAdd) >= 0) {
      toRet.push(tagToAdd);
    }
  }

  if (toRet.length && miscOps.arraysDiff(allowedMimes, toRet)) {
    return toRet;
  } else {
    return null;
  }

};

exports.saveNewSettings = function(board, parameters, callback) {

  var newSettings = {
    boardName : parameters.boardName,
    boardDescription : parameters.boardDescription,
    settings : parameters.settings,
    boardMessage : parameters.boardMessage,
    boardMarkdown : exports.getMessageMarkdown(parameters.boardMessage),
    anonymousName : parameters.anonymousName || '',
    tags : exports.sanitizeBoardTags(parameters.tags),
    acceptedMimes : exports.sanitizeBoardMimes(parameters.acceptedMimes),
    autoSageLimit : +parameters.autoSageLimit,
    maxThreadCount : +parameters.maxThreadCount,
    maxFileSizeMB : +parameters.maxFileSizeMB,
    maxFiles : +parameters.maxFiles,
    captchaMode : +parameters.captchaMode
  };

  var updateBlock = {
    $set : newSettings
  };

  var informedHourlyLimit = +parameters.hourlyThreadLimit;

  informedHourlyLimit = informedHourlyLimit && informedHourlyLimit !== Infinity;

  if (informedHourlyLimit) {
    newSettings.hourlyThreadLimit = +parameters.hourlyThreadLimit;
  } else if (board.hourlyThreadLimit) {
    updateBlock.$unset = {
      lockedUntil : 1,
      threadLockCount : 1,
      lockCountStart : 1,
      hourlyThreadLimit : 1
    };
  }

  exports.setUpdateForAutoCaptcha(parameters, newSettings, updateBlock, board);

  boards.updateOne({
    boardUri : parameters.boardUri
  }, updateBlock, function updatedBoard(error) {

    exports.checkBoardRebuild(board, parameters);

    callback(error);

  });

};

exports.setSettings = function(userData, parameters, callback) {

  parameters.boardUri = parameters.boardUri.toString();

  boards.findOne({
    boardUri : parameters.boardUri
  }, function(error, board) {

    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (!modCommonOps.isInBoardStaff(userData, board, 2)) {
      callback(lang.errDeniedChangeBoardSettings);
    } else {
      miscOps.sanitizeStrings(parameters, boardParameters);

      exports.saveNewSettings(board, parameters, callback);

    }

  });

};
// } Section 1: New settings

// Section 2: Transfer {
exports.updateUsersOwnedBoards = function(oldOwner, parameters, callback) {

  users.updateOne({
    login : oldOwner
  }, {
    $pull : {
      ownedBoards : parameters.boardUri
    }
  }, function removedFromPreviousOwner(error) {
    if (error) {
      callback(error);

    } else {

      // style exception, too simple
      users.updateOne({
        login : parameters.login
      }, {
        $addToSet : {
          ownedBoards : parameters.boardUri
        }
      }, function addedToNewOwner(error) {
        callback(error);
      });
      // style exception, too simple

    }
  });

};

exports.logTransfer = function(userData, parameters, oldOwner, callback) {

  var message = lang.logTransferBoard.replace('{$actor}', userData.login)
      .replace('{$board}', parameters.boardUri).replace('{$login}',
          parameters.login);

  logOps.insertLog({
    user : userData.login,
    time : new Date(),
    global : true,
    boardUri : parameters.boardUri,
    type : 'boardTransfer',
    description : message
  }, function createdLog() {
    exports.updateUsersOwnedBoards(oldOwner, parameters, callback);
  });

};

exports.performTransfer = function(oldOwner, userData, parameters, callback) {

  boards.updateOne({
    boardUri : parameters.boardUri
  }, {
    $set : {
      owner : parameters.login
    },
    $pull : {
      volunteers : parameters.login
    }
  }, function transferedBoard(error) {
    if (error) {
      callback(error);
    } else if (oldOwner !== userData.login) {
      exports.logTransfer(userData, parameters, oldOwner, callback);
    } else {
      exports.updateUsersOwnedBoards(oldOwner, parameters, callback);
    }

  });

};

exports.transfer = function(userData, parameters, callback) {

  var admin = userData.globalRole < 2;

  parameters.boardUri = parameters.boardUri.toString();

  boards.findOne({
    boardUri : parameters.boardUri
  }, {
    _id : 0,
    owner : 1
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (userData.login !== board.owner && !admin) {
      callback(lang.errDeniedBoardTransfer);
    } else if (board.owner === parameters.login) {
      callback();
    } else {

      miscOps.sanitizeStrings(parameters, transferParameters);

      // style exception, too simple
      users.findOne({
        login : parameters.login
      }, function gotUser(error, user) {
        if (error) {
          callback(error);
        } else if (!user) {
          callback(lang.errUserNotFound);
        } else {
          exports.performTransfer(board.owner, userData, parameters, callback);
        }
      });
      // style exception, too simple

    }

  });

};
// } Section 2: Transfer

// Section 3: Volunteer management {
exports.manageVolunteer = function(currentVolunteers, parameters, callback) {

  var isAVolunteer = currentVolunteers.indexOf(parameters.login) > -1;

  if (parameters.add === isAVolunteer) {
    callback();
  } else if (!isAVolunteer && currentVolunteers.length >= maxVolunteers) {
    callback(lang.errMaxBoardVolunteers);
  } else {

    var operation;
    var userOperation;

    if (isAVolunteer) {
      operation = {
        $pull : {
          volunteers : parameters.login
        }
      };

      userOperation = {
        $pull : {
          volunteeredBoards : parameters.boardUri
        }
      };

    } else {
      operation = {
        $addToSet : {
          volunteers : parameters.login
        }
      };

      userOperation = {
        $addToSet : {
          volunteeredBoards : parameters.boardUri
        }
      };

    }

    users.findOneAndUpdate({
      login : parameters.login
    }, userOperation, function gotUser(error, result) {
      if (error) {
        callback(error);
      } else if (!result.value && !isAVolunteer) {
        callback(lang.errUserNotFound);
      } else {

        // style exception, too simple
        boards.updateOne({
          boardUri : parameters.boardUri
        }, operation, function updatedVolunteers(error) {
          callback(error);
        });
        // style exception, too simple

      }
    });

  }

};

exports.setVolunteer = function(userData, parameters, callback) {

  var globallyAllowed = userData.globalRole <= 1 && globalBoardModeration;

  parameters.add = parameters.add ? true : false;

  parameters.boardUri = parameters.boardUri.toString();

  boards.findOne({
    boardUri : parameters.boardUri
  }, {
    _id : 0,
    owner : 1,
    volunteers : 1
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else if (board.owner !== userData.login && !globallyAllowed) {
      callback(lang.errDeniedSetVolunteer);
    } else if (parameters.login === board.owner) {
      callback(lang.errOwnerVolunteer);
    } else {
      exports.manageVolunteer(board.volunteers || [], parameters, callback);
    }
  });

};
// } Section 3: Volunteer management

// Section 4: Creation {
exports.insertBoard = function(parameters, userData, callback) {

  boards.insertOne({
    boardUri : parameters.boardUri,
    boardName : parameters.boardName,
    ipSalt : crypto.createHash('sha256').update(
        parameters.toString() + Math.random() + new Date()).digest('hex'),
    boardDescription : parameters.boardDescription,
    owner : userData.login,
    settings : defaultSettings,
    uniqueIps : 0,
    lastPostId : 0,
    captchaMode : 0,
    postsPerHour : 0
  }, function insertedBoard(error) {
    if (error && error.code !== 11000) {
      callback(error);
    } else if (error) {
      callback(lang.errUriInUse);
    } else {

      // style exception, too simple
      users.updateOne({
        login : userData.login
      }, {
        $addToSet : {
          ownedBoards : parameters.boardUri
        }
      }, function updatedUser(error) {
        // signal rebuild of board pages
        process.send({
          board : parameters.boardUri,
          buildAll : true
        });

        callback(error);
      });
      // style exception, too simple

    }
  });

};

exports.createBoard = function(captchaId, parameters, userData, callback) {

  var allowed = userData.globalRole <= boardCreationRequirement;

  if (!allowed && boardCreationRequirement <= miscOps.getMaxStaffRole()) {
    callback(lang.errDeniedBoardCreation);
    return;
  }

  miscOps.sanitizeStrings(parameters, boardParameters);

  var reservedUris = [ overboard, sfwOverboard ];

  if (/\W/.test(parameters.boardUri)) {
    callback(lang.errInvalidUri);
    return;
  } else if (reservedUris.indexOf(parameters.boardUri) > -1) {
    callback(lang.errUriInUse);
    return;
  }

  captchaOps.attemptCaptcha(captchaId, parameters.captcha, null,
      function solvedCaptcha(error) {

        if (error) {
          callback(error);
        } else {
          exports.insertBoard(parameters, userData, callback);
        }

      });

};
// } Section 4: Creation

// Section 5: Board management {
exports.getAppealedBans = function(boardData, reports, callback) {

  bans.find({
    boardUri : boardData.boardUri,
    appeal : {
      $exists : true
    },
    denied : {
      $exists : false
    }
  }, {
    reason : 1,
    appeal : 1,
    denied : 1,
    expiration : 1,
    appliedBy : 1
  }).toArray(function gotBans(error, foundBans) {
    callback(error, boardData, reports, foundBans);
  });

};

exports.getBoardReports = function(boardData, callback) {

  reports.find({
    boardUri : boardData.boardUri,
    closedBy : {
      $exists : false
    },
    global : false
  }, {
    boardUri : 1,
    threadId : 1,
    creation : 1,
    postId : 1,
    reason : 1
  }).sort({
    creation : -1
  }).toArray(function(error, foundReports) {

    if (error) {
      callback(error);
    } else {
      exports.getAppealedBans(boardData, foundReports, callback);
    }

  });

};

exports.getBoardManagementData = function(userData, board, callback) {

  boards.findOne({
    boardUri : board
  }, {
    _id : 0,
    tags : 1,
    owner : 1,
    settings : 1,
    maxFiles : 1,
    boardUri : 1,
    boardName : 1,
    volunteers : 1,
    captchaMode : 1,
    boardMessage : 1,
    autoSageLimit : 1,
    anonymousName : 1,
    acceptedMimes : 1,
    maxFileSizeMB : 1,
    maxThreadCount : 1,
    boardDescription : 1,
    usesCustomSpoiler : 1,
    hourlyThreadLimit : 1,
    autoCaptchaThreshold : 1

  }, function(error, boardData) {
    if (error) {
      callback(error);
    } else if (!boardData) {
      callback(lang.errBoardNotFound);
    } else if (modCommonOps.isInBoardStaff(userData, boardData)) {
      exports.getBoardReports(boardData, callback);
    } else {
      callback(lang.errDeniedManageBoard);
    }
  });

};
// } Section 5: Board management

exports.getBoardModerationData = function(userData, boardUri, callback) {

  var admin = userData.globalRole < 2;

  if (!admin) {
    callback(lang.errDeniedBoardMod);
    return;
  }

  boards.findOne({
    boardUri : boardUri
  }, function gotBoard(error, board) {
    if (error) {
      callback(error);
    } else if (!board) {
      callback(lang.errBoardNotFound);
    } else {

      // style exception, too simple
      users.findOne({
        login : board.owner
      }, function gotOwner(error, user) {
        callback(error, board, user);
      });
      // style exception, too simple
    }
  });
};

exports.setSpecialSettings = function(userData, parameters, callback) {

  var admin = userData.globalRole < 2;

  if (!admin) {
    callback(lang.errDeniedBoardMod);
    return;
  }

  boards.findOneAndUpdate({
    boardUri : parameters.boardUri
  }, {
    $set : {
      specialSettings : parameters.specialSettings
    }
  }, function gotBoard(error, result) {

    if (error) {
      callback(error);
    } else if (!result.value) {
      callback(lang.errBoardNotFound);
    } else {
      callback();
    }

  });

};