const fs = require('fs');
const mPath = require('path');

const CTree = require('./lib/tree.js');
const CDebug = require('./lib/debug.js');

module.exports = class CDependentManager {

    constructor () {
        this.basePath = null;
        this.checkingPath = null;

        this.trees = {};
    }

    clear() {
        this.trees = {};
    }

/* Requirsion */
    findReqursions(path, onFindComplete) {
        this._buildTree(path, this._onBuildTreeForRequirsionCheck.bind(this, onFindComplete));
    }

    _onBuildTreeForRequirsionCheck(onFindComplete, tree) {
        let scope = this._reqursionScope = {
            requiresMap: {},
            badFile: {},
            requiresStack: [],
            filesList: null
        };
        let result;

        scope.requiresMap = this._makeMapPath2Requires(tree);
        scope.filesList = Object.keys(scope.requiresMap);

        console.log('Total files: ' + scope.filesList.length);

        for(let i = 0; i < scope.filesList.length; i++) {
            this._checkReqursion(scope.filesList[i]);
        }

        onFindComplete(this._reqursionScope.badFile);
    }

    _checkReqursion(filePath) {
        let requireList;
        let requiredPath;
        let result;

        let scope = this._reqursionScope;

        if(!scope.requiresMap.hasOwnProperty(filePath)) {
            return true;
        }

        requireList = scope.requiresMap[filePath];

        for(let i = 0; i < requireList.length; i++ ) {
            requiredPath = requireList[i].path;

            // Already in stack
            if(scope.requiresStack.indexOf(requiredPath) != -1) {
                if(scope.badFile[requiredPath]) {

                } else {
                    scope.badFile[requiredPath] = {
                        path: requiredPath,
                        stack: scope.requiresStack.slice(0)
                    };
                }

                return false;
            }

            scope.requiresStack.push(requiredPath);
            result = this._checkReqursion(requiredPath);
            scope.requiresStack.pop();

            if(result){
                delete scope.requiresMap[requiredPath];
            } else {
                return result;
            }
        }

        return true;
    }

    _makeMapPath2Requires(tree) {
        let requiresMap = {};

        CTree.eachLeaf(tree, (item, itemPath) =>{
            if(item.requires && item.requires.length) {
                requiresMap[itemPath + '/' + item.name] = item.requires;
            }
        });

        return requiresMap;
    }

/* Invalid paths */
    findInvalidPaths(basePath) {
        this.basePath = basePath.replace(/\/$/, '');

        this._buildTree(basePath, (tree) => {
            let list = this._findInvalidPaths(tree);

            console.log('Invalid paths: ' + list.length);
            console.log(list.map((item) => {
                return item.srcFile + ':' + item.line + '\n' + item.requirePath;
            }).join('\n\n'));
        });
    }

    _findInvalidPaths(tree) {
        let list = [];
        let scope = {
            filesMap: {},
            filesList: []
        };

        scope.filesMap = this._makeLeafMap(tree);
        scope.filesList = Object.keys(scope.filesMap);

        CTree.eachLeaf(tree, (item, itemPath) => {
            if(item.requires && item.requires.length) {
                let badRequire = item.requires.filter((require) => {
                    return scope.filesList.indexOf(require.path) == -1
                        && scope.filesList.indexOf(require.path + '.js') == -1; // TODO .js
                });

                if(badRequire.length > 0) {
                    list = list.concat(badRequire.map((require) => {
                        return {
                            srcFile: itemPath + '/' + item.name,
                            requirePath: require.path,
                            line: require.line
                        };
                    }));
                }
            }
        });

        return list;
    }

    _makeLeafMap(tree) {
        let list = {};

        CTree.eachLeaf(tree, (item, itemPath) =>{
            list[itemPath + '/' + item.name] = null;
        });

        return list;
    }

/* Dependencies */
    findDependant(basePath, checkingPath, onCollect) {
        this.basePath = basePath.replace(/\/$/, '');
        this.checkingPath = checkingPath;

        this._buildTree(basePath, (tree) => {
            let dependents = this._findDependent(tree, this.checkingPath);
            onCollect(dependents);
        });
    }

    _findDependent(tree, filePath) {
        let list = [];

        CTree.eachLeaf(tree, (item, itemPath) => {
            if(item.requires && item.requires.length) {
                let matched = item.requires.filter((require) => {
                    return require.path == filePath;
                });

                if(matched.length > 0) {
                    list = list.concat(matched.map((match) => {
                        return {
                            path: itemPath + '/' + item.name,
                            line: match.line
                        };
                    }));
                }
            }
        });

        return list;
    }

/*
    Check double require
 */
    checkDoubling(basePath) {
        for(var path in this.trees) {
            this._checkDoubling(this.trees[path].tree);
        }
    }

    _checkDoubling(tree) {
        CTree.eachLeaf(tree, (item, path) => {
            if(item.requires) {
                let list = item.requires.slice(0).map((item) => item.path);

                while(list.length) {
                    let require = list.pop();
                    if(list.indexOf(require) != -1) {
                        console.log(item.name, require);
                    }
                }
            }
        });
    }

/* Tree (requires) */
    _buildTree(basePath, _onBuildTree) {
        let fsTree = new CTree();

        fsTree.setFolderFilter(/node_modules/);
        fsTree.setFileFilter(/\.js$/);

        let dbg = new CDebug().start();
        if(this.trees[basePath] && this.trees[basePath].processed) {
            console.log('Tree build in: %s (%s)', dbg.stop(), basePath);
            _onBuildTree(this.trees[basePath].tree);
        } else {
            fsTree.getTree(basePath, (tree) => {
                this.trees[basePath] = {
                    tree: tree,
                    processed: false
                };

                this._processTree(this.trees[basePath].tree, (tree) => {
                    this.trees[basePath].processed = true;
                    console.log('Tree build in: %s ms (%s)', dbg.stop(), basePath);
                    _onBuildTree(tree);
                });
            });
        }    
    }

    _processTree(tree, onProcessingReady) {
        let items = [];

        CTree.eachLeaf(tree, (item, path) => {
            // items.push(this._collectRequires.bind(this, path, item));
            items.push(this._getCollectRequiresWorker(path, item));
        });

        let packSize = 500;
        let step = 0;

        function next() {
            var workers = items.slice(step*packSize, (step+1)*packSize);

            Promise.all(workers)
                .then(
                    function(result) { 
                        step += 1;

                        if(step*packSize < items.length) {
                            next();
                        } else {
                            onProcessingReady(tree);
                        }
                    }, function(reason) {
                        console.log(reason);
                        // error.code == "EACCES"
                        // User does not have permissions, ignore directory
                    }
                );
        }

        console.log('Processing %s items (PackSize: %s)', items.length, packSize);

        if(items.length > 0) {
            next();
        }
    }

    _getCollectRequiresWorker(directory, item) {
        return new Promise(function(resolve, reject) {
            this._collectRequires(directory, item, resolve);
        }.bind(this));
    }

    _collectRequires(directory, item, onCollectReady) {
        const path = directory + '/' + item.name;

        fs.readFile(path, 'utf8', (error, contents) => {
            if(error) {
                console.log(error);
                onCollectReady();
                return;
            }

            if(contents) {
                const preffix = 'require(\'';
                const suffix = '\')';
                const preffixLength = preffix.length;
                const suffixLength = suffix.length;
                const contentLength = contents.length;

                let cIndex;
                let newRequireIndex;
                let requireStartIndex;
                let requireEndIndex;

                let requiredPath;
                let lineNo = 1;

                for(cIndex = 0; cIndex < contentLength; cIndex++) {
                    newRequireIndex = contents.indexOf(preffix, cIndex);

                    // Requires are not exist. Stop processin file
                    if(newRequireIndex == -1) {
                        break;
                    }

                    requireStartIndex = newRequireIndex + preffixLength;
                    requireEndIndex = contents.indexOf(suffix, requireStartIndex);

                    // Bad construction require(' without ')
                    if(requireEndIndex == -1) {
                        break;
                    }

                    lineNo += this._countLines(contents.substring(cIndex, newRequireIndex));
                    requiredPath = contents.substring(requireStartIndex, requireEndIndex);

                    // processing path
                    if(requiredPath[0] == '.'){
                        if(requiredPath[1] == '/') {
                            requiredPath = directory + '/' + requiredPath.substr(2);
                        } else if (requiredPath[1] == '.') {
                            requiredPath = mPath.normalize(directory + '/' + requiredPath);
                        }

                        if(!item.requires) {
                            item.requires = [];
                        }

                        item.requires.push({
                            path: requiredPath,
                            line: lineNo
                        });
                    }

                    cIndex = requireEndIndex + suffixLength;
                }
            }

            onCollectReady();
        });
    }

    _countLines(str) {
        return str.split(/\r\n|\r|\n/gm).length - 1;
    }
};
