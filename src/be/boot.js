#!/usr/bin/env iojs

'use strict';

// Starting point of the application.
// Holds the loaded settings.
// Controls the workers.

var cluster = require('cluster');
var db = require('./db');
var fs = require('fs');
var generator;

var MINIMUM_WORKER_UPTIME = 1000;
var forkTime = {};

var dbSettings;
var generalSettings;
var templateSettings;
var genericThumb;
var fePath;

var args = process.argv;

var debug = args.indexOf('-d') > -1;
debug = debug || args.indexOf('--debug') > -1;

var reload = args.indexOf('-r') > -1;
reload = reload || args.indexOf('--reload') > -1;

var noDaemon = args.indexOf('-nd') > -1;
noDaemon = noDaemon || args.indexOf('--no-daemon') > -1;

var createRoot = args.indexOf('-cr') > -1;
createRoot = createRoot || args.indexOf('--create-root') > -1;

var informedLogin;
var informedPassword;

if (createRoot) {
  var loginIndex = args.indexOf('-l');
  if (loginIndex === -1) {
    loginIndex = args.indexOf('--login');
  }

  var passwordIndex = args.indexOf('-p');
  if (passwordIndex === -1) {
    passwordIndex = args.indexOf('--password');
  }

  passwordIndex++;
  loginIndex++;

  if (passwordIndex && passwordIndex < args.length) {
    informedPassword = args[passwordIndex];
  }

  if (loginIndex && loginIndex < args.length) {
    informedLogin = args[loginIndex];
  }

}

exports.genericThumb = function() {
  return genericThumb;
};

exports.debug = function() {
  return debug;
};

exports.getDbSettings = function() {

  return dbSettings;
};

exports.getGeneralSettings = function() {
  return generalSettings;
};

exports.getTemplateSettings = function() {
  return templateSettings;
};

exports.getFePath = function() {
  return fePath;
};

exports.loadSettings = function() {

  var dbSettingsPath = __dirname + '/settings/db.json';

  dbSettings = JSON.parse(fs.readFileSync(dbSettingsPath));

  var generalSettingsPath = __dirname + '/settings/general.json';

  generalSettings = JSON.parse(fs.readFileSync(generalSettingsPath));

  generalSettings.address = generalSettings.address || '127.0.0.1';
  generalSettings.port = generalSettings.port || 8080;

  fePath = generalSettings.fePath || __dirname + '/../fe';

  var templateSettingsPath = fePath + '/templateSettings.json';

  templateSettings = JSON.parse(fs.readFileSync(templateSettingsPath));

  var thumbExt = templateSettings.thumb.split('.');

  thumbExt = thumbExt[thumbExt.length - 1].toLowerCase();

  genericThumb = '/genericThumb' + '.' + thumbExt;

};

// after everything is all right, call this function to start the workers
function bootWorkers() {

  var genQueue = require('./generationQueue');

  if (noDaemon) {
    db.conn().close();
    return;
  }

  for (var i = 0; i < require('os').cpus().length; i++) {
    cluster.fork();
  }

  cluster.on('fork', function(worker) {

    forkTime[worker.id] = new Date().getTime();

    worker.on('message', function receivedMessage(message) {
      genQueue.queue(message);
    });
  });

  cluster.on('exit', function(worker, code, signal) {
    console.log('Server worker ' + worker.id + ' crashed.');

    if (new Date().getTime() - forkTime[worker.id] < MINIMUM_WORKER_UPTIME) {
      console.log('Crash on boot, not restarting it.');
    } else {
      cluster.fork();
    }

    delete forkTime[worker.id];
  });
}

function regenerateAll() {

  generator.all(function regeneratedAll(error) {
    if (error) {

      if (generalSettings.verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }

    } else {
      bootWorkers();
    }
  });

}

function checkThumb(files) {
  if (files.indexOf(genericThumb) === -1) {
    generator.thumb(function generated(error) {
      if (error) {
        if (generalSettings.verbose) {
          console.log(error);
        }

        if (debug) {
          throw error;
        }

      } else {
        bootWorkers();
      }
    });
  } else {
    bootWorkers();
  }
}

function checkLoginPage(files) {
  if (files.indexOf('/login.html') === -1) {

    generator.login(function generated(error) {
      if (error) {
        if (generalSettings.verbose) {
          console.log(error);
        }

        if (debug) {
          throw error;
        }

      } else {
        checkThumb(files);
      }

    });

  } else {
    checkThumb(files);
  }
}

function checkNotFound(files) {

  if (files.indexOf('/404.html') === -1) {

    generator.notFound(function generated(error) {
      if (error) {
        if (generalSettings.verbose) {
          console.log(error);
        }

        if (debug) {
          throw error;
        }

      } else {
        checkLoginPage(files);
      }

    });

  } else {
    checkLoginPage(files);
  }

}

function checkFrontPage(files) {

  if (files.indexOf('/') === -1) {
    generator.frontPage(function generated(error) {
      if (error) {
        if (generalSettings.verbose) {
          console.log(error);
        }

        if (debug) {
          throw error;
        }

      } else {
        checkNotFound(files);
      }

    });
  } else {
    checkNotFound(files);
  }

}

// we need to check if the default pages can be found
function checkForDefaultPages() {

  generator = require('./engine/generator');
  require('./engine/domManipulator').loadTemplates();

  if (reload) {
    regenerateAll();
    return;
  }

  var files = db.files();

  files.aggregate({
    $match : {
      filename : {
        $in : [ '/', '/404.html', genericThumb, '/login.html' ]
      }
    }
  }, {
    $project : {
      filename : 1,
      _id : 0
    }
  }, {
    $group : {
      _id : 1,
      pages : {
        $push : '$filename'
      }
    }
  }, function gotFiles(error, files) {
    if (error) {
      if (generalSettings.verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }
    } else if (files.length) {
      checkFrontPage(files[0].pages);
    } else {
      regenerateAll();
    }
  });

}

try {
  exports.loadSettings();
} catch (error) {
  if (generalSettings.verbose) {
    console.log(error);
  }

  if (debug) {
    throw error;
  }
  return;
}

if (cluster.isMaster) {

  db.init(function bootedDb(error) {

    if (error) {
      if (generalSettings.verbose) {
        console.log(error);
      }

      if (debug) {
        throw error;
      }
    } else if (createRoot) {

      // style exception, too simple
      require('./engine/accountOps').registerUser({
        login : informedLogin,
        password : informedPassword
      }, function createdUser(error) {

        if (error) {

          if (generalSettings.verbose) {
            console.log(error);
          }

          if (debug) {
            throw error;
          }
          checkForDefaultPages();

        } else {
          console.log('Root account ' + informedLogin + ' created.');

          checkForDefaultPages();
        }

      }, 0);
      // style exception, too simple

    } else {
      checkForDefaultPages();
    }

  });

} else {

  require('./workerBoot').boot();
}
