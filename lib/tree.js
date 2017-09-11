const fs = require('fs');
const CDebug = require('./debug.js');
// const processHRTime = process.hrtime();

var CTree = class FsTree {

    setFileFilter(filter) {
        this.fileFilterRegExp = filter;
    }

    setFolderFilter(ignore) {
        this.dirIgnoreRegExp = ignore;
    }

    getTree(path, onGetTree) {
        let prof = new CDebug().start();
        this.getItems(path, (items) => {
            onGetTree({
                isDirectory: true,
                path: path,
                items: items
            });
        });
    }

    getItems(path, onGet) {
        this.readFolder(path + '/', (items) => {
            if(this.fileFilterRegExp) {
                items = items.filter(this.isValidItem, this);
            }

            onGet(items);
        });
    }

    isValidItem(item) {
        let stt = true;

        if(item.isFile && this.fileFilterRegExp) {
            stt = this.fileFilterRegExp.test(item.name);
        } else if(item.isDirectory && this.dirIgnoreRegExp && this.dirIgnoreRegExp.test(item.name)) {
            stt = false;
        }

        return stt;
    }

    readFolder(path, onReadFolder) {
        fs.readdir(path, (error, files) => {
            let workers = [];

            for (let i = 0; i < files.length; i++) {
                workers.push(this._getFileStatWorker(path, files[i]));
            }

            Promise.all(workers)
                .then(
                    function(result) { 
                        onReadFolder(result);
                    }, function(reason) {
                        console.log(reason);
                        // error.code == "EACCES"
                        // User does not have permissions, ignore directory
                    }
                );
        });
    }

    _getFileStatWorker(path, name) {
        return new Promise(function(resolve, reject) {
            this._getFileStat(path, name, resolve);
        }.bind(this));
    }

    _getFileStat(path, name, onFileStat) {
        let itemPath = path + name;

        fs.stat(itemPath, (error, stat) => {
            if (stat.isFile()) {
                onFileStat({
                    name: name,
                    isFile: true
                });
            } else if (stat.isDirectory()) {
                this.getItems(itemPath, (items) => {
                    onFileStat({
                        name: name,
                        isDirectory: true,
                        path: itemPath,
                        items: items
                    });
                });
            } else {
                onFileStat({
                    name: name
                });
            }
        });
    }
};

CTree.eachLeaf = function(tree, onStep) {
    
    function step(item, path) {
        if(item.isDirectory) {
            CTree.eachLeaf(item, onStep);
        } else if (item.isFile) {
            onStep(item, path);
        }
    }

    tree.items.forEach((item) => {
        step(item, tree.path);
    });
}

module.exports = CTree;
