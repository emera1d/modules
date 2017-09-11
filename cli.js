'use strict';

const mPath = require('path');
const mFs = require('fs');

const ModuleManager = require('./moduleManager.js');

const cmd = (process.argv[2] || '').replace(/\/+$/, '');
const basePath = (process.argv[3] || '').replace(/\/+$/, '');


class Cli {
    init(path) {
        if(path) {
            this._resolved = mPath.resolve(path);
        }

        this._commands = {
            reqursion: this._cmdFindRequrions,
            path: this._cmdCheckPaths
        };

        return this;
    }

    run(cmd) {
        if(this._commands.hasOwnProperty(cmd)) {
            this._commands[cmd].call(this);
        } else {
            this._cmdHelp(cmd);
        }

        return this;
    }

    _checkPath() {
        if(!this._resolved) {
            console.log('Specify the path to your files');
            return false;
        }

        if(!mFs.existsSync(this._resolved)) {
            console.log(`Path does not exist: "${this._resolved}"`);
            return false;
        }

        return true;
    }

    _cmdFindRequrions() {
        if(this._checkPath()) {
            let manager = new ModuleManager();
            manager.findReqursions(this._resolved, function(result) {
                if(result) {
                    for(var key in result) {
                        console.log('\n@ Reqursion in', result[key].path, result[key].stack.map(function(value, index) {
                            return '\n\t' + (index+1) + '. ' + value;
                        }).join(''));
                    }
                } else {
                    console.log('Good boy');
                }
            });
        }
    }

    _cmdCheckPaths() {
        if(this._checkPath()) {
            let manager = new ModuleManager();
            manager.findInvalidPaths(this._resolved);
        }
    }

    _cmdHelp(cmd) {
        var cmdList = Object.keys(this._commands);

        console.log('%s: command not found \'\'.\n\nUsage: cli [COMMAND] [PATH]\n\nCommands:\n\t%s', cmd, cmdList.join('\n\t'));
    }
}

new Cli()
    .init(basePath)
    .run(cmd);
